# Spelare

Spelare is a Safari web extension that plays YouTube videos directly in Safari's native `<video>` player using YouTube's native HLS streams.

By utilizing native HLS playback, Spelare provides:
- Clean, ad-free video playback
- Low battery consumption and efficient hardware-accelerated decoding
- Full support for macOS native Picture-in-Picture, AirPlay, and system media keys
- Clean toolbar with resolution picker (Auto, 2160p, 1440p, 1080p, 720p, 480p, 360p, Sound only)
- Native subtitles with auto-translation support

---

## Architecture

- **`extension/`**: The manifest v3 Safari extension files:
  - `manifest.json`: Web extension manifest (v1.0).
  - `mac.js`: Main content script (bundled from `src/content/`).
  - `observer.js`: Top-frame content script that injects the stream observer.
  - `mac.css`: Styles for the native video overlay and Spelare toolbar.
  - `shorts.js`: Navigation handler for YouTube Shorts.
  - `override.js`: Page-world ad interception on YouTube Music and YouTube Kids.
  - `background.js`: Ring buffer for diagnostic logging.
  - `popup.html` / `popup.js`: Extension settings popup.
- **`src/`**: Modular source code:
  - `src/content/`: Content scripts (ES modules).
  - `src/page/`: Page-world scripts (`stream-observer.js`, `player-bridge.js`, `caption-mirroring.js`).
  - `src/shared/`: Shared utilities, host validation, and messaging protocols.
  - `src/page/vendor/`: Vendored challenge solver (`yt-dlp/ejs`).
- **`xcode/SpelareDev/`**: Native macOS Xcode host application and Safari extension wrapper.
- **`design/`**: App and toolbar SVG icon assets and rendering script.

---

## Development

### Prerequisites

- Node.js (v18+)
- Xcode (for macOS host application)

### Build & Test

```sh
# Install dependencies
npm install

# Build extension scripts from src/
npm run build

# Verify build matches src/
npm run check-build

# Run automated tests
npm test
```

### Xcode Development App

Open `xcode/SpelareDev/SpelareDev.xcodeproj` in Xcode to build and run the development container app, then enable Spelare in Safari Settings > Extensions.

### Releasing

Releases are Developer ID signed, notarized DMGs on GitHub with Sparkle updates. See [RELEASING.md](RELEASING.md).
