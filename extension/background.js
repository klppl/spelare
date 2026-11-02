// The debug log behind the popup's "Show diagnostic log": the last 100 entries
// from content scripts, kept per tab and cleared when the tab loads a page.
// It lives in memory, so it's gone if Safari unloads this background page.
const MAX_ENTRIES = 100;
const logsByTab = new Map();

function addLog(tabId, args) {
    const strings = args.map((arg) => {
        try {
            return JSON.stringify(arg).replace(/^"(.+)"$/, '$1');
        } catch {
            return String(arg);
        }
    });

    let logs = logsByTab.get(tabId);
    if (!logs) {
        logs = [];
        logsByTab.set(tabId, logs);
    }
    logs.push(strings.join(' '));

    if (logs.length > MAX_ENTRIES) logs.shift();
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
        for (const args of request.entries) addLog(tabId, args);
    } else if (request.type === 'clear-logs') {
        logsByTab.delete(tabId);
    } else if (request.type === 'player-state') {
        showPlayerState(tabId, request);
    } else if (request.type === 'get-logs') {
        // The popup asks for the log of the tab it was opened over.
        return Promise.resolve({ logs: logsByTab.get(request.tabId) ?? [] });
    }
});

browser.tabs?.onRemoved.addListener((tabId) => {
    logsByTab.delete(tabId);
});
