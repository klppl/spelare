// Picking a dubbed audio language from the master playlist, the Audio menu,
// and Return YouTube Dislike counts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './helpers/browser-globals.mjs';
import { decodePlaylist } from './helpers/mac.mjs';
import { audioLanguage, audioTracks, pickAudioRendition, rewritePlaylist } from '../src/content/playlist.js';
import { audioLanguageLabel, audioMenuItems } from '../src/content/toolbar.js';
import { dislikesFrom, formatCount } from '../src/content/dislikes.js';

const multi = fs.readFileSync(new URL('./fixtures/multi-audio.m3u8', import.meta.url), 'utf8').split('\n');
const single = fs.readFileSync(new URL('./fixtures/single-audio.m3u8', import.meta.url), 'utf8').split('\n');

test('audioLanguage reads lang= from YouTube\'s tags, else LANGUAGE', () => {
    assert.equal(audioLanguage('YT-EXT-XTAGS="YWNvbnQ9ZHViYmVkLWF1dG86bGFuZz1lcw"'), 'es');
    assert.equal(audioLanguage('NAME="French dubbed",LANGUAGE="fr"'), 'fr');
    assert.equal(audioLanguage('NAME="Default"'), null);
});

test('audioTracks lists the dubs and the original\'s language', () => {
    assert.deepEqual(audioTracks(multi), { original: 'en', dubs: ['es', 'fr'] });
    assert.deepEqual(audioTracks(single), { original: null, dubs: [] });
});

test('rewritePlaylist with a dub keeps only that language\'s audio and variants', () => {
    const spanish = decodePlaylist(rewritePlaylist(multi, undefined, 'es'));
    const media = spanish.filter((line) => line.startsWith('#EXT-X-MEDIA'));
    assert.equal(media.length, 1);
    assert.match(media[0], /GROUP-ID="234-es"/);
    const variants = spanish.filter((line) => line.startsWith('#EXT-X-STREAM-INF'));
    assert.equal(variants.length, 2);
    for (const variant of variants) assert.match(variant, /AUDIO="234-es"/);
    assert.ok(spanish.some((line) => line.endsWith('/aud/es/playlist/index.m3u8')));

    const french720 = decodePlaylist(rewritePlaylist(multi, '1280', 'fr'));
    assert.deepEqual(french720.filter((line) => line.startsWith('#EXT-X-STREAM-INF')).length, 1);
    assert.equal(rewritePlaylist(multi, '854', 'fr'), false, 'no French 480p variant');
    assert.equal(rewritePlaylist(multi, undefined, 'de'), false, 'no German dub');
});

test('rewritePlaylist without a dub is unchanged: the original, no dubs', () => {
    assert.equal(rewritePlaylist(multi, '1280', null), rewritePlaylist(multi, '1280'));
    const out = decodePlaylist(rewritePlaylist(multi));
    assert.ok(!out.some((line) => /234-es|233-fr/.test(line)));
});

test('pickAudioRendition picks the dub for Sound only when one is chosen', () => {
    assert.match(pickAudioRendition(multi, 'es'), /xtags\/dub\//);
    assert.match(pickAudioRendition(multi, 'fr'), /xtags\/fr\//);
    assert.equal(pickAudioRendition(multi, 'de'), undefined);
    assert.doesNotMatch(pickAudioRendition(multi), /dub|\/fr\//);
});

test('the Audio menu: the original first, then dubs by name, the playing one checked', () => {
    const items = audioMenuItems({ original: 'en', dubs: ['fr', 'es'] }, 'es');
    assert.deepEqual(items.map((item) => [item.id, item.label, item.active, item.separatorBefore]), [
        [null, 'Original (English)', false, false],
        ['fr', 'French', false, true],
        ['es', 'Spanish', true, false],
    ]);
    assert.equal(audioMenuItems({ original: null, dubs: ['es'] }, null)[0].label, 'Original');
    assert.equal(audioLanguageLabel(null), 'Original');
    assert.equal(audioLanguageLabel('es'), 'Spanish');
    assert.equal(audioLanguageLabel('zz'), 'zz', 'an unknown code shows as itself');
});

test('dislike counts: read safely and shown like YouTube\'s', () => {
    assert.equal(dislikesFrom({ dislikes: 1234 }), 1234);
    for (const bad of [{ dislikes: -1 }, { dislikes: 1.5 }, { dislikes: '12' }, {}, null]) assert.equal(dislikesFrom(bad), null);
    assert.equal(formatCount(950), '950');
    assert.equal(formatCount(1234), '1.2K');
    assert.equal(formatCount(2_500_000), '2.5M');
});

const shared = fs.readFileSync(new URL('./fixtures/shared-groups.m3u8', import.meta.url), 'utf8').split('\n');

test('real layout: dubs share the original\'s audio groups, chosen by language', () => {
    assert.deepEqual(audioTracks(shared), { original: 'en', dubs: ['es', 'fr'] });
    const spanish = decodePlaylist(rewritePlaylist(shared, undefined, 'es'));
    const media = spanish.filter((line) => line.startsWith('#EXT-X-MEDIA'));
    assert.equal(media.length, 2, 'one Spanish rendition per group (233, 234)');
    for (const line of media) {
        assert.match(line, /LANGUAGE="es"/);
        assert.match(line, /DEFAULT=YES/, 'marked to play');
    }
    assert.equal(spanish.filter((line) => line.startsWith('#EXT-X-STREAM-INF')).length, 4, 'every variant stays');
    const original = decodePlaylist(rewritePlaylist(shared));
    const originalMedia = original.filter((line) => line.startsWith('#EXT-X-MEDIA'));
    assert.equal(originalMedia.length, 2);
    for (const line of originalMedia) assert.match(line, /English - original/);
    assert.match(pickAudioRendition(shared, 'fr'), /\/lang\/fr\//);
    assert.match(pickAudioRendition(shared), /itag\/234\/lang\/en\//, 'the original, itag 234 first');
});

test('dislike counts follow the page\'s language, like YouTube\'s own', () => {
    assert.match(formatCount(2_400_000, 'sv'), /^2,4\smn$/, 'Swedish uses a non-breaking space');
    assert.equal(formatCount(124_541, 'en'), '124.5K');
});

test('dubs come from the visionOS playlist when the played one has none', async () => {
    const { availableAudioTracks, buildStreams, dubPlaylistLines } = await import('../src/content/stream-urls.js');
    const { videoState } = await import('../src/content/state.js');
    const saved = { ...videoState };
    try {
        Object.assign(videoState, {
            playlistContent: single.join('\n'),
            dubMaster: shared.join('\n'),
            audioLanguage: null,
            originalAudioURL: null,
        });
        assert.deepEqual(availableAudioTracks(), { original: 'en', dubs: ['es', 'fr'] });
        assert.equal(dubPlaylistLines().join('\n'), shared.join('\n'));
        buildStreams();
        assert.ok(!decodePlaylist(videoState.streams.auto).some((line) => /LANGUAGE="es"/.test(line)), 'the original plays from its own playlist');
        videoState.audioLanguage = 'es';
        buildStreams();
        assert.ok(decodePlaylist(videoState.streams.auto).some((line) => /LANGUAGE="es"/.test(line)), 'the dub comes from the visionOS playlist');
        videoState.dubMaster = null;
        assert.deepEqual(availableAudioTracks(), { original: null, dubs: [] }, 'no dubs anywhere: no Audio button');
    } finally {
        Object.assign(videoState, saved);
    }
});
