// Chapters from video descriptions, and iCloud sync in background.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './helpers/browser-globals.mjs';
import { chapterAt, parseChapters } from '../src/content/chapters.js';

test('parseChapters reads YouTube-style timestamp lists', () => {
    const description = [
        'Thanks for watching!',
        '',
        '0:00 Intro',
        '1:05 - The house',
        '[12:30] Day one',
        '1:02:03 Finale',
        'Follow me on 10:00 somewhere? no, not at the start',
    ].join('\n');
    assert.deepEqual(parseChapters(description), [
        { start: 0, title: 'Intro' },
        { start: 65, title: 'The house' },
        { start: 750, title: 'Day one' },
        { start: 3723, title: 'Finale' },
    ]);
});

test('parseChapters also reads timestamps at the end of lines', () => {
    assert.deepEqual(parseChapters('Intro 0:00\nMiddle (2:00)\nEnd - 4:30'), [
        { start: 0, title: 'Intro' },
        { start: 120, title: 'Middle' },
        { start: 270, title: 'End' },
    ]);
});

test('parseChapters follows YouTube\'s rules, or finds none', () => {
    assert.deepEqual(parseChapters('1:00 A\n2:00 B\n3:00 C'), [], 'must start at 0:00');
    assert.deepEqual(parseChapters('0:00 A\n2:00 B'), [], 'at least three');
    assert.deepEqual(parseChapters('0:00 A\n0:05 B\n1:00 C'), [], 'at least ten seconds apart');
    assert.deepEqual(parseChapters('0:00 A\n2:00 B\n1:00 C'), [], 'in order');
    assert.deepEqual(parseChapters('0:00 A\n1:75 B\n3:00 C'), [], 'no 75th second');
    assert.deepEqual(parseChapters('0:00 A\n1:00 B\n9:00 C', 300), [], 'not past the end');
    assert.deepEqual(parseChapters(undefined), []);
});

test('chapterAt finds the chapter playing', () => {
    const chapters = [{ start: 0 }, { start: 60 }, { start: 120 }];
    assert.equal(chapterAt(chapters, 0), 0);
    assert.equal(chapterAt(chapters, 59.9), 0);
    assert.equal(chapterAt(chapters, 60), 1);
    assert.equal(chapterAt(chapters, 500), 2);
});

// background.js with fake storage and a fake iCloud behind native messaging.
function loadSync({ local = {}, sync = {}, icloud = {} } = {}) {
    const stores = { local: { ...local }, sync: { ...sync } };
    const changeListeners = [];
    const store = (area) => ({
        get: async (key) => (key in stores[area] ? { [key]: stores[area][key] } : {}),
        set: async (values) => {
            Object.assign(stores[area], values);
            const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }]));
            for (const listener of changeListeners) listener(changes, area);
        },
    });
    const sent = [];
    const context = vm.createContext({
        browser: {
            runtime: {
                onMessage: { addListener: () => {} },
                sendNativeMessage: async (_app, message) => {
                    sent.push(message);
                    if (message.type === 'icloud-get') return { values: { ...icloud } };
                    Object.assign(icloud, message.values);
                    return { ok: true };
                },
            },
            action: { setBadgeText() {}, setTitle() {} },
            storage: { local: store('local'), sync: store('sync'), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
        },
        Promise, console, setTimeout, clearTimeout, Date, JSON,
    });
    vm.runInContext(fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), context);
    const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
    return { stores, icloud, sent, settle, changed: (changes, area) => changeListeners.forEach((fn) => fn(changes, area)) };
}

test('iCloud: settings from another device are applied at start, maps merged', async () => {
    const sync = loadSync({
        local: { resumePositions: { here: 100 }, volume: 0.3 },
        icloud: {
            'sync:quality': JSON.stringify('720p'),
            'local:resumePositions': JSON.stringify({ there: 200 }),
            'local:volume': JSON.stringify(1),
        },
    });
    await sync.settle(20);
    assert.equal(sync.stores.sync.quality, '720p');
    assert.deepEqual({ ...sync.stores.local.resumePositions }, { here: 100, there: 200 });
    assert.equal(sync.stores.local.volume, 0.3, 'volume stays per device');
});

test('iCloud: local changes go up after a short delay, not echoed back', async () => {
    const sync = loadSync({ icloud: { 'sync:autoplay': JSON.stringify(true) } });
    await sync.settle(20);
    const sentAfterPull = sync.sent.filter((m) => m.type === 'icloud-set').length;
    assert.equal(sentAfterPull, 0, 'what came from iCloud isn\'t sent back');
    sync.changed({ quality: { newValue: '1080p' } }, 'sync');
    sync.changed({ volume: { newValue: 0.5 } }, 'local');
    await sync.settle(3200);
    const sets = sync.sent.filter((m) => m.type === 'icloud-set');
    assert.equal(sets.length, 1);
    assert.deepEqual({ ...sets[0].values }, { 'sync:quality': JSON.stringify('1080p') });
});

test('iCloud: off in the popup means nothing is read or sent', async () => {
    const sync = loadSync({ local: { icloudSync: false }, icloud: { 'sync:quality': JSON.stringify('720p') } });
    await sync.settle(20);
    assert.equal(sync.stores.sync.quality, undefined);
    assert.equal(sync.sent.length, 0);
});
