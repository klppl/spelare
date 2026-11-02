import { isSameLanguage, languageName } from "./languages.js";
import { log } from "./log.js";
import { settings, videoState } from "./state.js";
import { isYouTubeURL } from "../shared/hosts.js";
import {
  CLIENTS,
  PLAYER_ENDPOINT,
  playerRequestBody,
} from "../shared/innertube.js";

const AUTO_TRANSLATED_PREFIX = "Auto-translated";

export function toggleSubtitles(video, enableOnly = false) {
  log("toggleSubtitles:", enableOnly);
  const tracks = Array.from(video.textTracks);
  const showing = tracks.find((track) => track.mode === "showing");
  const autoTranslated = tracks.find((track) =>
    track.label.startsWith(AUTO_TRANSLATED_PREFIX),
  );
  if (showing) {
    if (!enableOnly) showing.mode = "disabled";
  } else if (autoTranslated) autoTranslated.mode = "showing";
  videoState.captionChoice = showingCaptionLabel(video);
}
// The label of the subtitle track showing on `video`, or null for none.
export function showingCaptionLabel(video) {
  return (
    Array.from(video.textTracks).find(
      (track) => track.kind === "subtitles" && track.mode === "showing",
    )?.label ?? null
  );
}
// The caption track to show after (re)building the tracks: undefined while
// nothing has been chosen for this video (so the default applies), null for
// off, else the label of the track that was chosen. A chosen label that no
// longer exists (the auto-translate language changed) means auto-translated.
export function captionTrackToShow(choice, labels, captionsOnByDefault) {
  const autoTranslated = labels.find((label) =>
    label.startsWith(AUTO_TRANSLATED_PREFIX),
  );
  if (choice === undefined)
    return captionsOnByDefault ? (autoTranslated ?? null) : null;
  if (choice === null) return null;
  return labels.includes(choice) ? choice : (autoTranslated ?? null);
}
// Records the caption track the user picks (hotkey, native caption menu or
// Now Playing) as this video's choice, so rebuilding the tracks keeps it.
const watchedVideos = new WeakSet();
function watchCaptionChoice(video) {
  if (watchedVideos.has(video)) return;
  watchedVideos.add(video);
  video.textTracks.addEventListener("change", () => {
    // While the tracks are being replaced, nothing showing isn't a choice.
    if (!video.querySelector("track[data-spelare-caption]")) return;
    videoState.captionChoice = showingCaptionLabel(video);
  });
}
function applyCaptionChoice(video) {
  const tracks = Array.from(video.textTracks).filter(
    (track) => track.kind === "subtitles",
  );
  const label = captionTrackToShow(
    videoState.captionChoice,
    tracks.map((track) => track.label),
    settings.captionsOnByDefault,
  );
  for (const track of tracks)
    track.mode = track.label === label ? "showing" : "disabled";
  videoState.captionChoice = label;
}
export function removeCaptionTracks(video) {
  video
    .querySelectorAll("track[data-spelare-caption]")
    .forEach((track) => track.remove());
}
export function setupCaptions(video) {
  log("setupCaptions");
  let translateSource;
  const captionTracks =
    videoState.response?.captions?.playerCaptionsTracklistRenderer
      ?.captionTracks;
  if (!captionTracks?.length) return;
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    video.addEventListener("loadedmetadata", () => setupCaptions(video), {
      once: true,
    });
    return;
  }
  removeCaptionTracks(video);
  captionTracks.forEach((captionTrack) => {
    const trackElement = document.createElement("track");
    trackElement.label = captionTrack.name.runs[0].text;
    trackElement.kind = "subtitles";
    trackElement.srclang = captionTrack.languageCode;
    trackElement.src = captionTrackURL(captionTrack.baseUrl);
    trackElement.setAttribute("data-spelare-caption", "");
    video.appendChild(trackElement);
  });
  const translateLanguage =
    settings.translationLanguage === "system"
      ? navigator.language
      : settings.translationLanguage;
  const englishTracks = captionTracks.filter(
    (track) => track.languageCode === "en",
  );
  translateSource =
    englishTracks.length > 0 ? englishTracks[0] : captionTracks[0];
  const translatedTrack = document.createElement("track");
  translatedTrack.label = `${AUTO_TRANSLATED_PREFIX} (${languageName(translateLanguage)})`;
  translatedTrack.kind = "subtitles";
  translatedTrack.srclang = translateLanguage;
  if (isSameLanguage(translateSource.languageCode, translateLanguage))
    translatedTrack.src = captionTrackURL(translateSource.baseUrl);
  else
    translatedTrack.src = captionTrackURL(
      translateSource.baseUrl,
      translateLanguage,
    );
  translatedTrack.setAttribute("data-spelare-caption", "");
  video.appendChild(translatedTrack);
  watchCaptionChoice(video);
  applyCaptionChoice(video);
}
export function captionTrackURL(baseURL, translateTo) {
  const url = new URL(baseURL);
  url.searchParams.set("fmt", "vtt");
  if (translateTo) url.searchParams.set("tlang", translateTo);
  return url.href;
}
// Caption tracks and Now Playing details for `videoId`, from the ANDROID
// player response: { tracks, details }, with no tracks and null details if
// the request fails.
export async function fetchAndroidPlayerInfo(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com${PLAYER_ENDPOINT}?prettyPrint=false`,
      {
        method: "POST",
        body: JSON.stringify(androidPlayerRequest(videoId)),
      },
    );
    if (!response.ok)
      throw new Error(
        `Android caption request returned HTTP ${response.status}.`,
      );
    const data = await response.json();
    return {
      tracks: captionTracksFrom(data),
      details: videoDetailsFrom(data, videoId),
    };
  } catch (error) {
    log("obtainAndroidCaptionTracks:", error.message);
    return { tracks: [], details: null };
  }
}
// The usable caption tracks in a player response, copied and truncated.
export function captionTracksFrom(data) {
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks)
    ? tracks.slice(0, 64).flatMap((track) => {
        const name = track?.name?.runs?.[0]?.text ?? track?.name?.simpleText;
        return typeof track?.baseUrl !== "string" ||
          track.baseUrl.length > 8192 ||
          !isYouTubeURL(track.baseUrl) ||
          typeof track?.languageCode !== "string" ||
          track.languageCode.length > 32 ||
          typeof name !== "string"
          ? []
          : [
              {
                baseUrl: track.baseUrl,
                languageCode: track.languageCode,
                name: {
                  runs: [
                    {
                      text: name.slice(0, 200),
                    },
                  ],
                },
              },
            ];
      })
    : [];
}
// From a player response for `videoId`: title and channel name (Now
// Playing), channel id (per-channel speed) and loudness in dB above YouTube's
// target level (volume levelling). Null if it's for another video.
export function videoDetailsFrom(data, videoId) {
  const details = data?.videoDetails;
  if (details?.videoId !== videoId || typeof details.title !== "string")
    return null;
  const loudnessDb = data?.playerConfig?.audioConfig?.loudnessDb;
  return {
    title: details.title.slice(0, 500),
    author:
      typeof details.author === "string" ? details.author.slice(0, 200) : "",
    channelId: /^UC[\w-]{22}$/.test(details.channelId)
      ? details.channelId
      : null,
    loudnessDb:
      Number.isFinite(loudnessDb) && Math.abs(loudnessDb) <= 60
        ? loudnessDb
        : null,
  };
}
// Player request as the ANDROID app, whose responses include caption tracks.
export function androidPlayerRequest(videoId) {
  return playerRequestBody(videoId, { client: CLIENTS.ANDROID });
}
