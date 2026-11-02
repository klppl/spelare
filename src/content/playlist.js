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
export function rewritePlaylist(lines, width) {
  let hasVariant = false;
  let includeNextLine = false;
  const output = [];
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
    else if (
      line.startsWith("#EXT-X-MEDIA") &&
      line.includes("TYPE=AUDIO") &&
      isAllowedRendition(line, hasOriginalAudio)
    )
      output.push(line);
    else if (
      (undefined === width && line.includes("RESOLUTION=")) ||
      line.includes(`RESOLUTION=${width}x`)
    ) {
      if (
        !isAllowedRendition(
          line,
          resolutionsWithOriginal.has(resolutionOf(line)),
        )
      )
        continue;
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
export function pickAudioRendition(lines) {
  const renditions = [];
  for (let line of lines)
    if (line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=AUDIO")) {
      const uri = line.match(/URI="(.+?)"/)?.[1];
      if (uri)
        renditions.push({
          default: line.includes("DEFAULT=YES"),
          highQuality: /\/itag\/234(?:\/|$)/.test(uri),
          kind: audioKind(`${line} ${uri}`),
          url: uri,
        });
    }
  let candidates = renditions.filter(
    (rendition) => rendition.kind !== "dubbed",
  );
  const originals = candidates.filter(
    (rendition) => rendition.kind === "original",
  );
  if (originals.length > 0) candidates = originals;
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
  const xtags = line.match(/YT-EXT-XTAGS="([^"]+)"/)?.[1];
  if (!xtags) return null;
  try {
    let base64 = xtags.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64).toLowerCase();
    if (decoded.includes("dubbed")) return "dubbed";
    if (decoded.includes("original")) return "original";
  } catch {}
  return null;
}
export function resolutionOf(line) {
  return line.match(/RESOLUTION=([^,]+)/)?.[1] ?? null;
}
