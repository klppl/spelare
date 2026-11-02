// Quality fallback, fallback start position, and Now Playing details.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import { pickVideoQuality } from '../src/content/qualities.js';
import { fallbackStartTime } from '../src/content/fallback.js';
import { nowPlayingMetadata } from '../src/content/media-session.js';
import { captionTracksFrom, videoDetailsFrom } from '../src/content/captions.js';

test('pickVideoQuality plays the wanted quality, else the best one below it', () => {
    const available = ['auto', '1080p', '720p', '360p'];
    assert.equal(pickVideoQuality('720p', available), '720p');
    assert.equal(pickVideoQuality('2160p', available), '1080p');
    assert.equal(pickVideoQuality('480p', available), '360p');
    assert.equal(pickVideoQuality('best', available), '1080p');
    assert.equal(pickVideoQuality('144p', available), null, 'nothing at or below it: Auto');
    for (const wanted of ['auto', 'audio', 'highres', undefined]) assert.equal(pickVideoQuality(wanted, available), null);
});

test('fallbackStartTime keeps the position reached, else the navigation start time', () => {
    assert.equal(fallbackStartTime(754.2, 90), 754.2);
    assert.equal(fallbackStartTime(0, 90), 90);
    assert.equal(fallbackStartTime(0, -1), -1);
    assert.equal(fallbackStartTime(NaN, 90), 90);
});

test('nowPlayingMetadata uses the player response details, else the page title', () => {
    const fromDetails = nowPlayingMetadata('dQw4w9WgXcQ', { title: 'Song', author: 'Channel' }, 'ignored - YouTube');
    assert.equal(fromDetails.title, 'Song');
    assert.equal(fromDetails.artist, 'Channel');
    assert.deepEqual(fromDetails.artwork.map((art) => art.src), [
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    ]);
    const fromPage = nowPlayingMetadata('dQw4w9WgXcQ', null, '(3) Some Video - YouTube');
    assert.equal(fromPage.title, 'Some Video');
    assert.equal(fromPage.artist, '');
    assert.deepEqual(nowPlayingMetadata(null, null).artwork, []);
});

test('videoDetailsFrom only trusts details for the requested video', () => {
    const data = { videoDetails: { videoId: 'abc', title: 'T'.repeat(600), author: 42 } };
    assert.deepEqual(videoDetailsFrom(data, 'abc'), { title: 'T'.repeat(500), author: '', channelId: null, loudnessDb: null });
    const full = {
        videoDetails: { videoId: 'abc', title: 'T', author: 'A', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' },
        playerConfig: { audioConfig: { loudnessDb: 4.5 } },
    };
    assert.deepEqual(videoDetailsFrom(full, 'abc'), { title: 'T', author: 'A', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', loudnessDb: 4.5 });
    const odd = { videoDetails: { videoId: 'abc', title: 'T', channelId: 'not-a-channel' }, playerConfig: { audioConfig: { loudnessDb: 900 } } };
    assert.deepEqual(videoDetailsFrom(odd, 'abc'), { title: 'T', author: '', channelId: null, loudnessDb: null });
    assert.equal(videoDetailsFrom(data, 'other'), null);
    assert.equal(videoDetailsFrom({}, 'abc'), null);
});

test('captionTracksFrom keeps only well-formed YouTube tracks', () => {
    const track = (baseUrl) => ({ baseUrl, languageCode: 'en', name: { simpleText: 'English' } });
    const tracks = captionTracksFrom({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [
        track('https://www.youtube.com/api/timedtext?v=abc'),
        track('https://evil.example/timedtext'),
    ] } } });
    assert.deepEqual(tracks, [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc', languageCode: 'en', name: { runs: [{ text: 'English' }] } }]);
    assert.deepEqual(captionTracksFrom(null), []);
});

test('seekableRange: 0 to the duration, or a live stream\'s seekable window', async () => {
    const { seekableRange, seekToPercent, seekForward, seekBackward } = await import('../src/content/playback.js');
    const seekable = (start, end) => ({ length: 1, start: () => start, end: () => end });
    assert.deepEqual(seekableRange({ duration: 100 }), { start: 0, end: 100 });
    assert.equal(seekableRange({ duration: NaN, seekable: { length: 0 } }), null);
    const live = { duration: Infinity, seekable: seekable(1000, 2000), currentTime: 1990 };
    assert.deepEqual(seekableRange(live), { start: 1000, end: 2000 });
    seekToPercent(live, 50);
    assert.equal(live.currentTime, 1500);
    live.currentTime = 1995;
    seekForward(live, 10);
    assert.equal(live.currentTime, 2000, 'no further than the live edge');
    live.currentTime = 1005;
    seekBackward(live, 10);
    assert.equal(live.currentTime, 1000, 'no further back than the window');
    const loading = { duration: NaN, seekable: { length: 0 }, currentTime: 0 };
    seekToPercent(loading, 50);
    seekForward(loading, 10);
    assert.equal(loading.currentTime, 0, 'nothing to seek before metadata');
});

test('measuredFrameDuration reads consecutive frames only', async () => {
    const { measuredFrameDuration } = await import('../src/content/frame-rate.js');
    const frame = (presentedFrames, mediaTime) => ({ presentedFrames, mediaTime });
    assert.equal(measuredFrameDuration(null, frame(1, 0)), null);
    assert.ok(Math.abs(measuredFrameDuration(frame(1, 10), frame(2, 10 + 1 / 24)) - 1 / 24) < 1e-9);
    assert.equal(measuredFrameDuration(frame(1, 10), frame(3, 10.08)), null, 'a dropped frame');
    assert.equal(measuredFrameDuration(frame(1, 10), frame(2, 40)), null, 'a seek');
});
