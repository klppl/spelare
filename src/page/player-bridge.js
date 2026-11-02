// Page-world bridge to YouTube's player API, which the content script can't
// reach from its isolated world. Installed once per frame at startup; the
// content script sends commands with callPlayer() (src/content/player.js).
import {
  CONTENT_MESSAGE,
  CONTENT_MESSAGE_SOURCE,
} from "../shared/page-messages.js";
import { claimInstall } from "../shared/namespace.js";
import { pollFor } from "../shared/poll.js";
import { isValidVideoId } from "../shared/video-id.js";

function moviePlayer() {
  return (
    document.getElementById("movie_player") ||
    document.getElementsByClassName("html5-video-player")[0]
  );
}

// Runs `action` with the player, if there is one.
function withPlayer(action) {
  return (...args) => {
    const player = moviePlayer();
    if (player) action(player, ...args);
  };
}

// Sizes the Spelare video to the player now and whenever the player resizes.
function fitVideoToPlayer(player) {
  const video = document.querySelector("video[data-spelare-video]");
  if (!video) return;
  player.addEventListener("resize", (event) => {
    video.style.width = event.width + "px";
    video.style.height = event.height + "px";
  });
  const size = player.getPlayerSize();
  video.style.width = size.width + "px";
  video.style.height = size.height + "px";
}

function isOriginalAudioTrack(track) {
  try {
    return atob(track.id.split(";")[1]).includes("original");
  } catch {
    return false;
  }
}

// Hands playback back to YouTube's own player.
function fallBack(player, { videoId, startTime, quality }) {
  player.loadVideoById(videoId, startTime, quality);
  player.unMute();
  if (player.getAvailableAudioTracks) {
    const original = player
      .getAvailableAudioTracks()
      .find(isOriginalAudioTrack);
    if (original) player.setAudioTrack(original);
  }
  // Mark YouTube's video so mac.css shows its controls once it exists.
  pollFor(() => document.querySelector("video"), {
    attempts: 30,
    intervalMs: 1000,
  }).then((video) => {
    if (!video) return;
    video.setAttribute("data-spelare-fallback", true);
    video.setAttribute("data-spelare-video", true);
  });
}

function isFallbackRequest(request) {
  return (
    isValidVideoId(request?.videoId) &&
    Number.isFinite(request.startTime) &&
    typeof request.quality === "string"
  );
}

// Commands by name; each validates its own arguments, since any page script
// can post these messages too.
const COMMANDS = {
  nextVideo: withPlayer((player) => player.nextVideo()),
  previousVideo: withPlayer((player) => player.previousVideo()),
  // Keeps YouTube's hidden player silent and paused behind the Spelare video.
  silence: withPlayer((player) => {
    player.mute();
    player.pauseVideo();
  }),
  // Keeps the hidden player's position (watch history, resume point) in step.
  syncTime: withPlayer((player, seconds) => {
    if (!Number.isFinite(seconds)) return;
    player.seekTo(seconds);
    player.mute();
    player.pauseVideo();
  }),
  fitVideoToPlayer: withPlayer(fitVideoToPlayer),
  fallBack: withPlayer((player, request) => {
    if (isFallbackRequest(request)) fallBack(player, request);
  }),
  // The player's own theater button: still in the page (mac.css hides
  // YouTube's controls, it doesn't remove them). The hotkey manager's method
  // is what older YouTube versions offered.
  toggleTheaterMode: () => {
    const sizeButton = document.querySelector(".ytp-size-button");
    if (sizeButton) {
      sizeButton.click();
      return;
    }
    const hotkeys = document.querySelector("yt-Hotkey-Manager");
    if (typeof hotkeys?.toggleTheaterMode === "function")
      hotkeys.toggleTheaterMode();
  },
};

function install() {
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== CONTENT_MESSAGE_SOURCE ||
      event.data.type !== CONTENT_MESSAGE.PLAYER_COMMAND
    )
      return;
    const { command, args } = event.data;
    if (!Object.hasOwn(COMMANDS, command) || !Array.isArray(args)) return;
    COMMANDS[command](...args);
  });
}

if (claimInstall("playerBridge")) install();
