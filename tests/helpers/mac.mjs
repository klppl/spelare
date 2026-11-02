// Content-script helpers under test, imported straight from src/content/, plus
// the page observer, which is still evaluated in a vm sandbox (see
// scripts/lib/mac-source.mjs) because it ships as an inline string.

import './browser-globals.mjs';
import { loadObserverFunctions } from '../../scripts/lib/mac-source.mjs';
import { parseStartTime, videoIdFromURL } from '../../src/content/url.js';
import { isGooglevideoURL } from '../../src/shared/hosts.js';
import { captionTrackURL, androidPlayerRequest } from '../../src/content/captions.js';
import { languageName } from '../../src/content/languages.js';
import { rewritePlaylist, pickAudioRendition, isAllowedRendition, audioKind, resolutionOf } from '../../src/content/playlist.js';
import { audioStreamEntry, audioStreams } from '../../src/content/streams.js';
import { waitForEvent } from '../../src/content/recovery.js';
import { settings } from '../../src/content/state.js';

const mac = {
    parseStartTime,
    videoIdFromURL,
    captionTrackURL,
    languageName,
    rewritePlaylist,
    pickAudioRendition,
    isAllowedRendition,
    audioKind,
    resolutionOf,
    isGooglevideoURL,
    audioStreamEntry,
    audioStreamCache: audioStreams,
    waitForEvent,
    androidPlayerRequest,
    settings,
};

// Module state is shared across a test file; tests that mutate it reset what they touch.
export function loadMac() {
    return mac;
}

// The Spelare observer inside the injected stream-observer script.
const OBSERVER_ALIASES = {
    isValidVideoId: 'isValidVideoId',
    isGooglevideoURL: 'isGooglevideoURL',
    playerScriptURL: 'playerScriptURL',
    currentVideoId: 'currentVideoId',
};

export function loadObserver(globals) {
    const { fns, context } = loadObserverFunctions(globals);
    const api = { context };
    for (const [alias, name] of Object.entries(OBSERVER_ALIASES)) {
        if (!(name in fns)) throw new Error(`stream observer has no top-level "${name}" (alias ${alias})`);
        Object.defineProperty(api, alias, { get: () => fns[name], enumerable: true });
    }
    return api;
}

// Values created inside the vm context have that realm's prototypes, which
// deepStrictEqual treats as different; normalise before comparing.
export const plain = (value) => JSON.parse(JSON.stringify(value));

// Decodes the data: URL produced by rewritePlaylist back into playlist lines.
export function decodePlaylist(dataURL) {
    const prefix = 'data:application/vnd.apple.mpegURL;base64,';
    if (!dataURL.startsWith(prefix)) throw new Error(`Not a playlist data URL: ${dataURL.slice(0, 60)}`);
    const binary = atob(dataURL.slice(prefix.length));
    return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0))).split('\n');
}
