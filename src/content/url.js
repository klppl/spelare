import { isValidVideoId } from "../shared/video-id.js";

export let initialHref = null;
try {
  initialHref = location.href;
} catch {}
export function startTimeFromNavigation() {
  const startTime = parseStartTime(location);
  if (startTime >= 0) return startTime;
  const navigationURL = navigationEntryURL();
  return videoIdFromURL(navigationURL) &&
    videoIdFromURL(navigationURL) === currentVideoId()
    ? parseStartTime(navigationURL)
    : -1;
}
export function navigationEntryURL() {
  try {
    const entry = performance.getEntriesByType("navigation")[0];
    if (entry?.name) return new URL(entry.name, location.href);
  } catch {}
  return new URL(initialHref || location.href);
}
// Start time in seconds from a URL's t= (or embed-style start=) parameter:
// "1h2m3s", "2m", "45s" or plain "90". -1 when there is none or it's invalid.
export function parseStartTime(url) {
  const params = new URLSearchParams(url.search);
  const value = params.get("t") ?? params.get("start");
  if (value === null) return -1;
  if (/^\d+$/.test(value)) return parseInt(value);
  const hms = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!hms || value === "") return -1;
  const [hours, minutes, seconds] = hms
    .slice(1)
    .map((part) => Number(part ?? 0));
  return hours * 3600 + minutes * 60 + seconds;
}
// The v= video id on a /watch URL; undefined when missing or not a valid id.
export function videoIdFromURL(url) {
  if (url.pathname !== "/watch") return undefined;
  const videoId = new URLSearchParams(url.search).get("v");
  return isValidVideoId(videoId) ? videoId : undefined;
}
export function currentVideoId() {
  const videoId = videoIdFromURL(location);
  if (videoId || location.pathname !== "/watch") return videoId;
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.href;
  if (canonicalHref)
    try {
      return videoIdFromURL(new URL(canonicalHref, location.href));
    } catch {}
}
