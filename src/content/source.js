// Changing a <video>'s source while keeping its captions, position and play state.
import { removeCaptionTracks, setupCaptions } from "./captions.js";
import { log } from "./log.js";

// Loads `url`, then re-adds Spelare caption tracks, which show the caption
// track chosen for this video (videoState.captionChoice), or none.
export function setVideoSource(video, url) {
  removeCaptionTracks(video);
  video.src = url;
  video.load();
  video.addEventListener(
    "loadedmetadata",
    () => {
      setupCaptions(video);
    },
    {
      once: true,
    },
  );
}

// Switches to `url` and, once it can play, restores the playback position and
// resumes if it was playing. `pauseFirst` pauses before switching (used for
// user-initiated quality changes; an errored stream is switched as it is).
export function switchVideoSource(video, url, { pauseFirst = true } = {}) {
  log("switchVideoSource");
  const wasPaused = video.paused;
  const time = video.currentTime;
  if (pauseFirst) video.pause();
  setVideoSource(video, url);
  video.addEventListener(
    "canplay",
    () => {
      if (Number.isFinite(time)) video.currentTime = time;
      if (!wasPaused) video.play();
    },
    { once: true },
  );
}
