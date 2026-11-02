// Resume where you left off: which positions are kept, how many, and how
// they're shown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import {
    formatTime, isResumable, MAX_VIDEOS, rememberPosition, validPositions,
} from '../src/content/resume.js';

test('isResumable skips short videos, the first moments and the end', () => {
    assert.equal(isResumable(300, 1200), true);
    assert.equal(isResumable(300, 100), false, 'a short video');
    assert.equal(isResumable(10, 1200), false, 'just started');
    assert.equal(isResumable(1180, 1200), false, 'the last 30 seconds');
    assert.equal(isResumable(5800, 6000), false, 'past 95% (credits)');
    assert.equal(isResumable(300, Infinity), false, 'a live stream');
    assert.equal(isResumable(300, NaN), false, 'no metadata yet');
});

test('rememberPosition keeps the most recent videos, and forgets with null', () => {
    const map = {};
    rememberPosition(map, 'a', 100.7);
    rememberPosition(map, 'b', 200);
    rememberPosition(map, 'a', 150);
    assert.deepEqual(Object.entries(map), [['b', 200], ['a', 150]], 'whole seconds; a rewatched video becomes the newest');
    rememberPosition(map, 'b', null);
    assert.deepEqual(map, { a: 150 });
    for (let i = 0; i < MAX_VIDEOS + 3; i += 1) rememberPosition(map, `v${i}`, 60);
    assert.equal(Object.keys(map).length, MAX_VIDEOS);
    assert.ok(!('a' in map), 'the oldest went first');
});

test('validPositions drops anything Spelare couldn\'t have stored', () => {
    assert.deepEqual(validPositions({ dQw4w9WgXcQ: 120, 'bad id!': 5, x: -3, y: 'soon' }), { dQw4w9WgXcQ: 120 });
    assert.deepEqual(validPositions(undefined), {});
    assert.deepEqual(validPositions('nope'), {});
});

test('formatTime', () => {
    assert.equal(formatTime(75), '1:15');
    assert.equal(formatTime(5), '0:05');
    assert.equal(formatTime(3723.9), '1:02:03');
});
