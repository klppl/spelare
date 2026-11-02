import { toggleSubtitles } from "./captions.js";
import { frameDuration } from "./frame-rate.js";
import { log } from "./log.js";
import { cycleQuality } from "./toolbar.js";
import {
  seekBackward,
  seekForward,
  seekToPercent,
  slowDown,
  speedUp,
  toggleFullscreen,
  toggleMute,
  togglePictureInPicture,
  togglePlayPause,
  toggleTheaterMode,
} from "./playback.js";

// Keyup actions by lowercased event.key.
const KEYUP_ACTIONS = {
  c: (video) => toggleSubtitles(video),
  i: (video) => togglePictureInPicture(video),
  f: (video) => toggleFullscreen(video),
  j: (video) => seekBackward(video, 10),
  l: (video) => seekForward(video, 10),
  arrowleft: (video) => seekBackward(video, 5),
  arrowright: (video) => seekForward(video, 5),
  ",": (video) => {
    if (video.paused) seekBackward(video, frameDuration(video));
  },
  ".": (video) => {
    if (video.paused) seekForward(video, frameDuration(video));
  },
  k: (video) => togglePlayPause(video),
  " ": (video) => togglePlayPause(video),
  m: (video) => toggleMute(video),
  t: () => toggleTheaterMode(),
  // Shift-Q goes down; works in fullscreen, where the toolbar isn't shown.
  q: (video, event) => cycleQuality(video, event.shiftKey ? -1 : 1),
  "<": (video) => slowDown(video),
  ">": (video) => speedUp(video),
};

// Keys typed into a form field or editable content are not hotkeys.
function isTypingTarget(target) {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

// The Spelare video, when the key event should be handled as a hotkey.
function hotkeyVideo(event) {
  if (isTypingTarget(event.target)) return null;
  // A focused toolbar button handles its own Space and Enter.
  if (event.target.closest?.("#spelare-toolbar")) return null;
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  return document.querySelector("video[data-spelare-video]");
}

export function setupHotkeys() {
  log("setupHotkeys");
  window.addEventListener(
    "keyup",
    (event) => {
      const video = hotkeyVideo(event);
      if (!video) return;
      // Every key is kept from YouTube's own handlers, mapped or not.
      event.stopImmediatePropagation();
      KEYUP_ACTIONS[event.key.toLowerCase()]?.(video, event);
    },
    true,
  );
  // Digits act on keydown: 0–9 seek to 0%–90% of the video.
  window.addEventListener(
    "keydown",
    (event) => {
      const video = hotkeyVideo(event);
      if (!video || !/^[0-9]$/.test(event.key)) return;
      event.stopImmediatePropagation();
      seekToPercent(video, Number(event.key) * 10);
    },
    true,
  );
}
