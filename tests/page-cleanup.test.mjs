// The popup's "Hide" checkboxes, the settings behind them, and mac.css's rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/browser-globals.mjs';
import { applyHideSettings, HIDE_ATTRIBUTES } from '../src/content/page-cleanup.js';
import { settings, settingValue } from '../src/content/state.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('applyHideSettings sets an attribute for each hide setting that is on', () => {
    const attributes = new Set();
    const root = { toggleAttribute: (name, on) => (on ? attributes.add(name) : attributes.delete(name)) };
    const before = { ...settings };
    try {
        settings.hideShorts = true;
        settings.hideComments = true;
        applyHideSettings(root);
        assert.deepEqual([...attributes].sort(), ['data-spelare-hide-comments', 'data-spelare-hide-shorts']);
        settings.hideShorts = false;
        applyHideSettings(root);
        assert.deepEqual([...attributes], ['data-spelare-hide-comments']);
    } finally {
        Object.assign(settings, before);
    }
});

test('hide settings default to off and are stored under their own names', () => {
    for (const name of Object.keys(HIDE_ATTRIBUTES)) {
        assert.equal(settingValue(name, undefined), false, name);
        assert.equal(settingValue(name, true), true, name);
    }
});

test('the popup has a checkbox for every hide setting, and mac.css a rule for each', () => {
    const html = read('extension/popup.html');
    const popup = read('extension/popup.js');
    const css = read('extension/mac.css');
    for (const [name, attribute] of Object.entries(HIDE_ATTRIBUTES)) {
        assert.match(html, new RegExp(`<input type="checkbox" id="${name}"`), name);
        assert.ok(popup.includes(`'${name}'`), `popup.js doesn't store ${name}`);
        assert.ok(css.includes(`html[${attribute}]`), `mac.css has no rule for ${attribute}`);
    }
});
