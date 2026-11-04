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
import { onPlayerStateChange, reportPlayerState } from "./player-state.js";
import { settings, videoState } from "./state.js";

// A toolbar button. Mouse clicks don't focus it, so Space and the other
// hotkeys keep going to the video afterwards. On touch screens it acts when
// the finger lifts: iOS may otherwise treat a first tap as a hover only.
export function makeToolbarButton(label, onClick, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("button");
  if (className) button.classList.add(className);
  button.textContent = label;
  let touched = false;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    touched = true;
    event.preventDefault();
    onClick(event);
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    // The click that follows a handled touch.
    if (touched) {
      touched = false;
      return;
    }
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
      if (!toolbar.contains(event.target) && !menu.contains(event.target))
        closeMenu(toolbar);
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
  if (matchMedia("(hover: none)").matches) {
    menuLayer ??= document.createElement("div");
    menuLayer.id = "spelare-menu-layer";
    if (!menuLayer.isConnected) document.documentElement.appendChild(menuLayer);
    menuLayer.appendChild(menu);
    toolbar.floatingMenu = menu;
  } else toolbar.appendChild(menu);
  fitMenu(toolbar, menu);
  anchor.setAttribute("aria-expanded", "true");
  toolbar.updateVisibility?.();
}
// Lets a long menu (a video with twenty dubs) use the video's height down to
// Safari's play bar, keeps it inside the window (on a phone the Settings
// menu would run off the right edge), and opens it with the playing item in
// view. In the touch-screen layer it gets the screen's height instead.
function fitMenu(toolbar, menu) {
  const video = toolbar.parentElement?.querySelector(
    "video[data-spelare-video]",
  );
  if (menu.parentElement === menuLayer) {
    const toolbarBox = toolbar.getBoundingClientRect();
    const top = toolbarBox.bottom + 6;
    menu.style.setProperty("--spelare-menu-top", `${top}px`);
    menu.style.setProperty(
      "--spelare-menu-left",
      `${toolbarBox.left + parseFloat(menuLeft(menu))}px`,
    );
    const viewportHeight = window.visualViewport?.height ?? innerHeight;
    menu.style.setProperty(
      "--spelare-menu-max-height",
      `${Math.max(viewportHeight - top - MENU_EDGE_MARGIN_PX, MENU_MIN_HEIGHT_PX)}px`,
    );
  } else if (video) {
    const top = toolbar.offsetTop + toolbar.offsetHeight + 6;
    const room = video.clientHeight - top - MENU_BOTTOM_MARGIN_PX;
    menu.style.setProperty(
      "--spelare-menu-max-height",
      `${Math.max(room, MENU_MIN_HEIGHT_PX)}px`,
    );
  }
  const overflow =
    menu.getBoundingClientRect().right -
    (document.documentElement.clientWidth - MENU_EDGE_MARGIN_PX);
  if (overflow > 0)
    menu.style.setProperty(
      "--spelare-menu-left",
      `${parseFloat(menuLeft(menu)) - overflow}px`,
    );
  // Scrolls the menu only: scrollIntoView would scroll YouTube's player too.
  const active = menu.querySelector(".active");
  if (active && active.offsetTop + active.offsetHeight > menu.clientHeight)
    menu.scrollTop =
      active.offsetTop - (menu.clientHeight - active.offsetHeight) / 2;
}
const menuLeft = (menu) => menu.style.getPropertyValue("--spelare-menu-left");
const MENU_EDGE_MARGIN_PX = 8;
// Room left below a menu for Safari's play bar, and the least a menu gets.
const MENU_BOTTOM_MARGIN_PX = 52;
const MENU_MIN_HEIGHT_PX = 120;
// On touch screens a menu opens outside the player, which cuts off anything
// below a short video (a phone held upright): in a layer over the page.
let menuLayer = null;
// The toolbar's open menu, in the toolbar or in the touch-screen layer.
function openMenuOf(toolbar) {
  return toolbar.querySelector(".picker") ?? toolbar.floatingMenu ?? null;
}
export function closeMenu(toolbar) {
  const menu = openMenuOf(toolbar);
  if (!menu) return;
  toolbar.floatingMenu = null;
  menu.dismiss.abort();
  menu.anchor.setAttribute("aria-expanded", "false");
  menu.remove();
  toolbar.updateVisibility?.();
}
// Opens `anchor`'s menu, or closes it if it's the one open.
export function toggleMenu(toolbar, anchor, open) {
  if (openMenuOf(toolbar)?.anchor === anchor) closeMenu(toolbar);
  else open();
}
// The Quality menu: Auto, best to worst, then Sound only set apart. Ids are
// quality ids.
export function qualityMenuItems(streams, currentQuality) {
  return MENU_QUALITIES.filter((quality) => streams[quality]).map(
    (quality) => ({
      id: quality,
      label: qualityLabel(quality),
      active: quality === currentQuality,
      separatorBefore: quality === "audio",
    }),
  );
}
export function showQualityMenu(video, toolbar, anchor) {
  const items = qualityMenuItems(
    videoState.streams,
    videoState.activeQuality || settings.quality,
  );
  openMenu(toolbar, anchor, "Quality", items, (id) =>
    setQuality(video, id, { save: true }),
  );
}
export function showAudioMenu(video, toolbar, anchor) {
  const items = audioMenuItems(
    availableAudioTracks(),
    videoState.audioLanguage,
  );
  openMenu(toolbar, anchor, "Audio", items, (id) =>
    setAudioLanguage(video, id),
  );
}
// The Quality button's label: what's playing ("1080p", "Auto", "Sound only").
export function qualityButtonLabel(quality) {
  return qualityLabel(quality || "auto");
}
// The video's subtitle tracks (Spelare's, from YouTube's caption list).
function subtitleTracks(video) {
  return Array.from(video.textTracks).filter(
    (track) => track.kind === "subtitles",
  );
}
// The Subtitles menu: Off, then each track as YouTube names it. Ids are
// track labels ("" for off).
export function subtitleMenuItems(labels, showing) {
  return [
    { id: "", label: "Off", active: showing === null, separatorBefore: false },
    ...labels.map((label, index) => ({
      id: label,
      label,
      active: label === showing,
      separatorBefore: index === 0,
    })),
  ];
}
// The Subtitles button's label: "Off", or the showing track's language
// ("English"; YouTube's full name, such as "English (auto-generated)", is
// in the menu).
export function subtitleButtonLabel(track) {
  if (!track) return "Off";
  const name = languageName(track.language);
  if (name !== "System") return name;
  return track.label.length > 20 ? `${track.label.slice(0, 19)}…` : track.label;
}
function showingSubtitleTrack(video) {
  return subtitleTracks(video).find((track) => track.mode === "showing");
}
export function showSubtitleMenu(video, toolbar, anchor) {
  const tracks = subtitleTracks(video);
  const items = subtitleMenuItems(
    tracks.map((track) => track.label),
    showingSubtitleTrack(video)?.label ?? null,
  );
  openMenu(toolbar, anchor, "Subtitles", items, (label) => {
    log("setSubtitles:", label || "off");
    for (const track of tracks)
      track.mode = label && track.label === label ? "showing" : "disabled";
    videoState.captionChoice = label || null;
  });
}
// The Speed menu's choices, the same range the < and > hotkeys step through.
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export function speedLabel(rate) {
  return `${Math.round(rate * 100) / 100}×`;
}
export function speedMenuItems(current) {
  return SPEEDS.map((rate) => ({
    id: String(rate),
    label: rate === 1 ? "Normal" : speedLabel(rate),
    active: Math.abs(rate - current) < 0.001,
    separatorBefore: false,
  }));
}
// Picking a speed sets the video's rate; playback-prefs.js remembers it for
// the channel, as it does for Safari's own speed menu.
export function showSpeedMenu(video, toolbar, anchor) {
  openMenu(
    toolbar,
    anchor,
    "Speed",
    speedMenuItems(video.playbackRate),
    (rate) => {
      log("setSpeed:", rate);
      video.playbackRate = Number(rate);
    },
  );
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
// mode was changed (button, `t`, YouTube's own controls). The watch page's
// element may not exist yet when the toolbar is made, so this watches the
// whole document for its theater attribute (the filter keeps that cheap),
// until the button is gone.
function trackTheaterMode(button) {
  const update = () => {
    if (!button.isConnected && observer) {
      observer.disconnect();
      return;
    }
    const theater = isTheaterMode();
    button.classList.toggle("active", theater);
    button.setAttribute("aria-pressed", String(theater));
    button.title = theater ? "Default view (T)" : "Theater mode (T)";
  };
  const observer = new MutationObserver(update);
  update();
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["theater"],
    subtree: true,
  });
}
// Theater is on YouTube's desktop site only: the mobile site, embeds and
// YouTube Music have none. (Not "is the watch page there yet": it may not
// be when the toolbar is made, and then the button never showed.)
export function hasTheaterMode(where = location) {
  return (
    where.hostname === "www.youtube.com" && !where.pathname.startsWith("/embed")
  );
}
// When the capsule's labels don't fit between Safari's corner controls (a
// small player, or every button showing), Audio, Subtitles and Speed show
// their icons only (mac.css), and their values stay in the tooltip and menu.
// Measured with the chapter at its usual width, so it isn't squeezed to
// "…" first.
function fitControls(toolbar) {
  const controls = toolbar.querySelector(".controls");
  if (!controls || !toolbar.isConnected) return;
  toolbar.classList.remove("compact");
  toolbar.classList.add("measuring");
  const overflows = controls.scrollWidth > controls.clientWidth + 1;
  toolbar.classList.remove("measuring");
  toolbar.classList.toggle("compact", overflows);
}
// How long the controls stay after the pointer stops moving over the video.
const HIDE_DELAY_MS = 3000;
// Shows the controls over the video the way Safari shows its own: while the
// pointer moves over the video or rests on the controls, while the video is
// paused, and while the picker is open (mac.css also shows them while a
// button has keyboard focus). Returns the function that re-checks.
function autoHide(toolbar, video) {
  let pointerActive = false;
  let shown = false;
  let overControls = false;
  let idleTimer;
  const update = () => {
    const show =
      pointerActive ||
      overControls ||
      video.paused ||
      openMenuOf(toolbar) !== null;
    // Dubs can turn up after the toolbar is made: check as it appears.
    if (show && !shown) toolbar.refresh?.();
    shown = show;
    toolbar.classList.toggle("visible", show);
  };
  const settleAfter = (delay) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      pointerActive = false;
      update();
    }, delay);
  };
  const showForAWhile = () => {
    pointerActive = true;
    update();
    settleAfter(HIDE_DELAY_MS);
  };
  video.addEventListener("mousemove", showForAWhile);
  // On touch screens a tap shows them, as it shows Safari's own controls.
  video.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") showForAWhile();
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
// Spelare's controls, one capsule like Safari's own:
// [Chapters] [Quality] [Audio] [Subtitles] [Speed] [Theater]. Each shows
// its current value ("1080p", "English", "1.5×"), so all are a click away;
// Audio is only there for videos with dubs, Subtitles for videos with
// captions. Theater is an icon that swaps between "make
// it wider" and "make it smaller".
export function createToolbar(video) {
  log("createToolbar");
  const toolbar = document.createElement("div");
  toolbar.id = "spelare-toolbar";
  const controls = document.createElement("div");
  controls.classList.add("controls");
  toolbar.appendChild(controls);
  const menuButton = (className, name, title, open) => {
    const button = makeToolbarButton(
      "",
      () => toggleMenu(toolbar, button, () => open(video, toolbar, button)),
      className,
    );
    button.title = title;
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.dataset.name = name;
    return button;
  };
  // The "settings" class is kept: fallback.js replaces this button.
  const qualityButton = menuButton(
    "settings",
    "Quality",
    "Quality (Q / Shift-Q change it)",
    showQualityMenu,
  );
  const audioButton = menuButton(
    "audio",
    "Audio",
    "Audio language",
    showAudioMenu,
  );
  const subtitlesButton = menuButton(
    "subtitles",
    "Subtitles",
    "Subtitles (C turns them on and off)",
    showSubtitleMenu,
  );
  const speedButton = menuButton(
    "speed",
    "Speed",
    "Playback speed (< and > change it)",
    showSpeedMenu,
  );
  controls.append(qualityButton, audioButton, subtitlesButton, speedButton);
  toolbar.refresh = () => {
    const quality = qualityButtonLabel(videoState.activeQuality);
    qualityButton.textContent = quality;
    qualityButton.setAttribute("aria-label", `Quality: ${quality}`);
    const hasDubs = availableAudioTracks().dubs.length > 0;
    audioButton.hidden = !hasDubs;
    if (hasDubs) {
      const language = audioLanguageLabel(videoState.audioLanguage);
      audioButton.textContent = language;
      audioButton.setAttribute("aria-label", `Audio: ${language}`);
    }
    const hasSubtitles = subtitleTracks(video).length > 0;
    subtitlesButton.hidden = !hasSubtitles;
    if (hasSubtitles) {
      const subtitles = subtitleButtonLabel(showingSubtitleTrack(video));
      subtitlesButton.textContent = subtitles;
      subtitlesButton.setAttribute("aria-label", `Subtitles: ${subtitles}`);
    }
    const speed = speedLabel(video.playbackRate);
    speedButton.textContent = speed;
    speedButton.setAttribute("aria-label", `Speed: ${speed}`);
    for (const button of [audioButton, subtitlesButton, speedButton])
      button.title = `${button.dataset.name}: ${button.textContent}`;
    fitControls(toolbar);
  };
  toolbar.refresh();
  new ResizeObserver(() => fitControls(toolbar)).observe(video);
  // Speed and subtitles also change from hotkeys, Safari's own menus and
  // Now Playing; caption tracks arrive a moment after the video starts.
  video.addEventListener("ratechange", toolbar.refresh);
  for (const type of ["change", "addtrack", "removetrack"])
    video.textTracks.addEventListener(type, toolbar.refresh);
  onPlayerStateChange(() => {
    if (toolbar.isConnected) toolbar.refresh();
  });
  if (hasTheaterMode()) {
    const theaterButton = makeToolbarButton(
      "",
      () => toggleTheaterMode(),
      "theater",
    );
    theaterButton.classList.add("icon-only");
    theaterButton.setAttribute("aria-label", "Theater mode");
    controls.appendChild(theaterButton);
    trackTheaterMode(theaterButton);
  }
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
