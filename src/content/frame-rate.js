// Frame duration for `,`/`.` frame stepping, measured from the frames Safari
// presents (requestVideoFrameCallback), since YouTube serves 24, 25, 30, 50
// and 60 fps, and Auto can switch between them mid-video.
import { log } from "./log.js";

// Used until a frame duration has been measured.
export const DEFAULT_FRAME_SECONDS = 1 / 30;
// Deltas outside 240–10 fps are dropped frames or seeks, not a frame.
const MIN_FRAME_SECONDS = 1 / 240;
const MAX_FRAME_SECONDS = 1 / 10;

const frameSeconds = new WeakMap();

export function frameDuration(video) {
  return frameSeconds.get(video) ?? DEFAULT_FRAME_SECONDS;
}

// The frame duration two consecutive presented frames show, or null.
export function measuredFrameDuration(previous, current) {
  if (!previous || current.presentedFrames - previous.presentedFrames !== 1)
    return null;
  const delta = current.mediaTime - previous.mediaTime;
  return delta >= MIN_FRAME_SECONDS && delta <= MAX_FRAME_SECONDS
    ? delta
    : null;
}

export function trackFrameDuration(video) {
  if (typeof video.requestVideoFrameCallback !== "function") {
    log("trackFrameDuration: requestVideoFrameCallback unavailable");
    return;
  }
  let previous = null;
  const onFrame = (_now, metadata) => {
    if (!video.isConnected) return;
    const measured = measuredFrameDuration(previous, metadata);
    if (measured !== null) frameSeconds.set(video, measured);
    previous = {
      presentedFrames: metadata.presentedFrames,
      mediaTime: metadata.mediaTime,
    };
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}
