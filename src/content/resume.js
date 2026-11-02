// Resume where you left off. YouTube's own links from Home, History and
// subscriptions already carry the saved position as t=, which Spelare
// follows; this covers the rest (a reload, a typed or bookmarked URL, a link
// from elsewhere) with positions kept in browser.storage.local, on this
// device only.
import { log } from "./log.js";
import { settings } from "./state.js";

const STORAGE_KEY = "resumePositions";
// Videos whose position is kept; the least recently watched go first.
export const MAX_VIDEOS = 500;
// Short videos, the first moments and the last ones aren't worth resuming.
export const MIN_DURATION_S = 120;
export const MIN_POSITION_S = 30;
export const END_MARGIN_S = 30;
const SAVE_EVERY_MS = 10_000;
// How long the "Resumed at …" notice stays.
const NOTICE_MS = 8000;

let positions = {};

// Whether `position` in a video of `duration` is a place to come back to.
export function isResumable(position, duration) {
  return (
    Number.isFinite(duration) &&
    duration >= MIN_DURATION_S &&
    position >= MIN_POSITION_S &&
    position < duration - END_MARGIN_S &&
    position < duration * 0.95
  );
}

// Records (or with null, forgets) `videoId`'s position as the most recent.
export function rememberPosition(map, videoId, position) {
  delete map[videoId];
  if (position !== null) map[videoId] = Math.floor(position);
  const ids = Object.keys(map);
  const excess = Math.max(ids.length - MAX_VIDEOS, 0);
  for (const old of ids.slice(0, excess)) delete map[old];
}

// Stored positions, keeping only well-formed ones.
export function validPositions(stored) {
  const valid = {};
  if (stored && typeof stored === "object")
    for (const [videoId, position] of Object.entries(stored).slice(-MAX_VIDEOS))
      if (
        /^[\w-]{1,64}$/.test(videoId) &&
        Number.isFinite(position) &&
        position > 0
      )
        valid[videoId] = position;
  return valid;
}

export async function loadResumePositions() {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    positions = validPositions(stored[STORAGE_KEY]);
  } catch (error) {
    log("loadResumePositions:", error?.message || String(error));
  }
}

export function resumePositionFor(videoId) {
  return settings.resumePlayback ? (positions[videoId] ?? null) : null;
}

// Reads the stored map afresh before writing, so tabs don't undo each
// other's positions.
async function storePosition(videoId, position) {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    positions = validPositions(stored[STORAGE_KEY]);
    rememberPosition(positions, videoId, position);
    await browser.storage.local.set({ [STORAGE_KEY]: positions });
  } catch (error) {
    log("storePosition:", error?.message || String(error));
  }
}

// Keeps `videoId`'s position while `video` plays: every few seconds, on pause
// and when the page goes away. Finishing the video (or ending up somewhere
// not worth resuming) forgets it.
export function trackPosition(video, videoId) {
  let lastSaved = 0;
  const save = () => {
    if (!settings.resumePlayback || !video.isConnected) return;
    const position = video.currentTime;
    const keep = isResumable(position, video.duration);
    if (!keep && !(videoId in positions)) return;
    lastSaved = performance.now();
    storePosition(videoId, keep ? position : null);
  };
  video.addEventListener("timeupdate", () => {
    if (!video.paused && performance.now() - lastSaved >= SAVE_EVERY_MS) save();
  });
  video.addEventListener("pause", save);
  video.addEventListener("ended", () => storePosition(videoId, null));
  window.addEventListener("pagehide", save);
}

// "m:ss" or "h:mm:ss".
export function formatTime(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// A short notice over the video, "Resumed at 12:34 · Start over", that
// fades after a few seconds.
export function showResumeNotice(video, position) {
  document.querySelector("#spelare-resume")?.remove();
  const notice = document.createElement("div");
  notice.id = "spelare-resume";
  notice.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = `Resumed at ${formatTime(position)}`;
  const startOver = document.createElement("button");
  startOver.type = "button";
  startOver.textContent = "Start over";
  startOver.addEventListener("mousedown", (event) => event.preventDefault());
  startOver.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    video.currentTime = 0;
    notice.remove();
  });
  notice.append(text, startOver);
  video.closest("div").insertBefore(notice, video);
  setTimeout(() => notice.classList.add("leaving"), NOTICE_MS);
  setTimeout(() => notice.remove(), NOTICE_MS + 400);
}
