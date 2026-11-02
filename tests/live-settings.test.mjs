// Caption choice, settings applied without a reload, remembered volume and
// speed, and the q / Shift-Q quality shortcut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './helpers/browser-globals.mjs';
import { captionTrackToShow } from '../src/content/captions.js';
import { listenForSettingChanges, settings, settingValue } from '../src/content/state.js';
import { validPrefs } from '../src/content/playback-prefs.js';
import { nextQuality } from '../src/content/toolbar.js';

const LABELS = ['English', 'German', 'Auto-translated (Swedish)'];

test('captionTrackToShow applies the default only until something is chosen', () => {
    assert.equal(captionTrackToShow(undefined, LABELS, true), 'Auto-translated (Swedish)');
    assert.equal(captionTrackToShow(undefined, LABELS, false), null);
    assert.equal(captionTrackToShow(null, LABELS, true), null, 'turned off stays off, even with the default on');
    assert.equal(captionTrackToShow('German', LABELS, true), 'German');
    assert.equal(captionTrackToShow('Auto-translated (French)', LABELS, false), 'Auto-translated (Swedish)', 'translation language changed');
    assert.equal(captionTrackToShow(undefined, ['English'], true), null, 'no auto-translated track');
});

test('settingValue maps stored values like loadSettings did', () => {
    assert.equal(settingValue('quality', undefined), 'auto');
    assert.equal(settingValue('quality', 'highres'), 'auto');
    assert.equal(settingValue('quality', '720p'), '720p');
    assert.equal(settingValue('translationLanguage', 'jp'), 'ja');
    assert.equal(settingValue('showToolbar', undefined), true);
    assert.equal(settingValue('showToolbar', false), false);
});

test('listenForSettingChanges updates settings and reports what changed', () => {
    let listener;
    globalThis.browser.storage.onChanged = { addListener: (fn) => { listener = fn; } };
    const changed = [];
    listenForSettingChanges((name) => changed.push(name));
    const before = { ...settings };
    try {
        listener({ showToolbar: { newValue: !settings.showToolbar } }, 'sync');
        assert.deepEqual(changed, ['showToolbar']);
        assert.equal(settings.showToolbar, !before.showToolbar);
        listener({ subtitles: { newValue: 'jp' } }, 'sync');
        assert.equal(settings.translationLanguage, 'ja');
        listener({ subtitles: { newValue: 'ja' } }, 'sync');
        assert.deepEqual(changed, ['showToolbar', 'translationLanguage'], 'unchanged values are not reported');
        listener({ volume: { newValue: 0.5 } }, 'local');
        listener({ autoplay: { newValue: true } }, 'local');
        assert.equal(changed.length, 2, 'only sync storage holds settings');
    } finally {
        Object.assign(settings, before);
    }
});

test('validPrefs accepts only volumes and speeds Spelare could have saved', () => {
    assert.deepEqual(validPrefs({ volume: 0.4, playbackRate: 1.5 }), { volume: 0.4, playbackRate: 1.5 });
    assert.deepEqual(validPrefs({}), { volume: 1, playbackRate: 1 });
    assert.deepEqual(validPrefs({ volume: 7, playbackRate: 16 }), { volume: 1, playbackRate: 1 });
    assert.deepEqual(validPrefs({ volume: '0.5', playbackRate: NaN }), { volume: 1, playbackRate: 1 });
    assert.deepEqual(validPrefs(undefined), { volume: 1, playbackRate: 1 });
});

test('nextQuality cycles through Auto and the video\'s qualities, skipping Sound only', () => {
    const available = ['auto', '360p', '720p', '1080p', 'audio'];
    assert.equal(nextQuality('auto', available, 1), '360p');
    assert.equal(nextQuality('720p', available, 1), '1080p');
    assert.equal(nextQuality('1080p', available, 1), 'auto', 'wraps around');
    assert.equal(nextQuality('auto', available, -1), '1080p');
    assert.equal(nextQuality('audio', available, 1), 'auto');
    assert.equal(nextQuality('audio', available, -1), '1080p');
    assert.equal(nextQuality('auto', [], 1), null);
});

test('the popup asks its tab to play a quality the user picks, not the one it opens with', async () => {
    const elements = {};
    const element = (id) => (elements[id] ??= {
        id, listeners: {}, value: '', checked: false,
        addEventListener(type, fn) { this.listeners[type] = fn; },
        dispatchEvent() {},
    });
    let onReady;
    const sent = [];
    const browser = {
        storage: { sync: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
        runtime: { sendMessage: () => Promise.resolve() },
        tabs: {
            query: () => Promise.resolve([{ id: 3 }]),
            sendMessage: (tabId, message) => { sent.push([tabId, message]); return Promise.resolve(); },
        },
    };
    const document = {
        addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') onReady = fn; },
        querySelector: (selector) => element(selector.slice(1)),
    };
    vm.runInContext(fs.readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8'), vm.createContext({ document, browser, Event: class {} }));
    onReady();
    await new Promise((resolve) => setImmediate(resolve)); // stored settings shown
    elements.quality.value = '720p';
    elements.quality.listeners.change({ isTrusted: false });
    elements.quality.listeners.change({ isTrusted: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [[3, { type: 'apply-quality', quality: '720p' }]]);
});
