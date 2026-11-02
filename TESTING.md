# Testing

## Automated

```sh
npm install
npm run build   # regenerate extension/mac.js and observer.js after editing src/
npm test        # node:test, no browser needed; fails if either is stale
```

Content-script and shared modules are imported straight from `src/` (with a few stub globals from
`tests/helpers/browser-globals.mjs`). Page scripts ship as strings, so their tests read them out of the
**built** `extension/mac.js` / `observer.js` and run them in a vm sandbox; build before testing.

`scripts/lib/mac-source.mjs` extracts the inlined page scripts from the build and evaluates the observer's
top-level declarations in a `vm` sandbox with stubbed globals (`tests/helpers/mac.mjs` names what tests use).
`tests/player-bridge.test.mjs` runs the whole bridge script against a fake player, fed what `callPlayer()` posts.

Covered: playlist rewriting and audio selection (`tests/fixtures/*.m3u8`, synthetic but
YouTube-shaped), start-time and video-id parsing, shared host/id/polling helpers, manifest fetching,
language names and same-language checks vs. the popup list, the quality table vs. the popup, hotkey
dispatch (fake events), settings defaults and storage keys, the audio-stream cache, the ANDROID, visionOS and WEB player
request shapes, the player bridge's commands and argument checks, `swapInVideo`'s polling schedule (mock
timers), debug-log batching and `background.js` receiving it, the popup showing the log as text, video-error and
candidate validation, legacy setting values (`jp`, `highres`), `shorts.js` reloading on navigation, the
observer shipping only in the top-frame `observer.js`, naming conventions across files (`data-spelare-*`
attributes vs. `mac.css`, runtime message types vs. `background.js`, the `window.__spelare` namespace), both
built files matching a fresh build of `src/`, and the vendored solver's hash.

Not covered: anything that needs the DOM, a real `<video>`, YouTube's page, or Safari.

### Equivalence checks for refactors

`scripts/lib/equivalence.mjs` decides whether two versions of a source file behave identically up to naming
and syntax spelling: it renames bindings scope-aware, optionally inlines single-use functions back into their call
site and normalises syntax through esbuild (`tests/equivalence.test.mjs` covers what it accepts and rejects). Example:

```js
import { compareCanonical } from './scripts/lib/equivalence.mjs';
compareCanonical(oldSource, newSource, { normalizeSyntax: true, inlineSingleUseFunctions: true }); // null = equivalent
```

`ignoreDeclarationKind` hides var/let/const differences, so declaration-kind changes still need review.
`compareTopLevel()` compares two IIFE scripts declaration by declaration, ignoring declaration order; `impureInitializers()` lists top-level
initialisers whose reordering could matter. `canonicalize()` throws if esbuild would delete an unused function,
since a change inside it would otherwise go unnoticed.

## Manual smoke test (Safari)

Build and run `xcode/SpelareDev`, enable the extension, open the Web Inspector console, then:

1. Open a `/watch` video: Spelare toolbar appears, video plays natively, no YouTube ads. The console shows
   no "pageObserver: did not start", and the video fills the player (also after resizing the window).
2. Quality picker: switch to 720p, then Auto, then Sound only; position and play state are kept.
   Theater turns theater mode on and off (so does `t`), and the button is filled while it's on.
   On a video with dubbed audio, an Audio button appears: picking a language switches the soundtrack
   and keeps the position and quality (or the closest one the dub has); Original goes back. Videos
   without dubs show no Audio button.
   Double-clicking the picture toggles full screen; double-clicking Safari's own buttons or play bar
   doesn't. The Spelare button in Safari's toolbar shows the playing quality (`1080`, `4K`, `Auto`, `♪`),
   `!` when YouTube's player took over, and nothing on pages without a video; hovering it says which.
3. Captions: `c` toggles; the "Auto-translated (…)" track exists; a popup language change applies without
   a reload. With "captions on by default", turning captions off then changing quality keeps them off.
   Settings saved before this update (captions on, auto-translate language, toolbar hidden) still apply.
4. Hotkeys: `j`/`l`, ←/→, `,`/`.` while paused, `k`/space, `m`, `i` (PiP), `f`, `t`, `<`/`>`, `0`–`9`,
   `q`/Shift-Q (quality up/down, also in fullscreen).
   Volume carries over to the next video; speed carries over to the next video from the same channel
   (another channel starts at 1×), and both survive a quality change. With "Even out loudness" on, a
   loud music video plays quieter than a talk video at the same volume; turning it off in the popup
   brings the music video back to full level at once.
   Changing "Default quality" in the popup switches the open video; "Show quality buttons" applies at once.
5. `?t=1m30s` link starts at 1:30; clicking a timestamp in the description seeks without reloading.
   Watch a long video for a few minutes, then reload it (or open its plain `/watch?v=` URL): it resumes
   there, with "Resumed at … · Start over" above the play bar; Start over goes back to 0:00. Finishing
   a video, or unticking "Resume videos where I left off", starts it from the beginning next time.
6. SPA navigation: click a related video; the old stream is torn down and the new one plays.
7. Autoplay on (popup): video end advances to the next video. Media keys: play/pause/next/previous.
   Reloading mid-video, then checking YouTube's history, shows the position you were at (hidden-player sync).
8. Shorts: opening `/shorts/…` then navigating to a normal video reloads into the full player.
9. Embed (`youtube-nocookie.com/embed/…`) and music.youtube.com still play. A watch page opened in a
   background tab plays once you switch to it.
10. Fallback: when a stream fails, the toolbar shows "… (Fallback)" and YouTube's own player plays; clicking it
    explains why (refused stream, or no stream found).
11. Popup "Show diagnostic log" lists the log for the session above as plain text, with no errors.
12. Popup "Show dislike counts": a number appears in YouTube's dislike button on watch pages (and
    follows navigation); unticking removes it at once.
13. Popup "Hide": each checkbox applies at once, without a reload. Shorts shelves and Shorts in results,
    the related videos next to a video, the home feed, comments, and end-screen tiles disappear; unticking
    brings them back. Playlists and live chat stay in the sidebar. Afterwards the diagnostic log has no
    `hideRules:` lines; each one names elements a rule in `mac.css` missed (`rule missed`), or Shorts that
    were only caught by their links (`hidden by link instead`), so a selector needs adding.
14. Popup: Japanese auto-translate (`ja`) produces a translated track; a setting saved as Japanese or 4320p by an
    older version shows as Japanese / Auto.
