import { log } from "./log.js";
import { toggleTheaterMode } from "./playback.js";
import {
  PICKER_QUALITIES,
  pickVideoQuality,
  qualityLabel,
} from "./qualities.js";
import { switchVideoSource } from "./source.js";
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
// Opens the quality menu below the Quality button. Escape, a click anywhere
// else or the Quality button again closes it without changing anything.
export function showQualityPicker(video, toolbar) {
  const picker = document.createElement("div");
  picker.classList.add("picker");
  picker.setAttribute("role", "menu");
  picker.setAttribute("aria-label", "Quality");
  for (const quality of MENU_QUALITIES) {
    if (!videoState.streams[quality]) continue;
    if (quality === "audio" && picker.childElementCount > 0) {
      const separator = document.createElement("div");
      separator.classList.add("separator");
      separator.setAttribute("role", "separator");
      picker.appendChild(separator);
    }
    picker.appendChild(qualityOption(video, toolbar, quality));
  }
  const dismiss = new AbortController();
  picker.dismiss = dismiss;
  const cancel = () =>
    closeQualityPicker(
      toolbar,
      qualityLabel(videoState.activeQuality || settings.quality),
    );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!toolbar.contains(event.target)) cancel();
    },
    { capture: true, signal: dismiss.signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      event.preventDefault();
      cancel();
    },
    { capture: true, signal: dismiss.signal },
  );
  toolbar.appendChild(picker);
  toolbar.querySelector(".quality")?.setAttribute("aria-expanded", "true");
  toolbar.updateVisibility?.();
}
function qualityOption(video, toolbar, quality) {
  const label = qualityLabel(quality);
  const button = makeToolbarButton(label, () => {
    setQuality(video, quality, { save: true });
    closeQualityPicker(toolbar, label);
  });
  button.setAttribute("data-spelare-quality", quality);
  button.setAttribute("role", "menuitemradio");
  const active = (videoState.activeQuality || settings.quality) === quality;
  button.classList.toggle("active", active);
  button.setAttribute("aria-checked", String(active));
  return button;
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
  const button = document.querySelector("#spelare-toolbar .controls .quality");
  if (button) button.textContent = qualityLabel(quality);
  return true;
}
export function closeQualityPicker(toolbar, label) {
  const picker = toolbar.querySelector(".picker");
  picker?.dismiss?.abort();
  picker?.remove();
  const qualityButton = toolbar.querySelector(".quality");
  qualityButton.textContent = label;
  qualityButton.setAttribute("aria-expanded", "false");
  toolbar.updateVisibility?.();
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
export function createToolbar(video) {
  log("createToolbar");
  const toolbar = document.createElement("div");
  toolbar.id = "spelare-toolbar";
  const controls = document.createElement("div");
  controls.classList.add("controls");
  toolbar.appendChild(controls);
  const qualityButton = makeToolbarButton(
    qualityLabel(videoState.activeQuality || settings.quality),
    () => {
      if (toolbar.querySelector(".picker"))
        closeQualityPicker(toolbar, qualityButton.textContent);
      else showQualityPicker(video, toolbar);
    },
    "quality",
  );
  qualityButton.title = "Quality (Q / Shift-Q)";
  qualityButton.setAttribute("aria-haspopup", "menu");
  qualityButton.setAttribute("aria-expanded", "false");
  controls.appendChild(qualityButton);
  const theaterButton = makeToolbarButton(
    "Theater",
    () => toggleTheaterMode(),
    "theater",
  );
  theaterButton.title = "Theater mode (T)";
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
