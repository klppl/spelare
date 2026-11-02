import { log } from "./log.js";
import { callPlayer } from "./player.js";
import { playNextVideo, seekBackward, seekForward } from "./playback.js";
import { videoState } from "./state.js";

// The metadata Spelare last gave Now Playing; anything else there is YouTube's.
let ownMetadata = null;

// Now Playing fields for `videoId`: title and channel from the player
// response's `details` when known, else the title from the page; artwork is
// YouTube's thumbnail.
export function nowPlayingMetadata(videoId, details, pageTitle = "") {
  return {
    title:
      details?.title ||
      pageTitle.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, ""),
    artist: details?.author || "",
    artwork: videoId
      ? [
          {
            src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            sizes: "320x180",
            type: "image/jpeg",
          },
          {
            src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            sizes: "480x360",
            type: "image/jpeg",
          },
        ]
      : [],
  };
}

export function updateNowPlaying() {
  ownMetadata = new MediaMetadata(
    nowPlayingMetadata(videoState.videoId, videoState.details, document.title),
  );
  navigator.mediaSession.metadata = ownMetadata;
}

// False once YouTube has put its own metadata (and handlers) in place.
export function ownsMediaSession() {
  return (
    ownMetadata !== null && navigator.mediaSession.metadata === ownMetadata
  );
}

// Takes the media keys and Now Playing controls back from YouTube, which
// replaces the metadata (and handlers) when its own player starts.
export function setupMediaSession(video) {
  log("setupMediaKeys");
  updateNowPlaying();
  const handlers = {
    play: async () => {
      await video.play();
    },
    pause: () => {
      video.pause();
    },
    seekbackward: () => {
      seekBackward(video, 10);
    },
    seekforward: () => {
      seekForward(video, 10);
    },
    previoustrack: () => {
      log("previousVideo");
      callPlayer("previousVideo");
    },
    nexttrack: () => {
      playNextVideo();
    },
  };
  // Clearing every handler before setting any is how the original did it.
  for (const action of Object.keys(handlers))
    navigator.mediaSession.setActionHandler(action, null);
  for (const [action, handler] of Object.entries(handlers))
    navigator.mediaSession.setActionHandler(action, handler);
}
