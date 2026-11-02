import { log } from "./log.js";

// Settings under their names in code, with the browser.storage.sync key each
// is stored under. The keys are the popup's and stay as they are, so existing
// settings carry over: `showCaption` turns captions on by default, and
// `subtitles` is the auto-translate language.
const STORED_SETTINGS = {
  autoplay: { key: "autoplay", fallback: false },
  // Values older popups stored: 4320p never worked (it played Auto), and
  // YouTube's code for Japanese is ja, not jp.
  quality: { key: "quality", fallback: "auto", legacy: { highres: "auto" } },
  showToolbar: { key: "showToolbar", fallback: true },
  // Turn loud videos down to YouTube's target level (playback-prefs.js).
  evenLoudness: { key: "evenLoudness", fallback: true },
  // Dislike counts from Return YouTube Dislike (dislikes.js); off by default
  // because it sends each watched video's id to that service.
  showDislikes: { key: "showDislikes", fallback: false },
  // Reopen videos where they were left (resume.js).
  resumePlayback: { key: "resumePlayback", fallback: true },
  captionsOnByDefault: { key: "showCaption", fallback: false },
  translationLanguage: {
    key: "subtitles",
    fallback: "system",
    legacy: { jp: "ja" },
  },
  // Parts of YouTube to hide (see page-cleanup.js).
  hideShorts: { key: "hideShorts", fallback: false },
  hideEndScreens: { key: "hideEndScreens", fallback: false },
  hideComments: { key: "hideComments", fallback: false },
  hideRecommendations: { key: "hideRecommendations", fallback: false },
};
export const settings = Object.fromEntries(
  Object.entries(STORED_SETTINGS).map(([name, { fallback }]) => [
    name,
    fallback,
  ]),
);
export const videoState = {
  activeQuality: null,
  streams: {},
  videoId: null,
  // Title and channel for Now Playing, once the player response has them.
  details: null,
  // The dub picked from the Audio menu (a language code), or null for the
  // original audio; and the original audio-only stream (stream-urls.js).
  audioLanguage: null,
  originalAudioURL: null,
  // The visionOS master playlist, which lists dubs when the played one
  // doesn't (stream-urls.js).
  dubMaster: null,
  // The caption track chosen for this video: undefined until the default or
  // the user picks one, null for off, else a track label (see captions.js).
  captionChoice: undefined,
  playlistContent: null,
  response: null,
};
// A setting's value as stored (possibly unset, or a legacy value) mapped to
// the value the code uses.
export function settingValue(name, stored) {
  const { fallback, legacy } = STORED_SETTINGS[name];
  const value =
    legacy && Object.hasOwn(legacy, stored) ? legacy[stored] : stored;
  // Strings fall back when empty, booleans only when unset.
  if (typeof fallback === "string") return value || fallback;
  return value === undefined ? fallback : value;
}
export async function loadSettings() {
  const stored = await browser.storage.sync.get(
    Object.values(STORED_SETTINGS).map(({ key }) => key),
  );
  for (const [name, { key }] of Object.entries(STORED_SETTINGS))
    settings[name] = settingValue(name, stored[key]);
  log("loadSettings", settings);
}
// Keeps `settings` current when the popup (or another tab) changes one, and
// calls onChange(name) for each setting that changed.
export function listenForSettingChanges(onChange) {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [name, { key }] of Object.entries(STORED_SETTINGS)) {
      if (!Object.hasOwn(changes, key)) continue;
      const value = settingValue(name, changes[key].newValue);
      if (value === settings[name]) continue;
      settings[name] = value;
      log("settingChanged:", name, value);
      onChange(name);
    }
  });
}
