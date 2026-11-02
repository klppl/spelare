// Validation of what the page observer posts (page-controlled data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import { validateCandidate, validateVideoError } from '../src/content/messages.js';

test('validateCandidate keeps only a valid id and a googlevideo URL', () => {
    const url = 'https://rr1.googlevideo.com/api/manifest/hls_variant/x';
    assert.deepEqual(validateCandidate({ videoId: 'dQw4w9WgXcQ', hlsManifestURL: url, extra: 1 }, 'hlsManifestURL'), {
        videoId: 'dQw4w9WgXcQ',
        hlsManifestURL: url,
    });
    assert.equal(validateCandidate({ videoId: 'dQw4w9WgXcQ', hlsManifestURL: 'https://evil.example/x' }, 'hlsManifestURL'), null);
    assert.equal(validateCandidate({ videoId: 'bad id', hlsManifestURL: url }, 'hlsManifestURL'), null);
    assert.equal(validateCandidate(null, 'hlsManifestURL'), null);
});

test('validateVideoError needs a valid id and a string message, truncated to 500 characters', () => {
    assert.deepEqual(validateVideoError({ videoId: 'dQw4w9WgXcQ', message: 'No playable HLS stream', other: 1 }), {
        videoId: 'dQw4w9WgXcQ',
        message: 'No playable HLS stream',
    });
    assert.equal(validateVideoError({ videoId: 'dQw4w9WgXcQ', message: 'x'.repeat(600) }).message.length, 500);
    assert.equal(validateVideoError({ videoId: 'dQw4w9WgXcQ', message: 42 }), null);
    assert.equal(validateVideoError({ videoId: '<script>', message: 'x' }), null);
    assert.equal(validateVideoError(undefined), null);
});
