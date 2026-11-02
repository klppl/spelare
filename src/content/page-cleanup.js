// Parts of YouTube the popup can hide. Each setting sets an attribute on
// <html>, and mac.css hides the matching elements while it's there, so a
// change applies at once and YouTube's page code is left alone. hide-guard.js
// backs those rules up when YouTube renames its elements.
import { scheduleHideGuard } from "./hide-guard.js";
import { settings } from "./state.js";

// Setting name → attribute. Spelled out (not built from the names) so the
// naming test can match them against mac.css.
export const HIDE_ATTRIBUTES = {
  hideShorts: "data-spelare-hide-shorts",
  hideEndScreens: "data-spelare-hide-end-screens",
  hideComments: "data-spelare-hide-comments",
  hideRecommendations: "data-spelare-hide-recommendations",
};

export function applyHideSettings(root = document.documentElement) {
  for (const [name, attribute] of Object.entries(HIDE_ATTRIBUTES))
    root.toggleAttribute(attribute, settings[name] === true);
  scheduleHideGuard();
}
