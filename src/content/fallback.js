import { log } from "./log.js";
import { qualityLabel, youtubeQualityName } from "./qualities.js";
import { callPlayer } from "./player.js";
import { settings, videoState } from "./state.js";
import { applyToolbarVisibility, createToolbar } from "./toolbar.js";
import { currentVideoId, startTimeFromNavigation } from "./url.js";
import { pollFor } from "../shared/poll.js";
import { reportPlayerState } from "./player-state.js";

const YOUTUBE_ERROR = "youtube-error";

// What the "(Fallback)" toolbar button explains when clicked.
const STREAM_REFUSED_NOTICE =
  "YouTube refused to send this video (error 403). The problem is on YouTube's side, not in Spelare. Clearing Safari's history and reloading usually fixes it.";
export const STREAM_NOT_FOUND_NOTICE =
  "Spelare couldn't get a stream for this video from YouTube, so YouTube's own player is playing it. Reloading the page sometimes helps.";

export function fallbackToYouTube(
  video,
  { releaseVideo = true, notice = STREAM_REFUSED_NOTICE } = {},
) {
  log("fallbackToYouTube");
  // A Spelare video that fails mid-playback hands over where it got to.
  const startTime = fallbackStartTime(
    releaseVideo ? video.currentTime : 0,
    startTimeFromNavigation(),
  );
  if (releaseVideo) video.remove();
  showFallbackNotice("Fallback", notice);
  reportPlayerState("fallback");
  callPlayer("fallBack", {
    videoId: currentVideoId(),
    startTime,
    quality: youtubeQualityName(settings.quality),
  });
}
// Where YouTube's player starts: the position reached, once playback got
// anywhere, else the start time the page was opened with.
export function fallbackStartTime(position, navigationStartTime) {
  return Number.isFinite(position) && position > 0
    ? position
    : navigationStartTime;
}
export function showFallbackNotice(label, message) {
  const qualityButton = document.querySelector(
    "#spelare-toolbar .controls .quality",
  );
  if (!qualityButton) return;
  const replacement = qualityButton.cloneNode(true);
  qualityButton.replaceWith(replacement);
  replacement.textContent = `${qualityLabel(settings.quality)} (${label})`;
  replacement.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    alert(message);
  });
}
// Falls back to YouTube's player for `videoId`, once its video element
// exists. Checks once a second until then, and stops if the user navigates
// away or YouTube shows its own error.
export async function handleExtensionError(message, videoId, { notice } = {}) {
  const isCurrent = () =>
    videoId === videoState.videoId && !videoState.response?.fallback;
  if (!isCurrent()) return;
  log("handleExtensionError:", message);
  const found = await pollFor(
    () =>
      document.querySelector("yt-player-error-message-renderer")
        ? YOUTUBE_ERROR
        : document.querySelector("video"),
    { attempts: Infinity, intervalMs: 1000, isCurrent },
  );
  if (!found || found === YOUTUBE_ERROR) return;
  videoState.response = {
    fallback: true,
  };
  applyToolbarVisibility();
  createToolbar(found);
  fallbackToYouTube(found, {
    releaseVideo: false,
    notice,
  });
}
