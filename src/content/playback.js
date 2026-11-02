import { log } from "./log.js";
import { callPlayer } from "./player.js";

export function speedUp(video) {
  log("speedUp");
  video.playbackRate = Math.min(video.playbackRate + 0.25, 2);
}
export function slowDown(video) {
  log("slowDown");
  video.playbackRate = Math.max(video.playbackRate - 0.25, 0.25);
}
export function toggleMute(video) {
  log("toggleMute");
  video.muted = !video.muted;
}
export function togglePlayPause(video) {
  log("playPause");
  if (video.paused)
    (async () => {
      try {
        await video.play();
      } catch (error) {}
    })();
  else video.pause();
}
export function toggleFullscreen(video) {
  log("toggleFullScreen");
  if (document.fullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
  } else video.requestFullscreen();
}
export function togglePictureInPicture(video) {
  log("togglePictureInPicture");
  if (document.pictureInPictureElement) document.exitPictureInPicture();
  else if (document.pictureInPictureEnabled) video.requestPictureInPicture();
}
// The span that can be seeked: 0 to the duration, or for a live stream (whose
// duration is Infinity) its seekable window. Null before metadata loads.
export function seekableRange(video) {
  if (Number.isFinite(video.duration)) return { start: 0, end: video.duration };
  const seekable = video.seekable;
  if (!seekable?.length) return null;
  return { start: seekable.start(0), end: seekable.end(seekable.length - 1) };
}
export function seekBackward(video, seconds) {
  log("seekBackward:", seconds);
  const start = seekableRange(video)?.start ?? 0;
  video.currentTime = Math.max(video.currentTime - seconds, start);
}
export function seekForward(video, seconds) {
  log("seekForward:", seconds);
  const range = seekableRange(video);
  if (range)
    video.currentTime = Math.min(video.currentTime + seconds, range.end);
}
export function toggleTheaterMode() {
  log("toggleTheater");
  callPlayer("toggleTheaterMode");
}
export function seekToPercent(video, percent) {
  log("seekTo:", percent);
  const range = seekableRange(video);
  if (range)
    video.currentTime =
      range.start + ((range.end - range.start) * percent) / 100;
}
export function playNextVideo() {
  log("nextVideo");
  callPlayer("nextVideo");
}
// Height of the bands at the top and bottom of the video where Safari draws
// its own controls (full screen, Picture in Picture and sound at the top,
// the play bar at the bottom), plus a little margin.
export const CONTROLS_BAND_PX = 48;

// Whether a point `y` pixels from the video's top is on Safari's controls,
// where a double-click means fast clicks on a button, not full screen.
export function isOnControls(y, height) {
  return y < CONTROLS_BAND_PX || y > height - CONTROLS_BAND_PX;
}

// Double-clicking the picture toggles full screen, as on YouTube. Clicks on
// Safari's controls (and so our own, which sit in the top band) don't count.
export function setupDoubleClickFullscreen(video) {
  video.addEventListener("dblclick", (event) => {
    const { top, height } = video.getBoundingClientRect();
    if (isOnControls(event.clientY - top, height)) return;
    event.preventDefault();
    toggleFullscreen(video);
  });
}
