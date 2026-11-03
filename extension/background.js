// The debug log behind the popup's "Show diagnostic log": the last 100 entries
// from content scripts, kept per tab and cleared when the tab loads a page.
// Safari unloads this background page when it's idle (always on iOS), so the
// log is kept in storage.session, with the copy in memory as a cache.
const MAX_ENTRIES = 100;
const logsByTab = new Map();
const sessionStore = browser.storage?.session;
const logKey = (tabId) => `log:${tabId}`;
// Log updates run one at a time, so two batches can't overwrite each other.
let logQueue = Promise.resolve();

async function readLog(tabId) {
    if (logsByTab.has(tabId)) return logsByTab.get(tabId);
    if (!sessionStore) return [];
    const stored = (await sessionStore.get(logKey(tabId)))[logKey(tabId)];
    return Array.isArray(stored) ? stored : [];
}

// `change` gets the tab's log and returns the new one, or null to delete it.
function updateLog(tabId, change) {
    logQueue = logQueue
        .then(async () => {
            const logs = change(await readLog(tabId));
            if (logs) logsByTab.set(tabId, logs);
            else logsByTab.delete(tabId);
            if (!sessionStore) return;
            if (logs) await sessionStore.set({ [logKey(tabId)]: logs });
            else await sessionStore.remove(logKey(tabId));
        })
        .catch((error) => console.log('Spelare: log update failed:', error?.message || error));
    return logQueue;
}

function addLogs(tabId, entries) {
    const lines = entries.map((args) => args.map((arg) => {
        try {
            return JSON.stringify(arg).replace(/^"(.+)"$/, '$1');
        } catch {
            return String(arg);
        }
    }).join(' '));
    updateLog(tabId, (logs) => [...logs, ...lines].slice(-MAX_ENTRIES));
}

// The toolbar button's badge and tooltip for one tab, as the tab's content
// script reports what's playing (src/content/player-state.js). Values come
// from the page's content script, so they're checked and kept short.
function showPlayerState(tabId, { text, title }) {
    if (tabId < 0 || typeof text !== 'string' || typeof title !== 'string') return;
    browser.action.setBadgeText({ tabId, text: text.slice(0, 4) });
    browser.action.setTitle({ tabId, title: title.slice(0, 200) });
}

// Runtime messages are { type: 'kebab-case', ...fields }, like the page messages.
browser.runtime.onMessage.addListener((request, sender) => {
    const tabId = sender?.tab?.id ?? -1;
    if (request.type === 'debug-log') {
        // Content scripts send batches of entries, each an array of log() args.
        if (Array.isArray(request.entries)) addLogs(tabId, request.entries);
    } else if (request.type === 'clear-logs') {
        updateLog(tabId, () => null);
        // A YouTube page loaded: a good moment to pick up other devices' changes.
        pullFromICloud();
    } else if (request.type === 'player-state') {
        showPlayerState(tabId, request);
    } else if (request.type === 'icloud-pull') {
        // The popup opened: show what other devices changed.
        return pullFromICloud({ force: true });
    } else if (request.type === 'get-logs') {
        // The popup asks for the log of the tab it was opened over.
        return logQueue.then(() => readLog(request.tabId)).then((logs) => ({ logs }));
    }
});

browser.tabs?.onRemoved.addListener((tabId) => {
    updateLog(tabId, () => null);
});

// iCloud sync. The extension's native handler keeps values in iCloud's
// key-value store (SafariWebExtensionHandler.swift). The popup's settings
// (storage.sync, which Safari doesn't sync itself), per-channel speeds and
// resume positions go to iCloud a few seconds after they change, and come
// back from it when Safari starts, when a YouTube page loads (at most once a
// minute) and when the popup opens. Volume stays per device. "Sync with
// iCloud" in the popup (icloudSync in storage.local) turns it off.
const SYNCED_LOCAL_KEYS = ['speedByChannel', 'resumePositions'];
const PULL_EVERY_MS = 60_000;
const PUSH_DELAY_MS = 3000;
// "area:key" → the JSON last sent to or taken from iCloud, so a value that
// came from iCloud isn't sent straight back.
const lastSynced = new Map();
let pendingPush = {};
let pushTimer = null;
let lastPull = 0;

function isSyncedKey(area, key) {
    return area === 'sync' || (area === 'local' && SYNCED_LOCAL_KEYS.includes(key));
}

async function iCloudSyncOn() {
    const { icloudSync } = await browser.storage.local.get('icloudSync');
    return icloudSync !== false;
}

function sendNative(message) {
    // Safari routes this to the extension's own native handler.
    return browser.runtime.sendNativeMessage('dev.klippelism.spelare', message);
}

// Maps (speeds, positions) keep entries from both devices; iCloud's wins
// where both have one, since it holds the most recently sent value.
function mergedValue(key, local, remote) {
    if (!SYNCED_LOCAL_KEYS.includes(key)) return remote;
    const object = (value) => (value && typeof value === 'object' ? value : {});
    return { ...object(local), ...object(remote) };
}

function queuePush(area, key, value) {
    const id = `${area}:${key}`;
    const json = JSON.stringify(value ?? null);
    if (lastSynced.get(id) === json) return;
    pendingPush[id] = json;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushToICloud, PUSH_DELAY_MS);
}

async function pushToICloud() {
    const values = pendingPush;
    pendingPush = {};
    if (Object.keys(values).length === 0 || !(await iCloudSyncOn())) return;
    try {
        await sendNative({ type: 'icloud-set', values });
        for (const [id, json] of Object.entries(values)) lastSynced.set(id, json);
    } catch (error) {
        console.log('Spelare: iCloud push failed:', error?.message || error);
    }
}

async function pullFromICloud({ force = false } = {}) {
    if (!force && Date.now() - lastPull < PULL_EVERY_MS) return;
    lastPull = Date.now();
    if (!(await iCloudSyncOn())) return;
    let reply;
    try {
        reply = await sendNative({ type: 'icloud-get' });
    } catch (error) {
        console.log('Spelare: iCloud pull failed:', error?.message || error);
        return;
    }
    for (const [id, json] of Object.entries(reply?.values ?? {})) {
        const split = id.indexOf(':');
        const area = id.slice(0, split);
        const key = id.slice(split + 1);
        if (!isSyncedKey(area, key)) continue;
        let remote;
        try {
            remote = JSON.parse(json);
        } catch {
            continue;
        }
        lastSynced.set(id, json);
        const local = (await browser.storage[area].get(key))[key];
        const next = mergedValue(key, local, remote);
        if (JSON.stringify(next) !== JSON.stringify(local ?? null))
            await browser.storage[area].set({ [key]: next });
    }
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'icloudSync' in changes && changes.icloudSync.newValue !== false)
        pullFromICloud({ force: true });
    for (const [key, { newValue }] of Object.entries(changes))
        if (isSyncedKey(area, key)) queuePush(area, key, newValue);
});

pullFromICloud({ force: true });
