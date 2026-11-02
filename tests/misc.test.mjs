// Language names, settings defaults, caches and request shapes in mac.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadMac, plain } from './helpers/mac.mjs';
import { isSameLanguage } from '../src/content/languages.js';

test('languageName handles legacy and regional codes', () => {
    const { languageName } = loadMac();
    assert.equal(languageName('en'), 'English');
    assert.equal(languageName('en-US'), 'English');
    assert.equal(languageName('zh-Hans'), 'Chinese');
    assert.equal(languageName('iw'), 'Hebrew');
    assert.equal(languageName('he'), 'Hebrew');
    assert.equal(languageName('tl'), 'Filipino');
    assert.equal(languageName('fil'), 'Filipino');
    assert.equal(languageName('nb'), 'Norwegian');
    assert.equal(languageName('ja'), 'Japanese');
    assert.equal(languageName('jp'), 'Japanese');
    assert.equal(languageName('qq'), 'System');
});

test('languageName uses standard English names (fixes "Sudanese", adds the macron in Māori)', () => {
    const { languageName } = loadMac();
    assert.equal(languageName('su'), 'Sundanese');
    assert.equal(languageName('mi'), 'Māori');
    assert.equal(languageName('nn'), 'Norwegian');
    assert.equal(languageName('pt-BR'), 'Portuguese');
    assert.equal(languageName('not a language tag'), 'System');
});

test('isSameLanguage compares base languages, folding legacy and Norwegian codes', () => {
    assert.ok(isSameLanguage('en', 'en-US'));
    assert.ok(isSameLanguage('zh-Hans', 'zh-Hant'));
    assert.ok(isSameLanguage('iw', 'he'));
    assert.ok(isSameLanguage('jp', 'ja'));
    assert.ok(isSameLanguage('nb', 'no'));
    assert.ok(!isSameLanguage('en', 'de'));
    assert.ok(!isSameLanguage('pt', 'es'));
    assert.ok(!isSameLanguage('???', '???'));
});

test('languageName distinguishes three-letter codes from their two-letter prefixes', () => {
    const { languageName } = loadMac();
    assert.equal(languageName('haw'), 'Hawaiian');
    assert.equal(languageName('ha'), 'Hausa');
    assert.equal(languageName('ceb'), 'Cebuano');
    assert.equal(languageName('hmn'), 'Hmong');
});

test('languageName knows every language offered in the popup', () => {
    const { languageName } = loadMac();
    const html = fs.readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
    const select = html.slice(html.indexOf('id="subtitles"'), html.indexOf('</select>', html.indexOf('id="subtitles"')));
    const codes = [...select.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]).filter((c) => c !== 'system');
    assert.ok(codes.length > 90, `expected the full language list, got ${codes.length}`);
    const unknown = codes.filter((code) => languageName(code) === 'System');
    assert.deepEqual(unknown, []);
});

test('settings defaults', () => {
    assert.deepEqual(plain(loadMac().settings), {
        autoplay: false,
        quality: 'auto',
        showToolbar: true,
        evenLoudness: true,
        captionsOnByDefault: false,
        translationLanguage: 'system',
        hideShorts: false,
        hideEndScreens: false,
        hideComments: false,
        hideRecommendations: false,
    });
});

test('audio stream cache keeps at most 8 videos, evicting the oldest', () => {
    const mac = loadMac();
    const first = mac.audioStreamEntry('video0');
    assert.equal(mac.audioStreamEntry('video0'), first, 'same id returns the same entry');
    for (let i = 1; i <= 8; i += 1) mac.audioStreamEntry(`video${i}`);
    assert.equal(mac.audioStreamCache.size, 8);
    assert.ok(!mac.audioStreamCache.has('video0'));
    assert.ok(mac.audioStreamCache.has('video8'));
    assert.equal(first.started, false);
    assert.equal(first.url, null);
});

test('waitForEvent resolves with the event name, or "timeout"', async () => {
    const { waitForEvent } = loadMac();
    const target = new EventTarget();
    const pending = waitForEvent(target, 'seeked', 1000);
    target.dispatchEvent(new Event('seeked'));
    assert.equal(await pending, 'seeked');
    assert.equal(await waitForEvent(new EventTarget(), 'seeked', 10), 'timeout');
});

test('android caption request uses the pinned ANDROID client', () => {
    const body = plain(loadMac().androidPlayerRequest('dQw4w9WgXcQ'));
    assert.deepEqual(body, {
        context: {
            client: {
                clientName: 'ANDROID',
                clientVersion: '20.10.38',
                androidSdkVersion: 30,
                userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
                osName: 'Android',
                osVersion: '11',
                hl: 'en',
                timeZone: 'UTC',
                utcOffsetMinutes: 0,
            },
        },
        videoId: 'dQw4w9WgXcQ',
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        contentCheckOk: true,
        racyCheckOk: true,
    });
});

test('loadSettings reads the popup\'s storage keys into the settings names', async () => {
    const { loadSettings } = await import('../src/content/state.js');
    const { settings } = loadMac();
    const saved = { ...settings };
    const get = globalThis.browser.storage.sync.get;
    let requested;
    globalThis.browser.storage.sync.get = async (keys) => {
        requested = keys;
        return { autoplay: true, quality: '', showToolbar: false, showCaption: true, subtitles: 'de', hideShorts: true };
    };
    try {
        await loadSettings();
        assert.deepEqual([...requested].sort(), [
            'autoplay', 'evenLoudness', 'hideComments', 'hideEndScreens', 'hideRecommendations', 'hideShorts',
            'quality', 'showCaption', 'showToolbar', 'subtitles',
        ]);
        assert.deepEqual(plain(settings), {
            autoplay: true,
            quality: 'auto',
            showToolbar: false,
            evenLoudness: true,
            captionsOnByDefault: true,
            translationLanguage: 'de',
            hideShorts: true,
            hideEndScreens: false,
            hideComments: false,
            hideRecommendations: false,
        });
    } finally {
        globalThis.browser.storage.sync.get = get;
        Object.assign(settings, saved);
    }
});

test('loadSettings maps values older popups stored (highres, jp)', async () => {
    const { loadSettings } = await import('../src/content/state.js');
    const { settings } = loadMac();
    const saved = { ...settings };
    const get = globalThis.browser.storage.sync.get;
    globalThis.browser.storage.sync.get = async () => ({ quality: 'highres', subtitles: 'jp' });
    try {
        await loadSettings();
        assert.equal(settings.quality, 'auto');
        assert.equal(settings.translationLanguage, 'ja');
    } finally {
        globalThis.browser.storage.sync.get = get;
        Object.assign(settings, saved);
    }
});

test('the popup offers ja, not jp, and maps a stored jp and highres', () => {
    const html = fs.readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
    assert.match(html, /<option value="ja">Japanese<\/option>/);
    assert.doesNotMatch(html, /value="(jp|highres)"/);
    const popup = fs.readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
    assert.match(popup, /results\.subtitles === 'jp' \? 'ja'/);
    assert.match(popup, /results\.quality === 'highres' \? 'auto'/);
});
