// Applies popup changes to the page that's already open, without a reload:
// setting changes arrive through storage, and the popup asks the tab it's
// over to play a newly picked default quality now.
import { setupCaptions } from "./captions.js";
import { applyHideSettings, HIDE_ATTRIBUTES } from "./page-cleanup.js";
import { listenForSettingChanges } from "./state.js";
import {
  applyToolbarVisibility,
  playableQuality,
  setQuality,
} from "./toolbar.js";

// Runtime message the popup sends to its tab's content scripts.
export const APPLY_QUALITY = "apply-quality";

function spelareVideo() {
  return document.querySelector(
    "video[data-spelare-video]:not([data-spelare-fallback])",
  );
}

// Plays `wanted` (or the closest quality below it) on the Spelare video.
export function applyQuality(wanted) {
  const video = spelareVideo();
  const quality = video && playableQuality(wanted);
  if (quality) setQuality(video, quality);
}

export function setupLiveSettings() {
  // autoplay and captionsOnByDefault are read when they're needed, and the
  // quality picked in another tab only applies to the next video.
  listenForSettingChanges((name) => {
    if (name === "showToolbar") applyToolbarVisibility();
    else if (Object.hasOwn(HIDE_ATTRIBUTES, name)) applyHideSettings();
    else if (name === "translationLanguage") {
      const video = spelareVideo();
      if (video) setupCaptions(video);
    }
  });
  browser.runtime.onMessage.addListener((request) => {
    if (request?.type === APPLY_QUALITY && typeof request.quality === "string")
      applyQuality(request.quality);
  });
}
