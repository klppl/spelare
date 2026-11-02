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

function loadBackground() {
    let listener;
    let onRemoved;
    const context = vm.createContext({
        browser: {
            runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
            tabs: { onRemoved: { addListener: (fn) => { onRemoved = fn; } } },
        },
        Promise,
    });
    vm.runInContext(fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), context);
    return { listener, onRemoved };
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
