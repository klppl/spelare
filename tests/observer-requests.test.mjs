// The page observer's InnerTube requests, run in the vm sandbox with a fake
// fetch and ytcfg, so request shapes are pinned while that code is refactored.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadObserverFunctions } from '../scripts/lib/mac-source.mjs';
import { plain } from './helpers/mac.mjs';

function observerWith({ ytcfg, status = 'OK' }) {
    const requests = [];
    const fetch = async (url, options) => {
        requests.push({ url, ...options, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ playabilityStatus: { status } }) };
    };
    const { fns } = loadObserverFunctions({
        fetch,
        location: new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        ytcfg: { get: (key) => ytcfg[key] },
    });
    return { fns, requests };
}

test('visionOS request: cookie-less POST with visitor data headers and the VISIONOS client', async () => {
    const { fns, requests } = observerWith({ ytcfg: { VISITOR_DATA: 'visitor123', INNERTUBE_API_KEY: 'key456' } });
    await fns.requestVisionOSPlayer('dQw4w9WgXcQ', 0);
    assert.equal(requests.length, 1);
    const [request] = plain(requests);
    assert.equal(request.url, 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=key456');
    assert.equal(request.method, 'POST');
    assert.equal(request.credentials, 'omit');
    assert.deepEqual(request.headers, {
        'Content-Type': 'application/json',
        'X-Goog-Visitor-Id': 'visitor123',
        'X-YouTube-Client-Name': '101',
        'X-YouTube-Client-Version': '1.02',
    });
    assert.deepEqual(request.body, {
        context: {
            client: {
                clientName: 'VISIONOS',
                clientVersion: '1.02',
                deviceMake: 'Apple',
                deviceModel: 'RealityDevice17,1',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
                osName: 'visionOS',
                osVersion: '26.5.23O471',
                visitorData: 'visitor123',
            },
        },
        videoId: 'dQw4w9WgXcQ',
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
        contentCheckOk: true,
        racyCheckOk: true,
    });
});

test('WEB request: same-origin POST with the page context and signature timestamp', async () => {
    const context = { client: { clientName: 'WEB', clientVersion: '2.2026' } };
    const { fns, requests } = observerWith({ ytcfg: { INNERTUBE_CONTEXT: context, VISITOR_DATA: 'v1', STS: '20123' } });
    await fns.requestWebPlayer('dQw4w9WgXcQ', 0);
    const [request] = plain(requests);
    assert.equal(request.url, 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false');
    assert.equal(request.credentials, 'same-origin');
    assert.deepEqual(request.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(request.body.context, { client: { clientName: 'WEB', clientVersion: '2.2026', visitorData: 'v1' } });
    assert.deepEqual(request.body.playbackContext, {
        contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', signatureTimestamp: 20123 },
    });
});

test('player requests reject unplayable responses, naming the client', async () => {
    const { fns } = observerWith({ ytcfg: { VISITOR_DATA: 'v' }, status: 'LOGIN_REQUIRED' });
    await assert.rejects(fns.requestVisionOSPlayer('dQw4w9WgXcQ', 0), { message: 'visionOS player request returned LOGIN_REQUIRED' });
});
