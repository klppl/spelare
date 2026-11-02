// Video qualities Spelare can offer, best first. `width` is the frame width
// in the RESOLUTION=<width>x<height> attribute of YouTube's HLS variants;
// `youtubeName` is what YouTube's own player calls it (used on fallback).
export const VIDEO_QUALITIES = [
  { id: "2160p", width: "3840", youtubeName: "hd2160" },
  { id: "1440p", width: "2560", youtubeName: "hd1440" },
  { id: "1080p", width: "1920", youtubeName: "hd1080" },
  { id: "720p", width: "1280", youtubeName: "hd720" },
  { id: "480p", width: "854", youtubeName: "large" },
  { id: "360p", width: "640", youtubeName: "medium" },
  { id: "240p", width: "426", youtubeName: "small" },
  { id: "144p", width: "256", youtubeName: "tiny" },
];

// The toolbar's quality picker order: Auto, lowest to highest, then Sound only.
export const PICKER_QUALITIES = [
  "auto",
  ...VIDEO_QUALITIES.map((quality) => quality.id).reverse(),
  "audio",
];

export function youtubeQualityName(id) {
  return (
    VIDEO_QUALITIES.find((quality) => quality.id === id)?.youtubeName ?? "auto"
  );
}

// The video quality to play for the `wanted` setting, given the quality ids a
// video has: that one, else the best one below it ("best": the best there
// is). Null for Auto, Sound only, or when nothing at or below it exists.
export function pickVideoQuality(wanted, available) {
  const wantedIndex =
    wanted === "best"
      ? 0
      : VIDEO_QUALITIES.findIndex((quality) => quality.id === wanted);
  if (wantedIndex < 0) return null;
  return (
    VIDEO_QUALITIES.slice(wantedIndex).find((quality) =>
      available.includes(quality.id),
    )?.id ?? null
  );
}

// "1080p" → "1080p", "auto" → "Auto", "audio" → "Sound only" (as the
// popup calls it): the label shown in the toolbar.
export function qualityLabel(id) {
  if (id === "audio") return "Sound only";
  return `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}
