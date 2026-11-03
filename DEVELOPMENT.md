# Development

How Spelare is built. For installing and using it, see the [README](README.md).

## How it works

Spelare swaps YouTube's player for a plain `<video>` element and gives it YouTube's own HLS streams,
which Safari plays natively. A page-world observer finds the stream for the current video (from
YouTube's player response, or failing that its own visionOS or web player request), solves the throttling challenge in its URL,
and hands it to the content script. The content script rewrites the master playlist into one playlist
per quality, swaps the video in, and adds the capsule of controls on top. Captions, chapters and video
details come from an Android player request.

## Architecture

- **`extension/`**: the Manifest V3 Safari extension, shared by the Mac, iPhone and iPad apps:
  - `manifest.json`: the extension manifest. Its `version` is also the app version.
  - `mac.js`: the main content script, bundled from `src/content/` (don't edit it by hand).
  - `observer.js`: top-frame content script that injects the stream observer.
  - `mac.css`: styles for the video, the capsule of controls and the hide options.
  - `shorts.js`: navigation handler for YouTube Shorts.
  - `override.js`: page-world ad interception on YouTube Music and YouTube Kids.
  - `background.js`: the diagnostic log (kept in `storage.session`), the toolbar badge, and iCloud sync
    through the native app.
  - `popup.html` / `popup.js` / `popup.css`: the settings popup.
- **`src/`**: the source that's bundled into `extension/`:
  - `src/content/`: content-script modules (ES modules).
  - `src/page/`: page-world scripts (`stream-observer.js`, `player-bridge.js`, `caption-mirroring.js`).
  - `src/page/vendor/`: the vendored challenge solver (`yt-dlp/ejs`), with its own licenses.
  - `src/shared/`: helpers shared by both, such as host checks and page messages.
- **`xcode/SpelareDev/`**: the Mac app and its extension target. Its native handler
  (`SafariWebExtensionHandler.swift`) keeps synced values in iCloud's key-value store.
- **`xcode/ios/Spelare/`**: the iPhone and iPad app and extension. It uses the same `extension/` files,
  and the Mac project's native handler and iCloud entitlement.
- **`design/`**: the app and toolbar icons, the README's buttons and label, and the icon rendering script.
  `design/mockups/` builds the README's screenshots from the extension's real CSS, popup and
  `popup.js`; run `design/mockups/build.sh` after changing how Spelare looks.

## Build and test

You need Node.js 18 or later, and Xcode for the apps.

```sh
npm install         # dependencies
npm run build       # bundle src/ into extension/mac.js and observer.js
npm run check-build # check the bundles match src/
npm test            # automated tests, no browser needed
```

Rebuild after editing anything in `src/`; the tests read the bundled page scripts, and fail if the
bundles are stale.

## Run it

- **Mac:** open `xcode/SpelareDev/SpelareDev.xcodeproj` in Xcode, run the `SpelareDev` scheme, then turn
  on Spelare in Safari ▸ Settings ▸ Extensions.
- **iPhone and iPad:** build `xcode/ios/Spelare/Spelare.xcodeproj` for a simulator or a registered
  device, then turn on Spelare in Settings ▸ Apps ▸ Safari ▸ Extensions.

[TESTING.md](TESTING.md) covers what the tests check and how to test by hand, including on iPhone and
iPad.

## Releasing

Releases are Developer ID signed, notarized DMGs on GitHub, with Sparkle updating installed copies. See
[RELEASING.md](RELEASING.md).
