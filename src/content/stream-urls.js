// The playable sources for the current video, from YouTube's master
// playlist: one per quality plus Auto, all with the chosen audio (the
// original, or a dub picked from the Audio menu), and Sound only.
import {
  audioTracks,
  pickAudioRendition,
  rewritePlaylist,
} from "./playlist.js";
import { VIDEO_QUALITIES } from "./qualities.js";
import { videoState } from "./state.js";

const NO_TRACKS = { original: null, dubs: [] };

// The master playlist that offers dubs, as lines, or null. The one Spelare
// plays may not (YouTube's own player response often has sound built into
// the video); the visionOS one fetched for Sound only usually does
// (videoState.dubMaster).
export function dubPlaylistLines() {
  for (const content of [videoState.playlistContent, videoState.dubMaster]) {
    const lines = content?.split("\n");
    if (lines && audioTracks(lines).dubs.length > 0) return lines;
  }
  return null;
}

// What the Audio menu offers for the current video.
export function availableAudioTracks() {
  const lines = dubPlaylistLines();
  return lines ? audioTracks(lines) : NO_TRACKS;
}

// Fills videoState.streams for videoState.audioLanguage (null: original).
// The original Sound only stream prefers the separate audio-only stream the
// page observer found (videoState.originalAudioURL).
export function buildStreams() {
  const dub = videoState.audioLanguage;
  const lines =
    dub === null
      ? videoState.playlistContent.split("\n")
      : (dubPlaylistLines() ?? videoState.playlistContent.split("\n"));
  const streams = { auto: rewritePlaylist(lines, undefined, dub) };
  for (const quality of VIDEO_QUALITIES) {
    const streamURL = rewritePlaylist(lines, quality.width, dub);
    if (streamURL) streams[quality.id] = streamURL;
  }
  const audio =
    dub === null
      ? videoState.originalAudioURL || pickAudioRendition(lines)
      : pickAudioRendition(lines, dub);
  if (audio) streams.audio = audio;
  videoState.streams = streams;
}
