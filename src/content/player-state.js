// What's playing in this tab, for the badge and tooltip on Spelare's toolbar
// button (background.js shows them): Spelare's player with its quality,
// YouTube's own player (fallback), or nothing.
import { log } from "./log.js";
import { videoState } from "./state.js";

// Badge text has room for about four characters.
const SHORT_QUALITY = {
  "2160p": "4K",
  "1440p": "1440",
  "1080p": "1080",
  "720p": "720",
  "480p": "480",
  "360p": "360",
  "240p": "240",
  "144p": "144",
  auto: "Auto",
  audio: "♪",
};

// The badge text and tooltip for `state` ("spelare", "fallback" or "none").
export function playerBadge(state, quality) {
  if (state === "spelare") {
    const name =
      quality === "audio"
        ? "sound only"
        : quality === "auto"
          ? "Auto"
          : quality;
    return {
      text: SHORT_QUALITY[quality] ?? "",
      title: `Spelare is playing this video (${name})`,
    };
  }
  if (state === "fallback")
    return {
      text: "!",
      title:
        "YouTube's own player is playing this video. Click the quality button on the video to see why.",
    };
  return { text: "", title: "Spelare" };
}

let lastSent = null;
// Tells background.js what's playing now. Only the top frame speaks for
// the tab; repeats are skipped.
export function reportPlayerState(state) {
  if (window.top !== window) return;
  const badge = playerBadge(state, videoState.activeQuality ?? "auto");
  const key = `${badge.text}|${badge.title}`;
  if (key === lastSent) return;
  lastSent = key;
  log("playerState:", state, badge.text);
  browser.runtime.sendMessage({ type: "player-state", ...badge });
}
