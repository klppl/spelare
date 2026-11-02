import { setupCaptions } from "./captions.js";
import { trackFrameDuration } from "./frame-rate.js";
import { setupPlaybackPrefs } from "./playback-prefs.js";
import { log } from "./log.js";
import { ownsMediaSession, setupMediaSession } from "./media-session.js";
import { callPlayer } from "./player.js";
import { playNextVideo, setupDoubleClickFullscreen } from "./playback.js";
import { reportPlayerState } from "./player-state.js";
import { setupPlaybackRecovery } from "./recovery.js";
import {
  resumePositionFor,
  showResumeNotice,
  trackPosition,
} from "./resume.js";
import { settings, videoState } from "./state.js";
import { applyToolbarVisibility, createToolbar } from "./toolbar.js";
import { parseStartTime, startTimeFromNavigation } from "./url.js";

export let appliedInitialStartTime = false;
export function setupVideo(video) {
  log("setupVideo");
  setupPlaybackRecovery(video);
  trackFrameDuration(video);
  setupPlaybackPrefs(video);
  video.play();
  applyStartTime(video);
  video.setAttribute("data-spelare-video", true);
  log("fixVideoHeight");
  callPlayer("fitVideoToPlayer");
  setupAutoplay(video);
  applyToolbarVisibility();
  createToolbar(video);
  setupCaptions(video);
  log("muteHiddenVideo");
  callPlayer("silence");
  syncHiddenPlayerProgress(video);
  setupMediaSession(video);
  setupDoubleClickFullscreen(video);
  trackPosition(video, videoState.videoId);
  reportPlayerState("spelare");
}
export function syncHiddenPlayerProgress(video) {
  log("updateProgress");
  let lastSyncedTime = 0;
  video.addEventListener("timeupdate", (event) => {
    if (!(Math.abs(video.currentTime - lastSyncedTime) < 1)) {
      lastSyncedTime = video.currentTime;
      if (!ownsMediaSession()) setupMediaSession(video);
      callPlayer("syncTime", lastSyncedTime);
    }
  });
}
export function setupAutoplay(video) {
  log("setupAutoplay");
  video.addEventListener("ended", (event) => {
    if (settings.autoplay) playNextVideo();
  });
}
export function applyStartTime(video) {
  let startTime = parseStartTime(location);
  if (startTime < 0 && !appliedInitialStartTime) {
    startTime = startTimeFromNavigation();
    appliedInitialStartTime = true;
  }
  if (startTime >= 0) {
    video.currentTime = startTime;
    return;
  }
  // No start time in the link: where this video was left, if anywhere.
  const resume = resumePositionFor(videoState.videoId);
  if (resume === null) return;
  log("resume:", resume);
  video.currentTime = resume;
  showResumeNotice(video, resume);
}
