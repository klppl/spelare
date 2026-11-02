import { fetchAndroidPlayerInfo, setupCaptions } from "./captions.js";
import { fallbackToYouTube, handleExtensionError } from "./fallback.js";
import { log } from "./log.js";
import {
  describePlaylist,
  pickAudioRendition,
  rewritePlaylist,
} from "./playlist.js";
import { pickVideoQuality, VIDEO_QUALITIES } from "./qualities.js";
import { settings, videoState } from "./state.js";
import { isGooglevideoURL } from "../shared/hosts.js";
import { pollFor } from "../shared/poll.js";
import { setBounded } from "./bounded-map.js";
import { setVideoSource, switchVideoSource } from "./source.js";
import { ownsMediaSession, updateNowPlaying } from "./media-session.js";
import { setupVideo } from "./video.js";
import { applyVideoDetails } from "./playback-prefs.js";
import { reportPlayerState } from "./player-state.js";

export function setupStreams(video, audioURL = null) {
  log("setBasicQuality");
  let hasSelection = false;
  let selectedURL = null;
  const lines = videoState.playlistContent.split("\n");
  videoState.streams = {};
  videoState.streams.auto = rewritePlaylist(lines);
  log("setBasicQuality:", describePlaylist(videoState.streams.auto));
  videoState.activeQuality = null;
  handleUnplayableStream(video);
  for (const quality of VIDEO_QUALITIES) {
    const streamURL = rewritePlaylist(lines, quality.width);
    if (streamURL) videoState.streams[quality.id] = streamURL;
  }
  // activeQuality records what actually plays, so the toolbar doesn't show
  // a quality the video doesn't have.
  const videoQuality = pickVideoQuality(
    settings.quality,
    Object.keys(videoState.streams),
  );
  if (videoQuality) {
    selectedURL = videoState.streams[videoQuality];
    videoState.activeQuality = videoQuality;
    hasSelection = true;
  }
  const audioStreamURL = audioURL || pickAudioRendition(lines);
  if (audioStreamURL) {
    videoState.streams.audio = audioStreamURL;
    if (!(settings.quality !== "audio" || hasSelection)) {
      selectedURL = audioStreamURL;
      videoState.activeQuality = "audio";
      hasSelection = true;
    }
  }
  if (!hasSelection) {
    selectedURL = videoState.streams.auto;
    videoState.activeQuality = "auto";
    hasSelection = true;
  }
  setVideoSource(video, selectedURL);
  setupVideo(video);
}
export function handleUnplayableStream(video) {
  log("handleUnplayableStream");
  video.addEventListener("error", () => {
    log("handleUnplayableStream:", video.error?.code, video.error?.message);
    if (videoState.activeQuality === "audio" && videoState.streams.auto) {
      log("handleUnplayableStream: falling back from audio");
      videoState.activeQuality = "auto";
      switchVideoSource(video, videoState.streams.auto, { pauseFirst: false });
      const qualityButton = document.querySelector("#spelare-toolbar .quality");
      if (qualityButton) qualityButton.textContent = "Auto";
      reportPlayerState("spelare");
    } else fallbackToYouTube(video);
  });
}
export let fetchingVideoId = null;
export const audioStreams = new Map();
export const AUDIO_WAIT_MS = 3000;
export function audioStreamEntry(videoId) {
  let entry = audioStreams.get(videoId);
  if (!entry) {
    let resolvePromise;
    entry = {
      promise: new Promise((resolve) => {
        resolvePromise = resolve;
      }),
      resolve: resolvePromise,
      started: false,
      url: null,
    };
    setBounded(audioStreams, videoId, entry, 8);
  }
  return entry;
}
const MAX_MANIFEST_LENGTH = 1_000_000;

// Fetches an HLS manifest without cookies; `label` ("Video"/"Audio") names it in errors.
export async function fetchManifest(url, label) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok)
    throw new Error(
      `${label} manifest request failed (HTTP ${response.status}).`,
    );
  const manifest = await response.text();
  if (manifest.length > MAX_MANIFEST_LENGTH)
    throw new Error(`${label} manifest is over 1 MB, so it was skipped.`);
  return manifest;
}

