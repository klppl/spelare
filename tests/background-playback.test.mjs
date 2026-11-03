// Background playback on iOS: sound only while the page is hidden.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';

let hidden = false;
globalThis.document = Object.defineProperty(
    Object.assign(new EventTarget(), { pictureInPictureElement: null }),
    'hidden',
    { get: () => hidden },
);
// The page's window, where Spelare listens (capturing) for visibilitychange.
const win = new EventTarget();
globalThis.addEventListener = win.addEventListener.bind(win);
const { isIOS, setupBackgroundPlayback } = await import('../src/content/background-playback.js');
const { videoState } = await import('../src/content/state.js');

function fakeVideo() {
    const video = Object.assign(new EventTarget(), {
        paused: false,
        isConnected: true,
        currentTime: 300,
        src: 'video-1080',
        plays: 0,
        querySelectorAll: () => [],
        load() {},
        play() { video.plays += 1; video.paused = false; return Promise.resolve(); },
    });
    return video;
}

function setVisibility(isHidden) {
    hidden = isHidden;
    win.dispatchEvent(new Event('visibilitychange'));
}

// Each test's video; the last one is taken off the page, as navigating would.
let current = null;
function setUp() {
    if (current) current.isConnected = false;
    videoState.streams = { auto: 'video-auto', 1080: 'video-1080', audio: 'sound' };
    videoState.activeQuality = '1080';
    current = fakeVideo();
    setupBackgroundPlayback(current, { ios: true });
    return current;
}

test('isIOS: iPhone, and iPad posing as a Mac, but not a Mac', () => {
    assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', maxTouchPoints: 5 }), true);
    assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true);
    assert.equal(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), false);
});

test('a video iOS paused on hiding plays on as sound only, and goes back when shown', () => {
    const video = setUp();
    video.paused = true;
    video.dispatchEvent(new Event('pause'));
    setVisibility(true);
    assert.equal(video.src, 'sound');
    assert.equal(videoState.activeQuality, 'audio');
    assert.equal(video.plays, 1, 'sound only starts playing');
    setVisibility(false);
    assert.equal(video.src, 'video-1080');
    assert.equal(videoState.activeQuality, '1080');
});

test('a video paused before hiding stays paused, on the same stream', () => {
    const video = setUp();
    video.paused = true;
    setVisibility(true);
    setVisibility(false);
    assert.equal(video.src, 'video-1080');
    assert.equal(video.plays, 0);
});

test('nothing changes in picture in picture, or without a sound-only stream', () => {
    let video = setUp();
    document.pictureInPictureElement = video;
    setVisibility(true);
    assert.equal(video.src, 'video-1080');
    setVisibility(false);
    document.pictureInPictureElement = null;
    video = setUp();
    video.paused = true;
    video.dispatchEvent(new Event('pause'));
    delete videoState.streams.audio;
    setVisibility(true);
    assert.equal(video.src, 'video-1080');
    setVisibility(false);
});

test('a quality picked while hidden is kept', () => {
    const video = setUp();
    setVisibility(true);
    videoState.activeQuality = 'auto';
    setVisibility(false);
    assert.equal(videoState.activeQuality, 'auto');
    assert.equal(video.src, 'sound', 'left alone here; the menu switched it');
});
