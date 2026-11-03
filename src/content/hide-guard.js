// Backs up mac.css's hide rules, which name YouTube's page elements and stop
// matching when YouTube renames them:
//
// - Shorts are also found by what YouTube renames least, their /shorts/ links,
//   and the item or shelf around each one is marked data-spelare-hidden-shorts
//   (hidden by mac.css while "Hide Shorts" is on).
// - Anything a hide setting should have hidden but that's still visible is
//   written to the diagnostic log once per page, with the element names
//   around it, which is what a selector in mac.css needs.
//
// Runs in the top www.youtube.com frame only, a short while after the page
// changes, and only while a hide setting is on.
import { log } from "./log.js";
import { markPage } from "./page-cleanup.js";
import { settings } from "./state.js";
import { isYouTubeSiteHost } from "../shared/hosts.js";

export const SHORTS_MARK = "data-spelare-hidden-shorts";
const MARK_DELAY_MS = 250;
const DETECT_DELAY_MS = 3000;
// Offenders checked per setting and pass; enough to notice a missed rule.
const MAX_CHECKED = 50;

const SHORTS_LINK = 'a[href^="/shorts/"]';
// Links to ordinary content: a Shorts mark never covers one of these.
const REGULAR_LINK = 'a[href^="/watch"], a[href^="/playlist"]';
// Video tiles have a thumbnail; links in descriptions and comments don't.
const THUMBNAIL = "img, yt-image, yt-thumbnail-view-model";
// Page structure a mark never covers: columns, the sidebar parts that stay,
// and the player. (Not "content"/"contents"/"items": YouTube reuses those ids
// inside tiles and shelves too.)
const LANDMARK_IDS = new Set([
  "page-manager",
  "columns",
  "primary",
  "secondary",
  "below",
  "related",
  "playlist",
  "chat",
  "guide",
  "movie_player",
  "player-container-id",
]);
const LANDMARK_TAGS = new Set([
  "HTML",
  "BODY",
  "YTD-APP",
  "YTD-PAGE-MANAGER",
  "YTM-APP",
]);

export function isLandmark(node) {
  return LANDMARK_TAGS.has(node.tagName) || LANDMARK_IDS.has(node.id);
}

// The element to hide for a Shorts link: its largest ancestor that holds no
// ordinary video or playlist link and is below the page's lists and columns.
// So a lone Short in a feed hides its tile, and a shelf of them hides the
// shelf. Null when the link sits directly in a landmark.
export function shortsHideTarget(
  link,
  containsRegularLink,
  landmark = isLandmark,
) {
  let target = null;
  for (
    let node = link.parentElement;
    node && !landmark(node) && !containsRegularLink(node);
    node = node.parentElement
  )
    target = node;
  return target;
}

// "ytd-foo#bar < ytd-baz": the element and its ancestors, as a selector
// in mac.css would name them.
export function describeElement(element, depth = 4) {
  const parts = [];
  for (
    let node = element;
    node && parts.length < depth;
    node = node.parentElement
  ) {
    if (isLandmark(node) && parts.length > 0) break;
    const tag = node.tagName.toLowerCase();
    parts.push(node.id ? `${tag}#${node.id}` : tag);
  }
  return parts.join(" < ");
}

const isVisible = (element) => element.getClientRects().length > 0;

const reported = new Set();
// Logs, once per page, that `kind` showed something it should have hidden.
function reportMiss(kind, element, how) {
  const description = describeElement(element);
  const key = `${kind}:${description}`;
  if (reported.has(key)) return;
  reported.add(key);
  log(`hideRules: ${kind} ${how}:`, description);
}

function markShorts() {
  const containsRegular = new Map();
  const containsRegularLink = (node) => {
    if (!containsRegular.has(node))
      containsRegular.set(node, node.querySelector(REGULAR_LINK) !== null);
    return containsRegular.get(node);
  };
  const targets = new Set();
  for (const link of document.querySelectorAll(SHORTS_LINK)) {
    if (!link.querySelector(THUMBNAIL)) continue;
    const target = shortsHideTarget(link, containsRegularLink);
    if (target) targets.add(target);
  }
  // YouTube reuses elements for other videos, so marks are recomputed.
  for (const marked of document.querySelectorAll(`[${SHORTS_MARK}]`))
    if (!targets.has(marked)) marked.removeAttribute(SHORTS_MARK);
  for (const target of targets) {
    if (target.hasAttribute(SHORTS_MARK)) continue;
    // Visible before being marked: mac.css's selectors missed it.
    if (isVisible(target))
      reportMiss("shorts", target, "hidden by link instead");
    target.setAttribute(SHORTS_MARK, "");
  }
}

function currentVideoId() {
  return new URLSearchParams(location.search).get("v");
}

// Thumbnail links to other videos outside what's kept (player, playlist,
// chat, description, comments): recommendations.
function isRecommendationLink(link) {
  return (
    link.querySelector(THUMBNAIL) !== null &&
    new URL(link.href).searchParams.get("v") !== currentVideoId() &&
    !link.closest(
      "#movie_player, #playlist, #chat, #description, #comments, #guide, ytd-playlist-panel-renderer",
    )
  );
}

// What each hide setting leaves visible when its rules have stopped working,
// found by links and ids rather than YouTube's element names where possible.
const DETECTORS = {
  // Comment timestamps link to the comment with &lc=.
  hideComments: () =>
    location.pathname === "/watch"
      ? document.querySelectorAll('#comments, a[href*="&lc="]')
      : [],
  hideRecommendations: () =>
    location.pathname === "/watch" || location.pathname === "/"
      ? Array.from(document.querySelectorAll('a[href^="/watch"]')).filter(
          isRecommendationLink,
        )
      : [],
  // End-screen tiles in the player that link to another video (not the
  // autoplay countdown, which the setting leaves alone).
  hideEndScreens: () =>
    Array.from(
      document.querySelectorAll('#movie_player a[href*="watch?v="]'),
    ).filter(
      (link) =>
        new URL(link.href).searchParams.get("v") !== currentVideoId() &&
        !link.closest(".ytp-autonav-endscreen"),
    ),
};

function detectMisses() {
  for (const [name, find] of Object.entries(DETECTORS)) {
    if (!settings[name]) continue;
    let checked = 0;
    for (const element of find()) {
      if (checked++ >= MAX_CHECKED) break;
      if (isVisible(element)) reportMiss(name, element, "rule missed");
    }
  }
}

let markTimer = null;
let detectTimer = null;
function anyHideSetting() {
  return (
    settings.hideShorts ||
    settings.hideComments ||
    settings.hideRecommendations ||
    settings.hideEndScreens
  );
}

// Runs the passes soon (marking quickly, detection less often).
export function scheduleHideGuard() {
  if (!started || !anyHideSetting()) return;
  markTimer ??= setTimeout(() => {
    markTimer = null;
    markPage();
    if (settings.hideShorts) markShorts();
  }, MARK_DELAY_MS);
  detectTimer ??= setTimeout(() => {
    detectTimer = null;
    detectMisses();
  }, DETECT_DELAY_MS);
}

let started = false;
export function setupHideGuard() {
  if (started || window.top !== window || !isYouTubeSiteHost(location.hostname))
    return;
  started = true;
  new MutationObserver(scheduleHideGuard).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"],
  });
  // Each page (a navigation without reload too) reports its misses afresh.
  document.addEventListener("yt-navigate-finish", () => reported.clear());
  scheduleHideGuard();
}
