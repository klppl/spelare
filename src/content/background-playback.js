// Background playback on iPhone and iPad. iOS pauses a video with sound when
// the screen locks or Safari goes to the background, but lets sound-only
// playback carry on. So while the page is hidden, a playing video switches to
// its sound-only stream, and back to the quality it had once it's shown again.
import { log } from "./log.js";
import { reportPlayerState } from "./player-state.js";
import { switchVideoSource } from "./source.js";
import { videoState } from "./state.js";

// iOS may pause the video just before the page reports it's hidden; a pause
// this close to hiding counts as iOS's, not the user's.
export const SYSTEM_PAUSE_WINDOW_MS = 1000;

// iPhone, and iPad (which says it's a Mac, but has a touch screen).
export function isIOS(nav = navigator) {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

function inPictureInPicture(video) {
  return (
    document.pictureInPictureElement === video ||
    video.webkitPresentationMode === "picture-in-picture"
  );
}

export function setupBackgroundPlayback(video, { ios = isIOS() } = {}) {
  if (!ios) return;
  let lastPauseAt = -Infinity;
  // The quality to go back to, while sound only is standing in for it.
  let hiddenFrom = null;
  video.addEventListener("pause", () => {
    lastPauseAt = performance.now();
  });
  // On window, capturing: Spelare's page script stops visibilitychange at the
  // document (so YouTube's hidden player never pauses), which would hide it
  // from a listener there too.
  window.addEventListener(
    "visibilitychange",
    () => {
      if (!video.isConnected) return;
      if (document.hidden) {
        const playing =
          !video.paused ||
          performance.now() - lastPauseAt < SYSTEM_PAUSE_WINDOW_MS;
        const quality = videoState.activeQuality;
        log("backgroundPlayback: hidden", { paused: video.paused, quality });
        if (
          !playing ||
          quality === "audio" ||
          !videoState.streams.audio ||
          inPictureInPicture(video)
        )
          return;
        log("backgroundPlayback: sound only while hidden, from", quality);
        hiddenFrom = quality;
        switchTo(video, "audio");
      } else if (hiddenFrom) {
        const quality = hiddenFrom;
        hiddenFrom = null;
        // The user may have picked something else meanwhile (lock screen
        // controls can't, but the Settings menu could after a quick unlock).
        if (
          videoState.activeQuality !== "audio" ||
          !videoState.streams[quality]
        )
          return;
        log("backgroundPlayback: back to", quality);
        switchTo(video, quality, { resume: !video.paused });
      }
    },
    true,
  );
}

// Switches the stream without saving it as the default quality; sound only
// starts playing right away, since iOS has already paused the video.
function switchTo(video, quality, { resume = true } = {}) {
  videoState.activeQuality = quality;
  switchVideoSource(video, videoState.streams[quality], { pauseFirst: false });
  if (resume)
    video.play().catch((error) => log("backgroundPlayback:", error.message));
  reportPlayerState("spelare");
}
