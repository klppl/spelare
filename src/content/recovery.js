import { log } from "./log.js";

export const MAX_CLOCK_JUMP_SECONDS = 2;
export const STALL_TIMEOUT_MS = 1500;
export const WATCH_DURATION_MS = 2500;
export const NUDGE_SECONDS = 0.05;
export const MAX_RECOVERY_ATTEMPTS = 2;
export function setupPlaybackRecovery(video) {
  log("setupPlaybackRecovery");
  let activeWatch = null;
  let resumePosition = video.currentTime;
  let recovering = false;
  function startWatch(anchorTime, attempts = 0) {
    const now = performance.now();
    const watch = {
      anchorTime: anchorTime,
      attempts: attempts,
      lastAdvanceAt: now,
      lastPosition: video.currentTime,
      startedAt: now,
    };
    activeWatch = watch;
    requestAnimationFrame((timestamp) => checkWatch(watch, timestamp));
  }
  function checkWatch(watch, timestamp) {
    if (activeWatch !== watch || !video.isConnected) return;
    if (recovering || video.paused || video.seeking) {
      requestAnimationFrame((nextTimestamp) =>
        checkWatch(watch, nextTimestamp),
      );
      return;
    }
    const position = video.currentTime;
    if (position > watch.lastPosition + 0.02) {
      watch.lastAdvanceAt = timestamp;
      watch.lastPosition = position;
    }
    const elapsedSeconds = (timestamp - watch.startedAt) / 1000;
    const expectedPosition =
      watch.anchorTime + elapsedSeconds * video.playbackRate;
    if (position - expectedPosition > MAX_CLOCK_JUMP_SECONDS)
      recover(watch, expectedPosition, "impossible resume jump");
    else if (
      timestamp - watch.lastAdvanceAt >= STALL_TIMEOUT_MS &&
      isInsideBufferedRange(video)
    )
      recover(watch, nudgedTime(video), "frozen playback clock");
    else if (timestamp - watch.startedAt >= WATCH_DURATION_MS)
      activeWatch = null;
    else
      requestAnimationFrame((nextTimestamp) =>
        checkWatch(watch, nextTimestamp),
      );
  }
  async function recover(watch, targetTime, reason) {
    if (activeWatch !== watch || recovering) return;
    if (watch.attempts >= MAX_RECOVERY_ATTEMPTS) {
      log("playbackRecovery: giving up after repeated recovery attempts");
      activeWatch = null;
      return;
    }
    recovering = true;
    const nextAttempt = watch.attempts + 1;
    const clampedTime = clampToDuration(video, targetTime);
    log(`playbackRecovery: ${reason}`, video.currentTime, clampedTime);
    try {
      video.pause();
      await seekAndWait(video, clampedTime);
      if (!video.isConnected) return;
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
        await waitForEvent(video, "canplay", 1500);
      await video.play();
      recovering = false;
      startWatch(clampedTime, nextAttempt);
    } catch (error) {
      log("playbackRecovery: recovery failed", error?.message || String(error));
      activeWatch = null;
    } finally {
      recovering = false;
    }
  }
  video.addEventListener("pause", () => {
    if (!recovering) {
      resumePosition = video.currentTime;
      activeWatch = null;
    }
  });
  video.addEventListener("seeking", () => {
    if (!recovering) activeWatch = null;
  });
  video.addEventListener("seeked", () => {
    if (!recovering)
      if (video.paused) resumePosition = video.currentTime;
      else startWatch(video.currentTime);
  });
  video.addEventListener("loadedmetadata", () => {
    if (!recovering) {
      resumePosition = video.currentTime;
      if (!video.paused) startWatch(video.currentTime);
    }
  });
  video.addEventListener("play", () => {
    if (!(recovering || video.readyState < HTMLMediaElement.HAVE_METADATA))
      startWatch(resumePosition);
  });
  video.addEventListener("ratechange", () => {
    if (!(recovering || video.paused)) startWatch(video.currentTime);
  });
}
export function clampToDuration(video, time) {
  const maxTime = Number.isFinite(video.duration)
    ? Math.max(video.duration - 0.01, 0)
    : time;
  return Math.max(0, Math.min(time, maxTime));
}
export function isInsideBufferedRange(video) {
  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);
    if (video.currentTime >= start - 0.1 && video.currentTime < end - 0.25)
      return true;
  }
  return false;
}
export function seekAndWait(video, time) {
  const seeked = waitForEvent(video, "seeked", 1500);
  video.currentTime = time;
  return seeked;
}
export function nudgedTime(video) {
  const target = video.currentTime + NUDGE_SECONDS;
  return !Number.isFinite(video.duration) || target < video.duration
    ? target
    : Math.max(video.currentTime - NUDGE_SECONDS, 0);
}
export function waitForEvent(target, type, timeoutMs) {
  return new Promise((resolve) => {
    let timer;
    const onEvent = () => finish(type);
    const finish = (result) => {
      window.clearTimeout(timer);
      target.removeEventListener(type, onEvent);
      resolve(result);
    };
    target.addEventListener(type, onEvent);
    timer = window.setTimeout(() => finish("timeout"), timeoutMs);
  });
}
