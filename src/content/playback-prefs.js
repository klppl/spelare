// Volume and playback speed, remembered across videos in browser.storage.local
// (per device, unlike the popup's settings, which sync).
import { log } from "./log.js";

const SAVE_DELAY_MS = 500;
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;

export const playbackPrefs = { volume: 1, playbackRate: 1 };

// A stored value, if it's one Spelare could have saved; else the default.
export function validPrefs(stored) {
  const volume = stored?.volume;
  const playbackRate = stored?.playbackRate;
  return {
    volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1,
    playbackRate:
      Number.isFinite(playbackRate) &&
      playbackRate >= MIN_RATE &&
      playbackRate <= MAX_RATE
        ? playbackRate
        : 1,
  };
}

// Loaded before a video starts, so it never plays a moment at full volume.
export async function loadPlaybackPrefs() {
  try {
    const stored = await browser.storage.local.get(["volume", "playbackRate"]);
    Object.assign(playbackPrefs, validPrefs(stored));
  } catch (error) {
    log("loadPlaybackPrefs:", error?.message || String(error));
  }
}

// Applies the remembered volume and speed to `video`, then remembers changes.
// defaultPlaybackRate keeps the speed when the source changes (quality),
// since loading a source resets playbackRate to it.
export function setupPlaybackPrefs(video) {
  video.volume = playbackPrefs.volume;
  video.defaultPlaybackRate = playbackPrefs.playbackRate;
  video.playbackRate = playbackPrefs.playbackRate;
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      browser.storage.local.set({ ...playbackPrefs });
    }, SAVE_DELAY_MS);
  };
  video.addEventListener("volumechange", () => {
    if (video.volume === playbackPrefs.volume) return;
    playbackPrefs.volume = video.volume;
    save();
  });
  video.addEventListener("ratechange", () => {
    const rate = video.playbackRate;
    if (rate < MIN_RATE || rate > MAX_RATE) return;
    if (video.defaultPlaybackRate !== rate) video.defaultPlaybackRate = rate;
    if (rate === playbackPrefs.playbackRate) return;
    playbackPrefs.playbackRate = rate;
    save();
  });
}
