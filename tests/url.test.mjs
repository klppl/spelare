// URL, video-id and start-time parsing in mac.js and the page observer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMac, loadObserver } from './helpers/mac.mjs';

const mac = loadMac();
const watch = (query) => new URL(`https://www.youtube.com/watch?${query}`);

test('parseStartTime handles h/m/s, plain seconds, and missing t', () => {
    assert.equal(mac.parseStartTime(watch('v=abc&t=1h2m3s')), 3723);
    assert.equal(mac.parseStartTime(watch('v=abc&t=2m')), 120);
    assert.equal(mac.parseStartTime(watch('v=abc&t=45s')), 45);
    assert.equal(mac.parseStartTime(watch('v=abc&t=90')), 90);
    assert.equal(mac.parseStartTime(watch('t=0&v=abc')), 0);
    assert.equal(mac.parseStartTime(watch('v=abc')), -1);
    assert.equal(mac.parseStartTime(watch('v=abc&t=nonsense')), -1);
});

test('parseStartTime reads t=, then start=, and no other parameter', () => {
    assert.equal(mac.parseStartTime(watch('v=abc&start=30')), 30);
    assert.equal(mac.parseStartTime(watch('v=abc&start=30&t=10')), 10);
    assert.equal(mac.parseStartTime(watch('v=abc&list=PLt=5')), -1, 'no "t=" inside another value');
    assert.equal(mac.parseStartTime(watch('v=abc&feat=9')), -1);
    assert.equal(mac.parseStartTime(watch('v=abc&t=1h')), 3600);
    assert.equal(mac.parseStartTime(watch('v=abc&t=')), -1);
});

test('videoIdFromURL reads v= on /watch only and rejects invalid ids', () => {
    assert.equal(mac.videoIdFromURL(watch('v=dQw4w9WgXcQ&t=1')), 'dQw4w9WgXcQ');
    assert.equal(mac.videoIdFromURL(watch('list=PL1&v=dQw4w9WgXcQ')), 'dQw4w9WgXcQ');
    assert.equal(mac.videoIdFromURL(watch('av=xyz&v=dQw4w9WgXcQ')), 'dQw4w9WgXcQ', 'not fooled by a parameter ending in v');
    for (const query of ['v=ab%27cd', 'v=a<b>c', 'v=ab!cd', 'v='])
        assert.equal(mac.videoIdFromURL(watch(query)), undefined, query);
    assert.equal(mac.videoIdFromURL(new URL('https://www.youtube.com/embed/dQw4w9WgXcQ')), undefined);
    assert.equal(mac.videoIdFromURL(watch('list=PL1')), undefined);
});

test('captionTrackURL forces VTT and optionally sets tlang', () => {
    const base = 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=srv3';
    assert.equal(mac.captionTrackURL(base), 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=vtt');
    assert.equal(mac.captionTrackURL(base, 'de'), 'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=vtt&tlang=de');
});

const googlevideoCases = [
    ['https://rr1---sn-abc.googlevideo.com/videoplayback', true],
    ['https://googlevideo.com/x', true],
    ['https://manifest.googlevideo.com/api/manifest/hls_variant/x', true],
    ['http://manifest.googlevideo.com/x', false],
    ['https://evilgooglevideo.com/x', false],
    ['https://googlevideo.com.evil.com/x', false],
    ['https://www.youtube.com/x', false],
    ['not a url', false],
];

test('mac.js isGooglevideoURL accepts only https *.googlevideo.com', () => {
    for (const [url, expected] of googlevideoCases) assert.equal(mac.isGooglevideoURL(url), expected, url);
});

test('observer isGooglevideoURL agrees with mac.js (and rejects non-strings)', () => {
    const observer = loadObserver();
    for (const [url, expected] of googlevideoCases) assert.equal(observer.isGooglevideoURL(url), expected, url);
    assert.equal(observer.isGooglevideoURL(undefined), false);
});

test('observer isValidVideoId', () => {
    const { isValidVideoId } = loadObserver();
    assert.equal(isValidVideoId('dQw4w9WgXcQ'), true);
    assert.equal(isValidVideoId('a-_b'), true);
    assert.equal(isValidVideoId(''), false);
    assert.equal(isValidVideoId('x'.repeat(129)), false);
    assert.equal(isValidVideoId('ab cd'), false);
    assert.equal(isValidVideoId(null), false);
});

test('observer playerScriptURL accepts same-origin /s/player/*.js only', () => {
    const { playerScriptURL } = loadObserver({ location: new URL('https://www.youtube.com/watch?v=abc') });
    assert.equal(
        playerScriptURL('/s/player/1a2b3c/player_ias.vflset/en_US/base.js'),
        'https://www.youtube.com/s/player/1a2b3c/player_ias.vflset/en_US/base.js',
    );
    assert.equal(playerScriptURL('https://evil.com/s/player/x/base.js'), null);
    assert.equal(playerScriptURL('/s/player/x/base.css'), null);
    assert.equal(playerScriptURL('/other/base.js'), null);
    assert.equal(playerScriptURL(42), null);
});

test('observer currentVideoId validates, like mac.js', () => {
    const observer = loadObserver({ location: new URL('https://www.youtube.com/watch?v=ab%27cd') });
    assert.equal(observer.currentVideoId(), null);
    const ok = loadObserver({ location: new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ') });
    assert.equal(ok.currentVideoId(), 'dQw4w9WgXcQ');
});
