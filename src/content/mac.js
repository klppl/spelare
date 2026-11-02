// Content script source. `npm run build` bundles this (and the modules it imports) into extension/mac.js,
// replacing each __SPELARE_PAGE_SCRIPT__("name") with the page script built
// from src/page/ (see scripts/build.mjs). Edit here, not in extension/.
import { setupHotkeys } from "./hotkeys.js";
import { log } from "./log.js";
import { validateCandidate, validateVideoError } from "./messages.js";
import { setBounded } from "./bounded-map.js";
import { claimInstall } from "../shared/namespace.js";
import {
  CONTENT_MESSAGE,
  CONTENT_MESSAGE_SOURCE,
  PAGE_MESSAGE,
  PAGE_MESSAGE_SOURCE,
} from "../shared/page-messages.js";
import { setupLiveSettings } from "./live-settings.js";
import { injectPageScript } from "./page.js";
import { reportPlayerState } from "./player-state.js";
import { applyHideSettings } from "./page-cleanup.js";
import { setupHideGuard } from "./hide-guard.js";
import { loadPlaybackPrefs } from "./playback-prefs.js";
import { loadSettings, videoState } from "./state.js";
import { obtainAudioStream, obtainVideoStream } from "./streams.js";
import { handleExtensionError, STREAM_NOT_FOUND_NOTICE } from "./fallback.js";
import { currentVideoId, parseStartTime, videoIdFromURL } from "./url.js";

let observerReadyTimer;
const videoCandidates = new Map();
const audioCandidates = new Map();
let initialized = false;
let observerReady = false;
function listenForPageMessages(expectObserver = false) {
  log("initEvents");
  if (expectObserver)
    observerReadyTimer = window.setTimeout(() => {
      if (!observerReady) log("pageObserver: did not start");
    }, 2000);
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== PAGE_MESSAGE_SOURCE
    )
      return;
    if (event.data.type === PAGE_MESSAGE.READY) {
      if (!observerReady) {
        observerReady = true;
        window.clearTimeout(observerReadyTimer);
        log("pageObserver: ready");
      }
      return;
    }
    if (event.data.type === PAGE_MESSAGE.DIAGNOSTIC) {
      if (typeof event.data.message === "string")
        log("pageObserver:", event.data.message.slice(0, 500));
      return;
    }
    if (event.data.type === PAGE_MESSAGE.VIDEO_ERROR) {
      const error = validateVideoError(event.data);
      if (error) handleObserverError(error);
      return;
    }
    const isAudio = event.data.type === PAGE_MESSAGE.AUDIO_RESPONSE;
    if (!isAudio && event.data.type !== PAGE_MESSAGE.PLAYER_RESPONSE) return;
    const candidate = validateCandidate(
      event.data.candidate,
      isAudio ? "audioManifestURL" : "hlsManifestURL",
    );
    if (!candidate) return;
    setBounded(
      isAudio ? audioCandidates : videoCandidates,
      candidate.videoId,
      candidate,
      8,
    );
    processCandidates();
  });
  window.addEventListener(
    "loadstart",
    () => {
      handleURLChange();
    },
    true,
  );
  document.addEventListener("yt-navigate-finish", handleURLChange);
  // observer.js injects the stream observer; if it got there first, its
  // "ready" was posted before this listener existed, so ask again.
  if (expectObserver)
    window.postMessage(
      { source: CONTENT_MESSAGE_SOURCE, type: CONTENT_MESSAGE.PING },
      location.origin,
    );
}
// The observer found no HLS stream for a video. Unless one already arrived,
// or Spelare is already playing it, hand the video back to YouTube's player.
function handleObserverError({ videoId, message }) {
  if (
    !initialized ||
    videoId !== videoState.videoId ||
    videoState.response ||
    videoCandidates.has(videoId)
  )
    return;
  handleExtensionError(message, videoId, {
    notice: STREAM_NOT_FOUND_NOTICE,
  });
}
function processCandidates() {
  if (!initialized || !videoState.videoId) return;
  const audioCandidate = audioCandidates.get(videoState.videoId);
  if (audioCandidate) obtainAudioStream(audioCandidate);
  if (videoState.response) return;
  const videoCandidate = videoCandidates.get(videoState.videoId);
  if (videoCandidate) obtainVideoStream(videoCandidate);
}
function handleURLChange() {
  const videoId = currentVideoId() || null;
  if (videoState.videoId !== videoId) {
    log("detectURLChanges:", videoId || "no video");
    videoState.videoId = videoId;
    videoState.activeQuality = null;
    videoState.response = null;
    videoState.details = null;
    videoState.captionChoice = undefined;
    videoState.playlistContent = null;
    videoState.streams = {};
    removeSpelareVideos();
    reportPlayerState("none");
    processCandidates();
  }
}
function removeSpelareVideos() {
  const toolbar = document.querySelector("#spelare-toolbar");
  if (toolbar) toolbar.remove();
  document.querySelectorAll("video[data-spelare-video]").forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  });
}
(async () => {
  if (location.pathname.startsWith("/shorts")) return;
  if (!claimInstall("content")) return;
  // A new page starts its tab's log afresh; frames inside it add to it.
  if (window.top === window)
    browser.runtime.sendMessage({
      type: "clear-logs",
    });
  log("load:", location.href);
  // Nothing plays yet on a newly loaded page; clears the last page's badge.
  reportPlayerState("none");
  const isTopFrame =
    window.top === window && location.hostname === "www.youtube.com";
  log("injectPageScript");
  injectPageScript(__SPELARE_PAGE_SCRIPT__("caption-mirroring"));
  injectPageScript(__SPELARE_PAGE_SCRIPT__("player-bridge"));
  listenForPageMessages(isTopFrame);
  await Promise.all([loadSettings(), loadPlaybackPrefs()]);
  applyHideSettings();
  setupHideGuard();
  setupLiveSettings();
  log("handleLinkClicks");
  window.addEventListener(
    "click",
    (event) => {
      // Modified or non-primary clicks (new tab, new window, download) are
      // left to Safari.
      if (
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.button !== 0
      )
        return;
      const path = event.composedPath();
      for (let node of path)
        if (
          node.nodeType === 1 &&
          node.nodeName === "A" &&
          node.hasAttribute("href")
        ) {
          if (node.isContentEditable) return;
          if (node.target && node.target !== "_self") return;
          const url = new URL(node.href);
          if (url.pathname === "/watch") {
            event.stopImmediatePropagation();
            event.preventDefault();
            if (videoIdFromURL(url) === currentVideoId()) {
              const startTime = parseStartTime(url);
              if (startTime >= 0) {
                const video = document.querySelector(
                  "video[data-spelare-video]",
                );
                if (video) video.currentTime = startTime;
              }
            } else location.href = node.href;
          } else if (url.pathname.startsWith("/shorts")) {
            event.stopImmediatePropagation();
            event.preventDefault();
            location.href = node.href;
          }
        }
    },
    true,
  );
  initialized = true;
  handleURLChange();
  processCandidates();
  setupHotkeys();
})();
