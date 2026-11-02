import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VIDEO_QUALITIES, PICKER_QUALITIES, youtubeQualityName, qualityLabel } from '../src/content/qualities.js';

test('quality table: widths and YouTube names as previously hard-coded', () => {
    assert.deepEqual(VIDEO_QUALITIES.map((q) => `${q.id}:${q.width}:${q.youtubeName}`), [
        '2160p:3840:hd2160', '1440p:2560:hd1440', '1080p:1920:hd1080', '720p:1280:hd720',
        '480p:854:large', '360p:640:medium', '240p:426:small', '144p:256:tiny',
    ]);
    assert.deepEqual(PICKER_QUALITIES, ['auto', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', 'audio']);
});

test('youtubeQualityName falls back to auto for auto, audio and unknown values', () => {
    assert.equal(youtubeQualityName('720p'), 'hd720');
    for (const id of ['auto', 'audio', 'best', 'highres', undefined]) assert.equal(youtubeQualityName(id), 'auto');
});

test('qualityLabel', () => {
    assert.equal(qualityLabel('auto'), 'Auto');
    assert.equal(qualityLabel('audio'), 'Sound only');
    assert.equal(qualityLabel('1080p'), '1080p');
});

test('the popup offers exactly the picker qualities', () => {
    const html = fs.readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
    const select = html.slice(html.indexOf('id="quality"'), html.indexOf('</select>', html.indexOf('id="quality"')));
    const values = [...select.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(values.sort(), [...PICKER_QUALITIES].sort());
});
