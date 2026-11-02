export function describePlaylist(dataURL) {
  if (!dataURL) return "no playable variant";
  const playlistLines = atob(dataURL.split(",")[1]).split("\n");
  const heightsByCodec = {};
  for (let line of playlistLines) {
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const codec = line.match(/CODECS="([^".,]+)/)?.[1] ?? "unknown";
    const height = Number(line.match(/RESOLUTION=\d+x(\d+)/)?.[1]);
    if (height) (heightsByCodec[codec] ??= []).push(height);
  }
  const ranges = Object.entries(heightsByCodec).map(
    ([codec, heights]) =>
      `${codec} ${Math.min(...heights)}p–${Math.max(...heights)}p`,
  );
  const audioCount = playlistLines.filter(
    (line) => line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO"),
  ).length;
  return `${ranges.join(", ")}; ${audioCount} audio renditions`;
}
// The master playlist cut down to the variants of one width (all widths when
// `width` is undefined) and one audio language: the original (dubbed tracks
// left out) when `dubLanguage` is null, else that dub. YouTube lists dubs
// either inside the original's audio groups (one rendition per language in
// "233", "234") or in groups of their own ("234-es"); either way only that
// language's renditions stay, marked DEFAULT, and only variants that use
// their groups. A data: URL, or false when nothing is left.
export function rewritePlaylist(lines, width, dubLanguage = null) {
  let hasVariant = false;
  let includeNextLine = false;
  const output = [];
  const isDub = (line) =>
    audioKind(line) === "dubbed" && audioLanguage(line) === dubLanguage;
  const dubGroups = new Set(
    dubLanguage === null
      ? []
      : lines.flatMap((line) =>
          isAudioMedia(line) && isDub(line)
            ? [attribute(line, "GROUP-ID")]
            : [],
        ),
  );
  const keepMedia = (line) =>
    dubLanguage === null
      ? isAllowedRendition(line, hasOriginalAudio)
      : isDub(line);
  const keepVariant = (line) =>
    dubLanguage === null
      ? isAllowedRendition(
          line,
          resolutionsWithOriginal.has(resolutionOf(line)),
        )
      : dubGroups.has(attribute(line, "AUDIO"));
  // A chosen dub must be what plays in its group.
  const asDefault = (line) =>
    dubLanguage === null ? line : line.replace("DEFAULT=NO", "DEFAULT=YES");
  const hasOriginalAudio = lines.some(
    (line) =>
      line.startsWith("#EXT-X-MEDIA") &&
      line.includes("TYPE=AUDIO") &&
      audioKind(line) === "original",
  );
  const resolutionsWithOriginal = new Set(
    lines.flatMap((line) => {
      if (
        !line.startsWith("#EXT-X-STREAM-INF") ||
        audioKind(line) !== "original"
      )
        return [];
      const resolution = resolutionOf(line);
      return resolution ? [resolution] : [];
    }),
  );
  for (let line of lines)
    if (includeNextLine) {
      includeNextLine = false;
      output.push(line);
    } else if (
      line.startsWith("#EXTM3U") ||
      line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")
    )
      output.push(line);
    else if (isAudioMedia(line) && keepMedia(line))
      output.push(asDefault(line));
    else if (
      (undefined === width && line.includes("RESOLUTION=")) ||
      line.includes(`RESOLUTION=${width}x`)
    ) {
      if (!keepVariant(line)) continue;
      const parts = line.split("SUBTITLES=");
      const beforeSubtitles = parts[0];
      includeNextLine = true;
      hasVariant = true;
      if (parts.length > 1)
        output.push(`${beforeSubtitles}CLOSED-CAPTIONS=NONE`);
      else output.push(beforeSubtitles);
    }
  if (hasVariant) {
    const playlist = output.join("\n");
    return `data:application/vnd.apple.mpegURL;base64,${btoa(encodeURIComponent(playlist).replace(/%([0-9A-F]{2})/g, (_match, hex) => String.fromCharCode("0x" + hex)))}`;
  }
  return false;
}
// The audio rendition for Sound only: the original (never a dub) when
// `dubLanguage` is null, else that dub; the higher-quality itag 234 first.
export function pickAudioRendition(lines, dubLanguage = null) {
  const renditions = [];
  for (let line of lines)
    if (isAudioMedia(line)) {
      const uri = line.match(/URI="(.+?)"/)?.[1];
      if (uri)
        renditions.push({
          default: line.includes("DEFAULT=YES"),
          highQuality: /\/itag\/234(?:\/|$)/.test(uri),
          kind: audioKind(`${line} ${uri}`),
          language: audioLanguage(line),
          url: uri,
        });
    }
  let candidates;
  if (dubLanguage !== null)
    candidates = renditions.filter(
      (rendition) =>
        rendition.kind === "dubbed" && rendition.language === dubLanguage,
    );
  else {
    candidates = renditions.filter((rendition) => rendition.kind !== "dubbed");
    const originals = candidates.filter(
      (rendition) => rendition.kind === "original",
    );
    if (originals.length > 0) candidates = originals;
  }
  candidates.sort(
    (a, b) =>
      Number(b.highQuality) - Number(a.highQuality) ||
      Number(b.default) - Number(a.default),
  );
  return candidates[0]?.url;
}
export function isAllowedRendition(line, requireOriginal) {
  const kind = audioKind(line);
  return kind !== "dubbed" && (!requireOriginal || kind === "original");
}
export function audioKind(line) {
  const lower = line.toLowerCase();
  if (lower.includes("dubbed")) return "dubbed";
  if (lower.includes("original")) return "original";
  const decoded = decodeXtags(line)?.toLowerCase();
  if (decoded?.includes("dubbed")) return "dubbed";
  if (decoded?.includes("original")) return "original";
  return null;
}
// YouTube's YT-EXT-XTAGS attribute, base64url-decoded (e.g.
// "acont=dubbed-auto:lang=es"), or null.
export function decodeXtags(line) {
  const xtags = line.match(/YT-EXT-XTAGS="([^"]+)"/)?.[1];
  if (!xtags) return null;
  try {
    let base64 = xtags.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    return atob(base64);
  } catch {
    return null;
  }
}
// An audio line's language: lang= in YouTube's tags, else LANGUAGE.
export function audioLanguage(line) {
  return (
    decodeXtags(line)?.match(/(?:^|:)lang=([\w-]+)/)?.[1] ??
    attribute(line, "LANGUAGE")
  );
}
export function isAudioMedia(line) {
  return line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO");
}
// A quoted attribute's value (NAME="…"), or null.
export function attribute(line, name) {
  return line.match(new RegExp(`(?:^|[:,])${name}="([^"]*)"`))?.[1] ?? null;
}
// The dubbed audio languages a master playlist offers, and the original's
// language (null when unknown): what the Audio menu lists.
export function audioTracks(lines) {
  const dubs = new Set();
  let original = null;
  for (const line of lines) {
    if (!isAudioMedia(line)) continue;
    const kind = audioKind(line);
    const language = audioLanguage(line);
    if (kind === "dubbed" && language) dubs.add(language);
    else if (kind === "original" && language) original ??= language;
  }
  return { original, dubs: [...dubs] };
}
export function resolutionOf(line) {
  return line.match(/RESOLUTION=([^,]+)/)?.[1] ?? null;
}
