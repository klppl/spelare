// window.postMessage protocol between the page scripts and the content script.
// Messages the page observer posts to the content script.
export const PAGE_MESSAGE_SOURCE = "spelare-page-observer";

export const PAGE_MESSAGE = {
  READY: "ready",
  DIAGNOSTIC: "diagnostic",
  PLAYER_RESPONSE: "player-response",
  AUDIO_RESPONSE: "audio-response",
  VIDEO_ERROR: "video-error",
};

// Messages the content script posts to its page scripts.
export const CONTENT_MESSAGE_SOURCE = "spelare-content";

export const CONTENT_MESSAGE = {
  PING: "ping",
  PLAYER_COMMAND: "player-command",
};
