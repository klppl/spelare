import { log } from "./log.js";
import { toggleTheaterMode } from "./playback.js";
import {
  PICKER_QUALITIES,
  pickVideoQuality,
  qualityLabel,
} from "./qualities.js";
import { languageName } from "./languages.js";
import { switchVideoSource } from "./source.js";
import { availableAudioTracks, buildStreams } from "./stream-urls.js";
import { reportPlayerState } from "./player-state.js";
import { settings, videoState } from "./state.js";

// A toolbar button. Mouse clicks don't focus it, so Space and the other
// hotkeys keep going to the video afterwards.
export function makeToolbarButton(label, onClick, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("button");
  if (className) button.classList.add(className);
  button.textContent = label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    onClick(event);
  });
  return button;
}
// The quality menu's order: Auto, then best to worst, then Sound only.
export const MENU_QUALITIES = [
  "auto",
  ...PICKER_QUALITIES.filter(
    (quality) => !["auto", "audio"].includes(quality),
  ).reverse(),
  "audio",
];
// Opens a menu below `anchor`, like a macOS pop-up menu: `items` are
// { id, label, active, separatorBefore, prefix? } or { heading } (a section
// title, not pickable), and picking one calls
// onPick(id). Each row is one line; a long label is cut short (the whole of
// it shows on hover), and a prefix (a chapter's time) gets a column of its
// own so labels line up.
// Escape, a click anywhere else or the anchor again closes it unchanged.
export function openMenu(toolbar, anchor, name, items, onPick) {
  closeMenu(toolbar);
  const menu = document.createElement("div");
  menu.classList.add("picker");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", name);
  menu.style.setProperty("--spelare-menu-left", `${anchor.offsetLeft}px`);
  for (const item of items) {
    if (item.separatorBefore && menu.childElementCount > 0) {
      const separator = document.createElement("div");
      separator.classList.add("separator");
      separator.setAttribute("role", "separator");
      menu.appendChild(separator);
    }
    if (item.heading) {
      const heading = document.createElement("div");
      heading.classList.add("menu-heading");
      heading.setAttribute("role", "presentation");
      heading.textContent = item.heading;
      menu.appendChild(heading);
      continue;
    }
    const button = makeToolbarButton("", () => {
      closeMenu(toolbar);
      onPick(item.id);
    });
    if (item.prefix) {
      const prefix = document.createElement("span");
      prefix.classList.add("menu-prefix");
      prefix.textContent = item.prefix;
      button.appendChild(prefix);
    }
    const label = document.createElement("span");
    label.classList.add("menu-label");
    label.textContent = item.label;
    button.appendChild(label);
    button.title = item.prefix ? `${item.prefix}  ${item.label}` : item.label;
    button.setAttribute("role", "menuitemradio");
    button.classList.toggle("active", item.active);
    button.setAttribute("aria-checked", String(item.active));
    menu.appendChild(button);
  }
  const dismiss = new AbortController();
  menu.dismiss = dismiss;
  menu.anchor = anchor;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!toolbar.contains(event.target)) closeMenu(toolbar);
    },
    { capture: true, signal: dismiss.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      closeMenu(toolbar);
    },
    { capture: true, signal: dismiss.signal },
  );
  toolbar.appendChild(menu);
  fitMenu(toolbar, menu);
  anchor.setAttribute("aria-expanded", "true");
  toolbar.updateVisibility?.();
}
// Lets a long menu (a video with twenty dubs) use the video's height down to
// Safari's play bar, and opens it with the playing item in view.
function fitMenu(toolbar, menu) {
  const video = toolbar.parentElement?.querySelector(
    "video[data-spelare-video]",
  );
  if (video) {
    const top = toolbar.offsetTop + toolbar.offsetHeight + 6;
    const room = video.clientHeight - top - MENU_BOTTOM_MARGIN_PX;
    menu.style.setProperty(
      "--spelare-menu-max-height",
      `${Math.max(room, MENU_MIN_HEIGHT_PX)}px`,
    );
  }
  menu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
}
// Room left below a menu for Safari's play bar, and the least a menu gets.
const MENU_BOTTOM_MARGIN_PX = 52;
const MENU_MIN_HEIGHT_PX = 120;
export function closeMenu(toolbar) {
  const menu = toolbar.querySelector(".picker");
  if (!menu) return;
  menu.dismiss.abort();
  menu.anchor.setAttribute("aria-expanded", "false");
  menu.remove();
  toolbar.updateVisibility?.();
}
// Opens `anchor`'s menu, or closes it if it's the one open.
export function toggleMenu(toolbar, anchor, open) {
  if (toolbar.querySelector(".picker")?.anchor === anchor) closeMenu(toolbar);
  else open();
}
// The Settings menu: Quality, then Audio for videos with dubs. Ids are
// "quality:<id>" and "audio:<language>" ("audio:" for the original).
export function settingsMenuItems(streams, currentQuality, tracks, language) {
  const items = [{ heading: "Quality" }];
  for (const quality of MENU_QUALITIES)
    if (streams[quality])
      items.push({
        id: `quality:${quality}`,
        label: qualityLabel(quality),
        active: quality === currentQuality,
        separatorBefore: quality === "audio",
      });
  if (tracks.dubs.length > 0) {
    items.push({ heading: "Audio", separatorBefore: true });
    for (const item of audioMenuItems(tracks, language))
      items.push({ ...item, id: `audio:${item.id ?? ""}` });
  }
  return items;
}
export function showSettingsMenu(video, toolbar, anchor) {
  const items = settingsMenuItems(
    videoState.streams,
    videoState.activeQuality || settings.quality,
    availableAudioTracks(),
    videoState.audioLanguage,
  );
  openMenu(toolbar, anchor, "Settings", items, (id) => {
    const [kind, value] = [
      id.slice(0, id.indexOf(":")),
      id.slice(id.indexOf(":") + 1),
    ];
    if (kind === "quality") setQuality(video, value, { save: true });
    else setAudioLanguage(video, value || null);
  });
}
// The Audio button's label: "Original", or the dub's language.
export function audioLanguageLabel(language) {
  return language === null ? "Original" : languageLabel(language);
}
function languageLabel(code) {
  const name = languageName(code);
  return name === "System" ? code : name;
}
// The Audio menu: the original (with its language when known), then each
// dub, by name.
export function audioMenuItems({ original, dubs }, current) {
  return [
    {
      id: null,
      label: original ? `Original (${languageLabel(original)})` : "Original",
      active: current === null,
      separatorBefore: false,
    },
    ...dubs
      .map((language) => ({
        id: language,
        label: languageLabel(language),
        active: current === language,
        separatorBefore: false,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ].map((item, index) => ({ ...item, separatorBefore: index === 1 }));
}
// Plays the video with `language`'s dub (null: the original audio), keeping
// the quality (or the closest the dub has) and the position.
export function setAudioLanguage(video, language) {
  if (language === videoState.audioLanguage) return;
  log("setAudioLanguage:", language ?? "original");
  videoState.audioLanguage = language;
  buildStreams();
  const quality =
    videoState.activeQuality === "audio" && videoState.streams.audio
      ? "audio"
      : playableQuality(videoState.activeQuality ?? "auto");
  if (!quality) return;
  videoState.activeQuality = quality;
  switchVideoSource(video, videoState.streams[quality]);
  reportPlayerState("spelare");
}
// The quality this video can play for `wanted`: that one, else the best one
// below it, else Auto. Null when Spelare isn't playing it (fallback).
export function playableQuality(wanted) {
  if (videoState.streams[wanted]) return wanted;
  const videoQuality = pickVideoQuality(
    wanted,
    Object.keys(videoState.streams),
  );
  if (videoQuality) return videoQuality;
  return videoState.streams.auto ? "auto" : null;
}
// The quality `q` (step 1) or Shift-Q (step -1) moves to from `current`:
// through Auto and the video qualities the video has, lowest first, wrapping
// around. Sound only is left out, so cycling never loses the picture.
export function nextQuality(current, available, step) {
  const order = PICKER_QUALITIES.filter(
    (quality) => quality !== "audio" && available.includes(quality),
  );
  if (order.length === 0) return null;
  const index = order.indexOf(current);
  if (index < 0) return step > 0 ? order[0] : order[order.length - 1];
  return order[(index + step + order.length) % order.length];
}
// Moves `video` one quality up or down for this video only (the default
// quality stays as it is).
export function cycleQuality(video, step) {
  if (video.hasAttribute("data-spelare-fallback")) return;
  const quality = nextQuality(
    videoState.activeQuality ?? "auto",
    Object.keys(videoState.streams),
    step,
  );
  if (quality) setQuality(video, quality);
}
// Switches `video` to `quality` (one it has a stream for) and shows it in the
// toolbar. `save` also makes it the default quality.
export function setQuality(video, quality, { save = false } = {}) {
  const streamURL = videoState.streams[quality];
  if (!streamURL) return false;
  log("setQuality:", quality);
  if (save) {
    settings.quality = quality;
    browser.storage.sync.set({ quality });
  }
  if (videoState.activeQuality !== quality) {
    videoState.activeQuality = quality;
    switchVideoSource(video, streamURL);
  }
  reportPlayerState("spelare");
  return true;
}
// Whether YouTube's watch page is in theater mode.
function isTheaterMode() {
  return (
    document.querySelector("ytd-watch-flexy")?.hasAttribute("theater") ?? false
  );
}
// Keeps the Theater button's state in step with the page, however theater
// mode was changed (button, `t`, YouTube's own controls).
function trackTheaterMode(button) {
  const update = () => {
    const theater = isTheaterMode();
    button.classList.toggle("active", theater);
    button.setAttribute("aria-pressed", String(theater));
  };
  update();
  const watchPage = document.querySelector("ytd-watch-flexy");
  if (watchPage)
    new MutationObserver(update).observe(watchPage, {
      attributes: true,
      attributeFilter: ["theater"],
    });
}
// How long the controls stay after the pointer stops moving over the video.
const HIDE_DELAY_MS = 3000;
// Shows the controls over the video the way Safari shows its own: while the
// pointer moves over the video or rests on the controls, while the video is
// paused, and while the picker is open (mac.css also shows them while a
// button has keyboard focus). Returns the function that re-checks.
function autoHide(toolbar, video) {
  let pointerActive = false;
  let overControls = false;
  let idleTimer;
  const update = () => {
    const show =
      pointerActive ||
      overControls ||
      video.paused ||
      toolbar.querySelector(".picker") !== null;
    toolbar.classList.toggle("visible", show);
  };
  const settleAfter = (delay) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      pointerActive = false;
      update();
    }, delay);
  };
  video.addEventListener("mousemove", () => {
    pointerActive = true;
    update();
    settleAfter(HIDE_DELAY_MS);
  });
  // A short grace period, so moving onto the controls doesn't flicker them.
  video.addEventListener("mouseleave", () => settleAfter(150));
  toolbar.addEventListener("mouseenter", () => {
    overControls = true;
    update();
  });
  toolbar.addEventListener("mouseleave", () => {
    overControls = false;
    update();
  });
  video.addEventListener("play", update);
  video.addEventListener("pause", update);
  update();
  return update;
}
// Spelare's controls, one capsule like Safari's own: [Chapters] [Settings]
// [Theater]. The chapter (added once known, chapters.js) is the only text;
// Settings holds Quality and Audio; Theater is an icon that fills in while
// theater mode is on.
export function createToolbar(video) {
  log("createToolbar");
  const toolbar = document.createElement("div");
  toolbar.id = "spelare-toolbar";
  const controls = document.createElement("div");
  controls.classList.add("controls");
  toolbar.appendChild(controls);
  const settingsButton = makeToolbarButton(
    "",
    () =>
      toggleMenu(toolbar, settingsButton, () =>
        showSettingsMenu(video, toolbar, settingsButton),
      ),
    "settings",
  );
  settingsButton.classList.add("icon-only");
  settingsButton.title = "Quality and audio (Q / Shift-Q change quality)";
  settingsButton.setAttribute("aria-label", "Settings");
  settingsButton.setAttribute("aria-haspopup", "menu");
  settingsButton.setAttribute("aria-expanded", "false");
  controls.appendChild(settingsButton);
  const theaterButton = makeToolbarButton(
    "",
    () => toggleTheaterMode(),
    "theater",
  );
  theaterButton.classList.add("icon-only");
  theaterButton.title = "Theater mode (T)";
  theaterButton.setAttribute("aria-label", "Theater mode");
  controls.appendChild(theaterButton);
  trackTheaterMode(theaterButton);
  toolbar.updateVisibility = autoHide(toolbar, video);
  video.closest("div").insertBefore(toolbar, video);
}
// "Show quality buttons" off hides the controls in every layout.
export function applyToolbarVisibility() {
  log("showHideToolbar");
  document.documentElement.toggleAttribute(
    "data-spelare-no-toolbar",
    !settings.showToolbar,
  );
}
