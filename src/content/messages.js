import { isGooglevideoURL } from "../shared/hosts.js";
import { isValidVideoId } from "../shared/video-id.js";

// Validates a candidate posted by the page observer (page-controlled data):
// a valid video id plus a googlevideo.com URL in `urlKey`. Returns a copy with
// only those two fields, or null.
export function validateCandidate(candidate, urlKey) {
  if (
    !candidate ||
    !isValidVideoId(candidate.videoId) ||
    !isGooglevideoURL(candidate[urlKey])
  )
    return null;
  return { [urlKey]: candidate[urlKey], videoId: candidate.videoId };
}

// Validates a video-error posted by the page observer: a valid video id and
// a string message (truncated). Returns a copy, or null.
export function validateVideoError(data) {
  if (!isValidVideoId(data?.videoId) || typeof data.message !== "string")
    return null;
  return { videoId: data.videoId, message: data.message.slice(0, 500) };
}
