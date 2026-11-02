// Dislike counts next to YouTube's dislike button, from Return YouTube
// Dislike (returnyoutubedislike.com), which estimates them since YouTube
// stopped showing them. Off unless "Show dislike counts" is on in the popup,
// since it sends each watched video's id to that service.
import { setBounded } from "./bounded-map.js";
import { log } from "./log.js";
import { settings } from "./state.js";
import { currentVideoId } from "./url.js";

const API = "https://returnyoutubedislikeapi.com/votes?videoId=";
// YouTube's dislike button, newest markup first. The page also has hidden
// copies (in the player's quick actions, in a second menu), so the visible
// one is used.
const DISLIKE_BUTTON = [
  "segmented-like-dislike-button-view-model dislike-button-view-model button",
  "dislike-button-view-model button",
  "#segmented-dislike-button button",
  "ytd-toggle-button-renderer#dislike-button button",
].join(", ");
const COUNT_CLASS = "spelare-dislikes";
// Marks a dislike button Spelare turned into an icon-and-text button.
const CHANGED_BUTTON = "data-spelare-dislikes-button";
// YouTube's classes for an icon-only button and an icon-and-text one (like
// the like button), current and older spellings.
const BUTTON_CLASSES = [
  ["ytSpecButtonShapeNextIconButton", "ytSpecButtonShapeNextIconLeading"],
  [
    "yt-spec-button-shape-next--icon-button",
    "yt-spec-button-shape-next--icon-leading",
  ],
];
const TEXT_CLASSES = [
  "ytSpecButtonShapeNextButtonTextContent",
  "yt-spec-button-shape-next__button-text-content",
];
// The watch page re-renders its buttons, so the count is checked this often.
const CHECK_EVERY_MS = 1500;

// videoId → dislikes (or null while fetching or when unavailable).
const counts = new Map();
let missingButtonLogged = null;

// "1.2K" (or "1,2 tn" in Swedish): the way YouTube shows like counts, in
// the page's language.
export function formatCount(count, locale = pageLocale()) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}
function pageLocale() {
  try {
    return Intl.getCanonicalLocales(document.documentElement.lang || "en")[0];
  } catch {
    return "en";
  }
}

// The dislike count in an API response, or null.
export function dislikesFrom(data) {
  const dislikes = data?.dislikes;
  return Number.isSafeInteger(dislikes) && dislikes >= 0 ? dislikes : null;
}

async function fetchDislikes(videoId) {
  setBounded(counts, videoId, null, 20);
  try {
    const response = await fetch(API + encodeURIComponent(videoId), {
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dislikes = dislikesFrom(await response.json());
    setBounded(counts, videoId, dislikes, 20);
    log("dislikes:", videoId, dislikes ?? "none in the response");
  } catch (error) {
    log("dislikes: request failed:", error?.message || String(error));
  }
}

function visibleDislikeButton() {
  for (const button of document.querySelectorAll(DISLIKE_BUTTON)) {
    const { width, height } = button.getBoundingClientRect();
    if (width > 0 && height > 0) return button;
  }
  return null;
}

function setTextLayout(button, withText) {
  for (const [iconOnly, iconAndText] of BUTTON_CLASSES)
    if (button.classList.contains(withText ? iconOnly : iconAndText))
      button.classList.replace(
        withText ? iconOnly : iconAndText,
        withText ? iconAndText : iconOnly,
      );
  button.toggleAttribute(CHANGED_BUTTON, withText);
}

function removeCounts() {
  document
    .querySelectorAll(`.${COUNT_CLASS}`)
    .forEach((element) => element.remove());
  document
    .querySelectorAll(`[${CHANGED_BUTTON}]`)
    .forEach((button) => setTextLayout(button, false));
}

// Puts the current video's count in YouTube's dislike button, fetching it
// first if needed; removes counts when the setting is off or there's none.
function update() {
  const videoId = location.pathname === "/watch" ? currentVideoId() : null;
  if (!settings.showDislikes || !videoId) {
    removeCounts();
    return;
  }
  if (!counts.has(videoId)) fetchDislikes(videoId);
  const dislikes = counts.get(videoId);
  if (dislikes == null) return;
  const button = visibleDislikeButton();
  if (!button) {
    // Logged once per video, once the like button is there: YouTube may
    // have renamed its dislike button.
    if (
      missingButtonLogged !== videoId &&
      document.querySelector("like-button-view-model, #segmented-like-button")
    ) {
      missingButtonLogged = videoId;
      log("dislikes: YouTube's dislike button wasn't found");
    }
    return;
  }
  // Laid out like the like button's number: YouTube's text element after
  // the icon, in an icon-and-text button.
  let count = button.querySelector(`.${COUNT_CLASS}`);
  if (!count) {
    removeCounts();
    count = document.createElement("div");
    count.classList.add(COUNT_CLASS, ...TEXT_CLASSES);
    const icon = button.querySelector(
      '[class*="ShapeNextIcon"], [class*="shape-next__icon"]',
    );
    if (icon) icon.after(count);
    else button.appendChild(count);
  }
  setTextLayout(button, true);
  const text = formatCount(dislikes);
  if (count.textContent !== text) count.textContent = text;
  count.title = `${new Intl.NumberFormat(pageLocale()).format(dislikes)} dislikes, estimated by Return YouTube Dislike`;
}

export function refreshDislikes() {
  update();
}

// The top www.youtube.com frame only.
export function setupDislikes() {
  if (window.top !== window || location.hostname !== "www.youtube.com") return;
  setInterval(update, CHECK_EVERY_MS);
  document.addEventListener("yt-navigate-finish", update);
  update();
}
