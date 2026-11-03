// Debug log batching (src/content/log.js) and its receiving end in background.js.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './helpers/browser-globals.mjs';

const sent = [];
globalThis.browser.runtime.sendMessage = (message) => { sent.push(message); return Promise.resolve(); };
const { log, flushLog } = await import('../src/content/log.js');

test('log calls are sent as one batch, copied when logged', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        sent.length = 0;
        const settings = { quality: 'auto' };
        log('loadSettings', settings);
        settings.quality = '1080';
        log('seekTo:', 30);
        assert.equal(sent.length, 0);
        mock.timers.tick(250);
        assert.deepEqual(sent, [{ type: 'debug-log', entries: [['loadSettings', { quality: 'auto' }], ['seekTo:', 30]] }]);
        mock.timers.tick(1000);
        assert.equal(sent.length, 1, 'nothing more to send');
        log('x', () => {});
        flushLog();
        assert.deepEqual(sent[1].entries, [['x', '() => {}']], 'uncloneable args are stringified');
    } finally {
        mock.timers.reset();
    }
});

function loadBackground({ session } = {}) {
    let listener;
    let onRemoved;
    const context = vm.createContext({
        browser: {
            runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
            tabs: { onRemoved: { addListener: (fn) => { onRemoved = fn; } } },
            action: {
                setBadgeText: (details) => actions.push(['badge', details]),
                setTitle: (details) => actions.push(['title', details]),
            },
            storage: {
                local: { get: async () => ({ icloudSync: false }), set: async () => {} },
                onChanged: { addListener: () => {} },
                session,
            },
        },
        Promise,
        console,
        setTimeout,
        clearTimeout,
        Date,
        JSON,
    });
    const actions = [];
    vm.runInContext(fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), context);
    return { listener, onRemoved, actions };
}

test('background.js records every entry of a batch', async () => {
    const { listener } = loadBackground();
    listener({ type: 'debug-log', entries: [['load:', 'https://www.youtube.com/'], ['seekTo:', 30]] }, { tab: { id: 1 } });
    const { logs } = await listener({ type: 'get-logs', tabId: 1 }, {});
    assert.deepEqual([...logs], ['load: https://www.youtube.com/', 'seekTo: 30']);
});

test('background.js keeps a log per tab, cleared by that tab and when it closes', async () => {
    const { listener, onRemoved } = loadBackground();
    const logsOf = async (tabId) => [...(await listener({ type: 'get-logs', tabId }, {})).logs];
    listener({ type: 'debug-log', entries: [['one']] }, { tab: { id: 1 } });
    listener({ type: 'debug-log', entries: [['two']] }, { tab: { id: 2 } });
    assert.deepEqual(await logsOf(1), ['one']);
    assert.deepEqual(await logsOf(2), ['two']);
    listener({ type: 'clear-logs' }, { tab: { id: 2 } });
    assert.deepEqual(await logsOf(1), ['one'], 'another tab loading a page leaves this log alone');
    assert.deepEqual(await logsOf(2), []);
    onRemoved(1);
    assert.deepEqual(await logsOf(1), []);
    assert.deepEqual(await logsOf(undefined), [], 'no tab, no log');
});

// A storage.session stand-in that outlives one background page.
function fakeSession() {
    const data = {};
    return {
        data,
        get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: async (values) => { for (const [key, value] of Object.entries(values)) data[key] = structuredClone(value); },
        remove: async (key) => { delete data[key]; },
    };
}

test('background.js keeps the log in storage.session, so it survives an unload', async () => {
    const session = fakeSession();
    const first = loadBackground({ session });
    first.listener({ type: 'debug-log', entries: [['one']] }, { tab: { id: 3 } });
    first.listener({ type: 'debug-log', entries: [['two', 2]] }, { tab: { id: 3 } });
    assert.deepEqual([...(await first.listener({ type: 'get-logs', tabId: 3 }, {})).logs], ['one', 'two 2']);
    const second = loadBackground({ session });
    assert.deepEqual([...(await second.listener({ type: 'get-logs', tabId: 3 }, {})).logs], ['one', 'two 2'], 'a reloaded background page reads it back');
    second.listener({ type: 'debug-log', entries: Array.from({ length: 120 }, (_, i) => [i]) }, { tab: { id: 3 } });
    const { logs } = await second.listener({ type: 'get-logs', tabId: 3 }, {});
    assert.equal(logs.length, 100);
    assert.equal(logs.at(-1), '119');
    second.listener({ type: 'clear-logs' }, { tab: { id: 3 } });
    await second.listener({ type: 'get-logs', tabId: 3 }, {});
    assert.deepEqual(Object.keys(session.data), []);
});

test('background.js shows each tab\'s player state on the toolbar button, kept short', () => {
    const { listener, actions } = loadBackground();
    listener({ type: 'player-state', text: '1080', title: 'Spelare is playing this video (1080p)' }, { tab: { id: 4 } });
    listener({ type: 'player-state', text: 'way too long', title: 'x'.repeat(500) }, { tab: { id: 5 } });
    listener({ type: 'player-state', text: 42, title: 'bad' }, { tab: { id: 6 } });
    listener({ type: 'player-state', text: '!', title: 'no tab' }, {});
    assert.deepEqual(JSON.parse(JSON.stringify(actions)), [
        ['badge', { tabId: 4, text: '1080' }],
        ['title', { tabId: 4, title: 'Spelare is playing this video (1080p)' }],
        ['badge', { tabId: 5, text: 'way ' }],
        ['title', { tabId: 5, title: 'x'.repeat(200) }],
    ]);
});
