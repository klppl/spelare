// Helpers shared by the content script and the page observer (src/shared/),
// plus content-side helpers that replaced duplicated code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import { isAllowedHost, isGooglevideoURL, isYouTubeURL } from '../src/shared/hosts.js';
import { isValidVideoId } from '../src/shared/video-id.js';
import { pollFor } from '../src/shared/poll.js';
import { setBounded } from '../src/content/bounded-map.js';
import { fetchManifest } from '../src/content/streams.js';

test('isAllowedHost: https only, exact domain or a subdomain', () => {
    const cases = [
        ['https://rr1---sn-abc.googlevideo.com/videoplayback', 'googlevideo.com', true],
        ['https://googlevideo.com/x', 'googlevideo.com', true],
        ['http://manifest.googlevideo.com/x', 'googlevideo.com', false],
        ['https://evilgooglevideo.com/x', 'googlevideo.com', false],
        ['https://googlevideo.com.evil.com/x', 'googlevideo.com', false],
        ['https://www.youtube.com/api/timedtext', 'youtube.com', true],
        ['https://youtube.com/x', 'youtube.com', true],
        ['https://notyoutube.com/x', 'youtube.com', false],
        ['not a url', 'youtube.com', false],
        [undefined, 'youtube.com', false],
        [new URL('https://www.youtube.com/'), 'youtube.com', false],
    ];
    for (const [url, domain, expected] of cases) assert.equal(isAllowedHost(url, domain), expected, `${url} on ${domain}`);
    assert.equal(isGooglevideoURL('https://a.googlevideo.com/'), true);
    assert.equal(isYouTubeURL('https://www.youtube.com/'), true);
    assert.equal(isYouTubeURL('https://a.googlevideo.com/'), false);
});

test('isValidVideoId', () => {
    assert.equal(isValidVideoId('dQw4w9WgXcQ'), true);
    assert.equal(isValidVideoId('a-_b'), true);
    assert.equal(isValidVideoId(''), false);
    assert.equal(isValidVideoId('x'.repeat(128)), true);
    assert.equal(isValidVideoId('x'.repeat(129)), false);
    assert.equal(isValidVideoId('ab cd'), false);
    assert.equal(isValidVideoId(null), false);
});

test('setBounded keeps the newest entries and refreshes nothing on overwrite', () => {
    const map = new Map();
    for (let i = 0; i < 10; i += 1) setBounded(map, `k${i}`, i, 8);
    assert.deepEqual([...map.keys()], ['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
    setBounded(map, 'k5', 'new', 8);
    assert.equal(map.get('k5'), 'new');
    assert.equal(map.size, 8);
});

test('pollFor returns the first truthy probe result, sleeping only between attempts', async () => {
    let calls = 0;
    const started = Date.now();
    assert.equal(await pollFor(() => (++calls === 3 ? 'ready' : null), { attempts: 5, intervalMs: 10 }), 'ready');
    assert.equal(calls, 3);
    calls = 0;
    assert.equal(await pollFor(() => { calls += 1; return null; }, { attempts: 4, intervalMs: 10 }), null);
    assert.equal(calls, 4);
    assert.ok(Date.now() - started < 200);
});

test('pollFor stops early, with null, once isCurrent() turns false', async () => {
    let current = true;
    let calls = 0;
    const result = await pollFor(() => { calls += 1; current = false; return null; }, { attempts: 5, intervalMs: 1, isCurrent: () => current });
    assert.equal(result, null);
    assert.equal(calls, 1);
});

test('fetchManifest returns the text, and rejects HTTP errors and oversized manifests', async () => {
    const realFetch = globalThis.fetch;
    const calls = [];
    try {
        globalThis.fetch = async (url, options) => {
            calls.push([url, options]);
            if (url.endsWith('/404')) return { ok: false, status: 404 };
            if (url.endsWith('/huge')) return { ok: true, text: async () => 'x'.repeat(1_000_001) };
            return { ok: true, text: async () => '#EXTM3U' };
        };
        assert.equal(await fetchManifest('https://a.googlevideo.com/ok', 'Video'), '#EXTM3U');
        assert.deepEqual(calls[0][1], { credentials: 'omit' });
        await assert.rejects(fetchManifest('https://a.googlevideo.com/404', 'Audio'), { message: 'Audio manifest request failed (HTTP 404).' });
        await assert.rejects(fetchManifest('https://a.googlevideo.com/huge', 'Video'), { message: 'Video manifest is over 1 MB, so it was skipped.' });
    } finally {
        globalThis.fetch = realFetch;
    }
});
