// swapInVideo's wait for YouTube's video element, under mocked timers.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';

let probes = 0;
globalThis.document = {
    querySelector: () => { probes += 1; return null; },
    querySelectorAll: () => [],
};

const { swapInVideo } = await import('../src/content/streams.js');
const { videoState } = await import('../src/content/state.js');

async function advance(ms, step) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
        mock.timers.tick(step);
        await new Promise((resolve) => setImmediate(resolve));
    }
}

test('polls fast for 10 s, then once a second, and stops when the user navigates away', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        videoState.videoId = 'dQw4w9WgXcQ';
        videoState.response = null;
        let settled = false;
        const done = swapInVideo({ videoId: 'dQw4w9WgXcQ' }, Promise.resolve({ tracks: [], details: null }), null).then(() => { settled = true; });

        await advance(10_000, 50);
        assert.equal(probes, 201, '200 fast attempts, then the first slow one');
        await advance(5_000, 50);
        assert.equal(probes, 206, 'one attempt per second after 10 s');

        videoState.videoId = 'other';
        await advance(1_000, 50);
        await done;
        assert.ok(settled);
        assert.equal(probes, 206, 'no attempts after navigating away');
    } finally {
        mock.timers.reset();
        videoState.videoId = null;
    }
});
