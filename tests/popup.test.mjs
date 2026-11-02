// The popup's debug view, run in a vm sandbox with a fake DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('the diagnostic log is shown as text, never parsed as HTML', async () => {
    const elements = {};
    const element = (id) => (elements[id] ??= {
        id, listeners: {}, value: '', checked: false,
        addEventListener(type, fn) { this.listeners[type] = fn; },
        dispatchEvent() {},
    });
    let onReady;
    let shown;
    const document = {
        addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') onReady = fn; },
        querySelector: (selector) => element(selector.slice(1)),
        createElement: (tag) => ({ tag, textContent: '' }),
        body: {
            replaceChildren: (...children) => { shown = children; },
            set innerHTML(html) { throw new Error(`innerHTML set: ${html}`); },
        },
    };
    const logs = ['pageObserver: <img src=x onerror=alert(1)>', 'load: https://www.youtube.com/'];
    const browser = {
        storage: { sync: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
        runtime: { sendMessage: (message) => Promise.resolve(message.type === 'get-logs' && message.tabId === 7 ? { logs } : undefined) },
        tabs: { query: () => Promise.resolve([{ id: 7 }]) },
    };
    vm.runInContext(fs.readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8'), vm.createContext({ document, browser, Event: class {}, setTimeout }));
    onReady();
    elements.showDebugInfo.listeners.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shown.length, 1);
    assert.equal(shown[0].tag, 'pre');
    assert.equal(shown[0].textContent, logs.join('\n'));
});