export async function obtainAudioStream(candidate) {
  const entry = audioStreamEntry(candidate.videoId);
  if (!entry.started) {
    entry.started = true;
    try {
      log("obtainAudioStream:", candidate.videoId);
      const manifest = await fetchManifest(candidate.audioManifestURL, "Audio");
      const renditionURI = pickAudioRendition(manifest.split("\n"));
      if (!renditionURI)
        throw new Error("Couldn't find the original-language audio track.");
      const streamURL = new URL(renditionURI, candidate.audioManifestURL).href;
      if (!isGooglevideoURL(streamURL))
        throw new Error("Audio stream URL isn't on googlevideo.com.");
      entry.url = streamURL;
      entry.resolve(streamURL);
      if (candidate.videoId === videoState.videoId)
        videoState.streams.audio = streamURL;
    } catch (error) {
      log("obtainAudioStream:", error.message);
      entry.resolve(null);
    }
  }
}
export async function obtainVideoStream(candidate) {
  try {
    if (
      videoState.response ||
      fetchingVideoId === candidate.videoId ||
      candidate.videoId !== videoState.videoId
    )
      return;
    fetchingVideoId = candidate.videoId;
    log("obtainVideoStream:", candidate.videoId);
    const playerInfoPromise = fetchAndroidPlayerInfo(candidate.videoId);
    const manifest = await fetchManifest(candidate.hlsManifestURL, "Video");
    if (candidate.videoId !== videoState.videoId) {
      if (fetchingVideoId === candidate.videoId) fetchingVideoId = null;
      return;
    }
    let audioURL = null;
    if (settings.quality === "audio")
      audioURL = await Promise.race([
        audioStreamEntry(candidate.videoId).promise,
        new Promise((resolve) =>
          setTimeout(() => resolve(null), AUDIO_WAIT_MS),
        ),
      ]);
    if (candidate.videoId !== videoState.videoId) {
      if (fetchingVideoId === candidate.videoId) fetchingVideoId = null;
      return;
    }
    videoState.playlistContent = manifest;
    await swapInVideo(
      candidate,
      playerInfoPromise,
      audioURL || audioStreamEntry(candidate.videoId).url,
    );
  } catch (error) {
    if (fetchingVideoId === candidate.videoId) fetchingVideoId = null;
    if (candidate.videoId === videoState.videoId)
      handleExtensionError(error.message, candidate.videoId);
  }
}
// YouTube's own video element, once it's the main player (not the hover
// preview, and not parked off-screen).
function findOriginalVideo() {
  const original = document.querySelector(
    "video.video-stream:not([data-spelare-video])",
  );
  if (
    !original ||
    original.closest("#video-preview") ||
    parseInt(original.style.top) < 0
  )
    return null;
  return original;
}
// Polls every 50 ms for 10 s, then once a second until the user navigates
// away. It never gives up outright: a tab opened in the background may not
// get a player until it's shown.
async function waitForOriginalVideo(isCurrent) {
  return (
    (await pollFor(findOriginalVideo, {
      attempts: 200,
      intervalMs: 50,
      isCurrent,
    })) ||
    (await pollFor(findOriginalVideo, {
      attempts: Infinity,
      intervalMs: 1000,
      isCurrent,
    }))
  );
}
export async function swapInVideo(candidate, playerInfoPromise, audioURL) {
  const original = await waitForOriginalVideo(
    () => !videoState.response && candidate.videoId === videoState.videoId,
  );
  if (!original) {
    if (fetchingVideoId === candidate.videoId) fetchingVideoId = null;
    return;
  }
  videoState.response = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [],
      },
    },
  };
  if (fetchingVideoId === candidate.videoId) fetchingVideoId = null;
  log("setResponse");
  const video = original.cloneNode(true);
  original.replaceWith(video);
  setupStreams(video, audioURL || audioStreamEntry(candidate.videoId).url);
  playerInfoPromise.then(({ tracks, details }) => {
    if (
      candidate.videoId !== videoState.videoId ||
      !video.isConnected ||
      !videoState.response
    )
      return;
    if (details) {
      videoState.details = details;
      applyVideoDetails(details);
      // If YouTube has taken Now Playing over, the next timeupdate takes it
      // back (handlers included) with these details.
      if (ownsMediaSession()) updateNowPlaying();
    }
    if (tracks.length !== 0) {
      videoState.response.captions.playerCaptionsTracklistRenderer.captionTracks =
        tracks;
      setupCaptions(video);
    }
  });
}
