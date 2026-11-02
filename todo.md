# Todo

## Bugs

- [x] **Captions come back on after you turn them off.** With "Turn captions on by default" enabled,
  turning captions off and then changing quality turns them back on. `setVideoSource`
  ([src/content/source.js](src/content/source.js)) re-runs `setupCaptions`, which re-applies the
  default, and only restores your choice when a track was showing. The caption list from the Android
  request arrives later and also re-runs `setupCaptions`, so turning captions off right after the page
  loads gets undone too. Fix: apply the default once per video, and after that keep whatever the user
  chose, including "off".

## Platforms

- [ ] **iPhone and iPad.** Background playback (screen locked, or in another app) is the main reason to
  use Spelare on iOS. Needs:
  - an iOS target in the Xcode project
  - support for `m.youtube.com`
  - touch-friendly toolbar sizes (keyboard shortcuts don't apply there)

## Player

- [ ] **SponsorBlock.** Fetch segments from `sponsor.ajay.app`, looked up by a hash prefix of the video
  id so the service never learns which video is playing.
  - Skip, mute or just mark each category.
  - Popup setting per category (sponsor, intro, self-promo…).
  - A short "Skipped sponsor · Undo" message.
  - Show segments as chapters too (see below).
- [ ] **Chapters.** Read them from the player response or from description timestamps. Expose them as a
  `kind="chapters"` track and a chapter menu in the toolbar. SponsorBlock segments feed the same list.
- [x] **Change quality in fullscreen and theater mode.**
  - [x] `q` / Shift-Q cycles through qualities.
  - [x] The popup changes the current tab's quality right away, without a reload.
  - [ ] Show which quality was picked while in fullscreen (the toolbar isn't visible there).
- [x] **Double-click for fullscreen.** Only when both clicks land on the video area (not the native
  controls) and close together in time, so fast clicks on the controls don't trigger it.

## Playback

- [x] **Remember volume and speed** (per device: volume for every video, speed per channel).
- [x] Per-channel speed (e.g. podcasts at 1.5×, music at 1×).
- [x] **Resume where you left off**: YouTube's links carry its saved position as `t=`; other opens use
  positions Spelare keeps on this device, with a "Resumed at … · Start over" notice.
- [x] **Volume levelling.** The player response includes each video's loudness; turn loud videos down
  to an even level.
- [ ] **Audio-language picker.** Dubbed tracks are always filtered out today; let people choose one.

## Cleaner YouTube

Each one a setting in the popup, similar to Unhook.

- [x] Hide Shorts (shelves, tab and search results)
- [x] Hide end screens and video cards
- [x] Hide comments
- [x] Hide recommendations (watch-page sidebar and home feed)
- [ ] **Return YouTube Dislike** counts

## Polish

- [x] **Toolbar badge** showing whether Spelare, YouTube's fallback player or nothing is playing in the
  current tab.
- [x] **Settings apply without a reload.**

## Sync

- [ ] **iCloud sync** of settings between Mac, iPhone and iPad once iOS is supported. Settings already
  live in `browser.storage.sync`; check that Safari syncs it across devices, and fill any gaps through
  the native app.
