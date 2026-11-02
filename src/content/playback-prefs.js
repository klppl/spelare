// Volume, loudness levelling and playback speed, remembered in
// browser.storage.local (per device, unlike the popup's settings, which sync).
//
// - Volume is one setting for every video. With "Even out loudness" on, loud
//   videos play that much quieter, the way YouTube's own player does; the
//   remembered volume is the user's, before that.
// - Speed is remembered per channel (podcasts at 1.5×, music at 1×); a channel
//   with none plays at 1×. The channel comes with the player response, a
//   moment after the video starts.
import { log } from "./log.js";
import { settings } from "./state.js";

const SAVE_DELAY_MS = 500;
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
// Channels whose speed is remembered; the least recently set go first.
export const MAX_CHANNELS = 200;
const CHANNEL_ID = /^UC[\w-]{22}$/;
// Loud videos are turned down to at most this much quieter.
const MIN_LEVEL_FACTOR = 0.1;

export const playbackPrefs = { volume: 1, speedByChannel: {} };

const isRate = (rate) =>
  Number.isFinite(rate) && rate >= MIN_RATE && rate <= MAX_RATE;

// Stored values, keeping only what Spelare could have saved.
export function validPrefs(stored) {
  const volume = stored?.volume;
  const speeds = stored?.speedByChannel;
  const speedByChannel = {};
  if (speeds && typeof speeds === "object")
    for (const [channelId, rate] of Object.entries(speeds).slice(-MAX_CHANNELS))
      if (CHANNEL_ID.test(channelId) && isRate(rate))
        speedByChannel[channelId] = rate;
  return {
    volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1,
    speedByChannel,
  };
}

// How much of the volume a video gets: YouTube gives its loudness in dB above
// its target level, and a louder video is turned down by that much. Quieter
// ones stay as they are (raising them would need Web Audio).
export function levelFactor(loudnessDb) {
  if (!Number.isFinite(loudnessDb) || loudnessDb <= 0) return 1;
  return Math.max(10 ** (-loudnessDb / 20), MIN_LEVEL_FACTOR);
}

// Records `rate` for `channelId` (1× is the default, so it's dropped), as
// the most recently set.
export function rememberChannelRate(speedByChannel, channelId, rate) {
  delete speedByChannel[channelId];
  if (rate !== 1) speedByChannel[channelId] = rate;
  const channels = Object.keys(speedByChannel);
  const excess = Math.max(channels.length - MAX_CHANNELS, 0);
  for (const old of channels.slice(0, excess)) delete speedByChannel[old];
}

// Loaded before a video starts, so it never plays a moment at full volume.
export async function loadPlaybackPrefs() {
  try {
    const stored = await browser.storage.local.get([
      "volume",
      "speedByChannel",
    ]);
    Object.assign(playbackPrefs, validPrefs(stored));
  } catch (error) {
    log("loadPlaybackPrefs:", error?.message || String(error));
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    browser.storage.local.set({
      volume: playbackPrefs.volume,
      speedByChannel: playbackPrefs.speedByChannel,
    });
  }, SAVE_DELAY_MS);
}

// The Spelare video being played, and what's known about it. The expected
// values tell Spelare's own volume and speed changes from the user's.
let current = null;

function volumeFactor() {
  return settings.evenLoudness ? levelFactor(current.loudnessDb) : 1;
}

// Sets the video's volume: the user's, levelled for this video.
export function applyVolume() {
  if (!current) return;
  current.expectedVolume = playbackPrefs.volume * volumeFactor();
  current.video.volume = current.expectedVolume;
}

// defaultPlaybackRate keeps the speed when the source changes (quality),
// since loading a source resets playbackRate to it.
function applyRate(rate) {
  current.expectedRate = rate;
  current.video.defaultPlaybackRate = rate;
  current.video.playbackRate = rate;
}

export function setupPlaybackPrefs(video) {
  current = {
    video,
    channelId: null,
    loudnessDb: null,
    expectedVolume: null,
    expectedRate: null,
    // A speed the user picked before the channel was known.
    chosenRate: null,
  };
  const state = current;
  applyVolume();
  applyRate(1);
  video.addEventListener("volumechange", () => {
    if (current !== state) return;
    if (Math.abs(video.volume - state.expectedVolume) < 0.001) return;
    playbackPrefs.volume = Math.min(video.volume / volumeFactor(), 1);
    state.expectedVolume = video.volume;
    save();
  });
  video.addEventListener("ratechange", () => {
    const rate = video.playbackRate;
    if (current !== state || !isRate(rate) || rate === state.expectedRate)
      return;
    state.expectedRate = rate;
    video.defaultPlaybackRate = rate;
    if (state.channelId) {
      rememberChannelRate(playbackPrefs.speedByChannel, state.channelId, rate);
      save();
    } else state.chosenRate = rate;
  });
}

// The player response's details arrived: level this video's volume, and
// play it at its channel's speed (or keep a speed the user already picked,
// remembering it for the channel).
export function applyVideoDetails({ channelId, loudnessDb }) {
  if (!current) return;
  current.channelId = channelId;
  current.loudnessDb = loudnessDb;
  applyVolume();
  if (!channelId) return;
  if (current.chosenRate !== null) {
    rememberChannelRate(
      playbackPrefs.speedByChannel,
      channelId,
      current.chosenRate,
    );
    save();
  } else applyRate(playbackPrefs.speedByChannel[channelId] ?? 1);
  log("playbackPrefs:", channelId, current.video.playbackRate, loudnessDb);
}
