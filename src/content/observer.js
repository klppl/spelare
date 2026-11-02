// Content script for the top www.youtube.com frame only (all_frames: false in
// manifest.json). It injects the stream observer and the yt-dlp/ejs solver it
// needs, about 170 KB, so the other frames that run mac.js don't parse them.
// The observer announces itself to mac.js with a "ready" message.
import { injectPageScript } from "./page.js";

injectPageScript(__SPELARE_PAGE_SCRIPT__("stream-observer"));
