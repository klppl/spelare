// The page-world player bridge, run from the built page script in a vm
// sandbox with a fake player, fed the messages callPlayer() posts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import './helpers/browser-globals.mjs';
import { extractInjectedScripts } from '../scripts/lib/mac-source.mjs';

const ORIGIN = 'https://www.youtube.com';

function fakePlayer() {
    const calls = [];
    const record = (name) => (...args) => { calls.push([name, ...args]); };
    const player = { calls, listeners: {} };
    for (const name of ['nextVideo', 'previousVideo', 'mute', 'unMute', 'pauseVideo', 'seekTo', 'loadVideoById', 'setAudioTrack']) {
        player[name] = record(name);
    }
    player.addEventListener = (type, listener) => { player.listeners[type] = listener; };
    player.getPlayerSize = () => ({ width: 640, height: 360 });
    return player;
}

// Installs the bridge in a fresh sandbox; returns a send() that delivers
// what callPlayer() would post.
function loadBridge({ player = fakePlayer(), videos = {}, hotkeys = null } = {}) {
    const listeners = [];
    const context = vm.createContext({
        location: new URL(`${ORIGIN}/watch?v=dQw4w9WgXcQ`),
        atob,
        setTimeout,
        document: {
            getElementById: (id) => (id === 'movie_player' ? player : null),
            getElementsByClassName: () => [],
            querySelector: (selector) => (selector === 'yt-Hotkey-Manager' ? hotkeys : videos[selector] ?? null),
        },
    });
    context.window = context;
    context.addEventListener = (type, listener) => { if (type === 'message') listeners.push(listener); };
    vm.runInContext(extractInjectedScripts()['player-bridge'], context);
    // Inside the sandbox, `window` is the context's global proxy, not `context`.
    const pageWindow = vm.runInContext('globalThis', context);

    function deliver(data, { source = pageWindow, origin = ORIGIN } = {}) {
        for (const listener of listeners) listener({ data, source, origin });
    }
    async function send(command, ...args) {
        const posted = [];
        const saved = globalThis.window.postMessage;
        globalThis.location ??= new URL(ORIGIN);
        globalThis.window.postMessage = (data, targetOrigin) => posted.push({ data, targetOrigin });
        try {
            const { callPlayer } = await import('../src/content/player.js');
            callPlayer(command, ...args);
        } finally {
            globalThis.window.postMessage = saved;
        }
        assert.equal(posted.length, 1);
        // postMessage structured-clones its data across worlds.
        deliver(structuredClone(posted[0].data));
    }
    return { player, send, deliver, context, pageWindow, listenerCount: () => listeners.length };
}

test('player commands reach the YouTube player', async () => {
    const { player, send } = loadBridge();
    await send('nextVideo');
    await send('previousVideo');
    await send('silence');
    await send('syncTime', 42.5);
    assert.deepEqual(player.calls, [
        ['nextVideo'],
        ['previousVideo'],
        ['mute'],
        ['pauseVideo'],
        ['seekTo', 42.5],
        ['mute'],
        ['pauseVideo'],
    ]);
});

test('fitVideoToPlayer sizes the Spelare video now and on player resize', async () => {
    const video = { style: {} };
    const { player, send } = loadBridge({ videos: { 'video[data-spelare-video]': video } });
    await send('fitVideoToPlayer');
    assert.deepEqual({ ...video.style }, { width: '640px', height: '360px' });
    player.listeners.resize({ width: 800, height: 450 });
    assert.deepEqual({ ...video.style }, { width: '800px', height: '450px' });
});

test('toggleTheaterMode clicks the player\'s own theater button, without needing a player', async () => {
    let clicked = 0;
    let viaHotkeys = 0;
    const sizeButton = { click: () => { clicked += 1; } };
    const { send } = loadBridge({
        player: null,
        videos: { '.ytp-size-button': sizeButton },
        hotkeys: { toggleTheaterMode: () => { viaHotkeys += 1; } },
    });
    await send('toggleTheaterMode');
    assert.deepEqual([clicked, viaHotkeys], [1, 0]);
});

test('toggleTheaterMode falls back to the hotkey manager, and ignores one without the method', async () => {
    let toggled = 0;
    const { send } = loadBridge({ player: null, hotkeys: { toggleTheaterMode: () => { toggled += 1; } } });
    await send('toggleTheaterMode');
    assert.equal(toggled, 1);
    const { send: sendWithout } = loadBridge({ player: null, hotkeys: {} });
    await sendWithout('toggleTheaterMode');
});

test('fallBack loads the video in YouTube\'s player, picks the original audio and marks the video', async () => {
    const player = fakePlayer();
    const tracks = [{ id: `x;${btoa('dubbed')}` }, { id: 'broken;%%%' }, { id: `y;${btoa('lang=en original')}` }];
    player.getAvailableAudioTracks = () => tracks;
    const attributes = {};
    const video = { setAttribute: (name, value) => { attributes[name] = value; } };
    const { send } = loadBridge({ player, videos: { video } });
    await send('fallBack', { videoId: 'dQw4w9WgXcQ', startTime: 90, quality: 'hd720' });
    assert.deepEqual(player.calls, [
        ['loadVideoById', 'dQw4w9WgXcQ', 90, 'hd720'],
        ['unMute'],
        ['setAudioTrack', tracks[2]],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(attributes, { 'data-spelare-fallback': true, 'data-spelare-video': true });
});

test('invalid commands and arguments are ignored', async () => {
    const { player, send, deliver, pageWindow } = loadBridge();
    await send('syncTime', 'alert(1)');
    await send('fallBack', { videoId: "x'); alert(1); ('", startTime: 0, quality: 'auto' });
    await send('fallBack', { videoId: 'dQw4w9WgXcQ', startTime: '1', quality: 'auto' });
    await send('constructor');
    await send('toString');
    const command = { source: 'spelare-content', type: 'player-command', command: 'nextVideo', args: [] };
    deliver(command, { source: {} });
    deliver(command, { origin: 'https://evil.example' });
    deliver({ ...command, source: 'spelare-page-observer' });
    deliver({ ...command, args: 'nope' });
    assert.deepEqual(player.calls, []);
    deliver(command, { source: pageWindow });
    assert.deepEqual(player.calls, [['nextVideo']]);
});

test('the bridge installs once per frame', () => {
    const { context, listenerCount } = loadBridge();
    vm.runInContext(extractInjectedScripts()['player-bridge'], context);
    assert.equal(listenerCount(), 1);
});
