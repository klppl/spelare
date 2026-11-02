// extension/shorts.js, run in a vm sandbox with fake navigation events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../extension/shorts.js', import.meta.url), 'utf8');

function loadShorts(href) {
    const listeners = { document: {}, window: {} };
    const replaced = [];
    const location = new URL(href);
    location.replace = (url) => replaced.push(url);
    const target = (name) => ({ addEventListener: (type, fn) => { (listeners[name][type] ??= []).push(fn); } });
    const context = vm.createContext({ location, document: target('document') });
    context.window = target('window');
    vm.runInContext(SOURCE, context);
    const fire = (name, type) => listeners[name][type]?.forEach((fn) => fn({}));
    return { location, replaced, fire, listeners };
}

test('reloads once YouTube navigates from Shorts to another page', () => {
    const shorts = loadShorts('https://www.youtube.com/shorts/abc');
    shorts.fire('document', 'yt-navigate-finish');
    assert.deepEqual(shorts.replaced, [], 'still on Shorts');
    shorts.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    shorts.fire('document', 'yt-navigate-finish');
    assert.deepEqual(shorts.replaced, ['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
});

test('reloads on back/forward away from Shorts', () => {
    const shorts = loadShorts('https://www.youtube.com/shorts/abc');
    shorts.location.href = 'https://www.youtube.com/';
    shorts.fire('window', 'popstate');
    assert.deepEqual(shorts.replaced, ['https://www.youtube.com/']);
});

test('no DOM-wide observer', () => {
    assert.doesNotMatch(SOURCE, /MutationObserver/);
});
