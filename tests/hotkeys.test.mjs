// Hotkey dispatch, driven with fake window/document/video objects.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';

const listeners = {};
globalThis.window.addEventListener = (type, listener) => {
    (listeners[type] ??= []).push(listener);
};
let video;
globalThis.document = {
    querySelector: (selector) => (selector === 'video[data-spelare-video]' ? video : null),
    querySelectorAll: () => [],
};

const { setupHotkeys } = await import('../src/content/hotkeys.js');
const { DEFAULT_FRAME_SECONDS } = await import('../src/content/frame-rate.js');
setupHotkeys();

function freshVideo(overrides = {}) {
    return { currentTime: 50, duration: 100, paused: false, muted: false, playbackRate: 1, textTracks: [], ...overrides };
}

function press(type, key, { target = { tagName: 'BODY' }, ...modifiers } = {}) {
    const event = { key, target, altKey: false, ctrlKey: false, metaKey: false, stopped: false, ...modifiers };
    event.stopImmediatePropagation = () => { event.stopped = true; };
    for (const listener of listeners[type]) listener(event);
    return event;
}

test('keyup: seeking, frame stepping, mute and speed', () => {
    video = freshVideo();
    press('keyup', 'j');
    assert.equal(video.currentTime, 40);
    press('keyup', 'L');
    assert.equal(video.currentTime, 50);
    press('keyup', 'ArrowLeft');
    assert.equal(video.currentTime, 45);
    press('keyup', 'ArrowRight');
    assert.equal(video.currentTime, 50);
    press('keyup', ',');
    assert.equal(video.currentTime, 50, 'frame step only while paused');
    video.paused = true;
    press('keyup', '.');
    assert.equal(video.currentTime, 50 + DEFAULT_FRAME_SECONDS, 'unmeasured: the default frame duration');
    press('keyup', 'm');
    assert.equal(video.muted, true);
    press('keyup', '>');
    press('keyup', '>');
    assert.equal(video.playbackRate, 1.5);
    press('keyup', '<');
    assert.equal(video.playbackRate, 1.25);
});

test('keyup stops propagation for every key once a Spelare video exists', () => {
    video = freshVideo();
    assert.equal(press('keyup', 'x').stopped, true);
    video = null;
    assert.equal(press('keyup', 'j').stopped, false);
});

test('modifiers and typing targets are ignored', () => {
    video = freshVideo();
    assert.equal(press('keyup', 'j', { metaKey: true }).stopped, false);
    assert.equal(video.currentTime, 50);
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) press('keyup', 'j', { target: { tagName } });
    press('keyup', 'j', { target: { tagName: 'DIV', isContentEditable: true } });
    assert.equal(video.currentTime, 50);
});

test('keydown digits seek to tenths of the duration and stop propagation', () => {
    video = freshVideo();
    const event = press('keydown', '7');
    assert.equal(video.currentTime, 70);
    assert.equal(event.stopped, true);
    press('keydown', '0');
    assert.equal(video.currentTime, 0);
    assert.equal(press('keydown', 'a').stopped, false);
    assert.equal(press('keydown', '5', { ctrlKey: true }).stopped, false);
});
