// Characterization tests for HLS master-playlist rewriting in mac.js.
// Fixtures are synthetic but follow YouTube's manifest shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadMac, decodePlaylist } from './helpers/mac.mjs';

const mac = loadMac();
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}.m3u8`, import.meta.url), 'utf8').split('\n');
const single = fixture('single-audio');
const multi = fixture('multi-audio');

const variants = (lines) => lines.filter((line) => line.startsWith('#EXT-X-STREAM-INF'));
const audio = (lines) => lines.filter((line) => line.startsWith('#EXT-X-MEDIA') && line.includes('TYPE=AUDIO'));
const itagPaths = (lines) => lines.filter((line) => line.startsWith('https://')).map((url) => url.split('/id/')[1]);

test('auto keeps every variant, drops subtitle renditions, and replaces SUBTITLES with CLOSED-CAPTIONS=NONE', () => {
    const out = decodePlaylist(mac.rewritePlaylist(single));
    assert.deepEqual(out.slice(0, 2), ['#EXTM3U', '#EXT-X-INDEPENDENT-SEGMENTS']);
    assert.equal(audio(out).length, 2);
    assert.ok(!out.some((line) => line.includes('TYPE=SUBTITLES')));
    assert.equal(variants(out).length, 5);
    for (const line of variants(out)) {
        assert.ok(line.endsWith(',CLOSED-CAPTIONS=NONE'), line);
        assert.ok(!line.includes('SUBTITLES='), line);
    }
    // Each variant is still followed by its own URI.
    assert.deepEqual(itagPaths(out), [
        'abc/itag/269/playlist/index.m3u8',
        'abc/itag/230/playlist/index.m3u8',
        'abc/itag/232/playlist/index.m3u8',
        'abc/itag/270/playlist/index.m3u8',
        'abc/itag/614/playlist/index.m3u8',
    ]);
});

test('a resolution width keeps only variants of that width', () => {
    const out = decodePlaylist(mac.rewritePlaylist(single, '1920'));
    assert.equal(variants(out).length, 2);
    assert.ok(variants(out).every((line) => line.includes('RESOLUTION=1920x1080')));
    assert.deepEqual(itagPaths(out), ['abc/itag/270/playlist/index.m3u8', 'abc/itag/614/playlist/index.m3u8']);
});

test('a resolution with no variants returns false', () => {
    assert.equal(mac.rewritePlaylist(single, '854'), false);
    assert.equal(mac.rewritePlaylist(single, '3840'), false);
});

test('output is a base64 HLS data URL', () => {
    assert.match(mac.rewritePlaylist(single, '1280'), /^data:application\/vnd\.apple\.mpegURL;base64,[A-Za-z0-9+/=]+$/);
});

test('multi-audio: dubbed audio renditions are removed, original ones kept', () => {
    const out = decodePlaylist(mac.rewritePlaylist(multi));
    const groups = audio(out).map((line) => line.match(/GROUP-ID="([^"]+)"/)[1]);
    assert.deepEqual(groups, ['233', '234']);
});

test('multi-audio: where an original variant exists at a resolution, non-original variants there are dropped', () => {
    const out = decodePlaylist(mac.rewritePlaylist(multi, '1280'));
    assert.deepEqual(itagPaths(out), ['def/itag/232/aud/orig/playlist/index.m3u8']);
});

test('multi-audio: a resolution without an original variant keeps unmarked variants', () => {
    const out = decodePlaylist(mac.rewritePlaylist(multi, '854'));
    assert.deepEqual(itagPaths(out), ['def/itag/231/aud/plain/playlist/index.m3u8']);
});

test('multi-audio auto: one variant per resolution, original audio only', () => {
    const out = decodePlaylist(mac.rewritePlaylist(multi));
    assert.deepEqual(itagPaths(out), [
        'def/itag/230/aud/orig/playlist/index.m3u8',
        'def/itag/232/aud/orig/playlist/index.m3u8',
        'def/itag/231/aud/plain/playlist/index.m3u8',
    ]);
});

test('pickAudioRendition prefers itag 234 over the DEFAULT=YES rendition', () => {
    assert.equal(
        mac.pickAudioRendition(single),
        'https://manifest.googlevideo.com/api/manifest/hls_playlist/id/abc/itag/234/playlist/index.m3u8',
    );
});

test('pickAudioRendition never picks a dubbed track and prefers original', () => {
    assert.equal(
        mac.pickAudioRendition(multi),
        'https://manifest.googlevideo.com/api/manifest/hls_playlist/id/def/itag/234/xtags/orig/playlist/index.m3u8',
    );
});

test('pickAudioRendition falls back to the default when no 234 exists', () => {
    const lines = [
        '#EXT-X-MEDIA:URI="https://a.googlevideo.com/itag/233/x",TYPE=AUDIO,DEFAULT=NO',
        '#EXT-X-MEDIA:URI="https://a.googlevideo.com/itag/140/y",TYPE=AUDIO,DEFAULT=YES',
    ];
    assert.equal(mac.pickAudioRendition(lines), 'https://a.googlevideo.com/itag/140/y');
});

test('pickAudioRendition returns undefined with no audio renditions', () => {
    assert.equal(mac.pickAudioRendition(['#EXTM3U']), undefined);
});

test('audioKind reads plain text first, then base64url YT-EXT-XTAGS (unpadded)', () => {
    assert.equal(mac.audioKind('NAME="French dubbed"'), 'dubbed');
    assert.equal(mac.audioKind('NAME="English original"'), 'original');
    assert.equal(mac.audioKind('YT-EXT-XTAGS="YWNvbnQ9b3JpZ2luYWw6bGFuZz1lbg"'), 'original');
    assert.equal(mac.audioKind('YT-EXT-XTAGS="YWNvbnQ9ZHViYmVkLWF1dG86bGFuZz1lcw"'), 'dubbed');
    assert.equal(mac.audioKind('NAME="English"'), null);
    assert.equal(mac.audioKind('YT-EXT-XTAGS="!!not base64!!"'), null);
});

test('isAllowedRendition rejects dubbed, and requires original only when asked', () => {
    assert.equal(mac.isAllowedRendition('NAME="x dubbed"', false), false);
    assert.equal(mac.isAllowedRendition('NAME="x"', false), true);
    assert.equal(mac.isAllowedRendition('NAME="x"', true), false);
    assert.equal(mac.isAllowedRendition('NAME="x original"', true), true);
});

test('resolutionOf extracts WxH or null', () => {
    assert.equal(mac.resolutionOf('#EXT-X-STREAM-INF:RESOLUTION=1280x720,FRAME-RATE=30'), '1280x720');
    assert.equal(mac.resolutionOf('#EXT-X-MEDIA:TYPE=AUDIO'), null);
});
