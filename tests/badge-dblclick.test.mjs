// The toolbar badge text per player state, and where a double-click on the
// video counts as "full screen".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/browser-globals.mjs';
import { playerBadge } from '../src/content/player-state.js';
import { isOnControls, CONTROLS_BAND_PX } from '../src/content/playback.js';

test('playerBadge shows the playing quality in four characters or fewer', () => {
    assert.deepEqual(playerBadge('spelare', '1080p'), { text: '1080', title: 'Spelare is playing this video (1080p)' });
    assert.equal(playerBadge('spelare', '2160p').text, '4K');
    assert.deepEqual(playerBadge('spelare', 'audio'), { text: '♪', title: 'Spelare is playing this video (sound only)' });
    assert.equal(playerBadge('spelare', 'auto').title, 'Spelare is playing this video (Auto)');
    for (const quality of ['auto', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', 'audio'])
        assert.ok(playerBadge('spelare', quality).text.length <= 4, quality);
});

test('playerBadge flags the fallback and clears the badge when nothing plays', () => {
    assert.equal(playerBadge('fallback').text, '!');
    assert.match(playerBadge('fallback').title, /YouTube's own player/);
    assert.deepEqual(playerBadge('none'), { text: '', title: 'Spelare' });
});

test('double-clicks on Safari\'s control bands don\'t count as full screen', () => {
    const height = 360;
    assert.equal(isOnControls(10, height), true, 'top buttons');
    assert.equal(isOnControls(CONTROLS_BAND_PX - 1, height), true);
    assert.equal(isOnControls(180, height), false, 'middle of the picture');
    assert.equal(isOnControls(height - 10, height), true, 'play bar');
});
