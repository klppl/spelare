// Naming conventions that span files: DOM attributes, runtime messages and globals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SHIPPED = ['extension/mac.js', 'extension/observer.js', 'extension/mac.css', 'extension/background.js', 'extension/popup.js', 'extension/shorts.js'];

test('Spelare DOM attributes are data-spelare-*, with no legacy names left', () => {
    const legacy = /(?<![\w-])(tubeless(ed)?(-once)?|tubeless-fallback|tubeless-container|notoolbar|data-quality)(?![\w-])/;
    for (const file of SHIPPED.filter((file) => file !== 'extension/background.js')) {
        assert.doesNotMatch(read(file), legacy, file);
    }
});

test('every data-spelare-* attribute mac.css styles is one the scripts set', () => {
    const css = read('extension/mac.css');
    const scripts = read('extension/mac.js');
    const styled = new Set([...css.matchAll(/\[(data-spelare-[a-z-]+)\]/g)].map((m) => m[1]));
    assert.ok(styled.size >= 3);
    for (const attribute of styled) assert.ok(scripts.includes(attribute), `${attribute} is never set`);
});

test('runtime messages are { type: "kebab-case" }, matching what background.js handles', () => {
    const sentTypes = new Set();
    for (const file of ['extension/mac.js', 'extension/popup.js']) {
        const source = read(file);
        assert.doesNotMatch(source, /sendMessage\(\{\s*message:/, file);
        for (const m of source.matchAll(/sendMessage\(\{\s*type:\s*["']([^"']+)["']/g)) sentTypes.add(m[1]);
    }
    assert.deepEqual([...sentTypes].sort(), ['clear-logs', 'debug-log', 'get-logs', 'player-state']);
    const handled = new Set([...read('extension/background.js').matchAll(/request\.type === '([^']+)'/g)].map((m) => m[1]));
    for (const type of [...sentTypes, ...handled]) assert.match(type, /^[a-z]+(-[a-z]+)*$/);
    for (const type of sentTypes) assert.ok(handled.has(type), `background.js doesn't handle ${type}`);
});

test('install guards share one window.__spelare namespace', async () => {
    await import('./helpers/browser-globals.mjs');
    const { claimInstall } = await import('../src/shared/namespace.js');
    assert.equal(claimInstall('example'), true);
    assert.equal(claimInstall('example'), false);
    assert.equal(window.__spelare.example, true);
    assert.throws(() => { 'use strict'; window.__spelare = {}; }, TypeError);
    for (const file of ['extension/mac.js', 'extension/observer.js']) {
        const source = read(file);
        assert.doesNotMatch(source, /SPELARED|TUBELESSED|__spelare(Player\w*)?Installed|__tubeless(Player\w*)?Installed/, file);
        const globals = new Set(source.match(/__(?:spelare|tubeless)\w*/g));
        for (const name of globals) assert.ok(['__spelare', '__tubelessJSC'].includes(name), `${file}: unexpected global ${name}`);
    }
});

test('background.js uses no tab or native APIs, and needs only storage', () => {
    const background = read('extension/background.js');
    assert.doesNotMatch(background, /sendNativeMessage|insertCSS|tabs\./);
    assert.deepEqual(JSON.parse(read('extension/manifest.json')).permissions, ['storage']);
});
