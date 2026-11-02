// Chapters, read the way YouTube reads them: timestamps in the description
// ("0:00 Intro", "12:34 - The end"), starting at 0:00, at least three, in
// order and at least ten seconds apart. A Chapters button on the player shows
// the current one; its menu jumps to any. (Chapters YouTube generates itself
// aren't in the description, so those videos get none.)
import { log } from "./log.js";
import { formatTime } from "./resume.js";
import { videoState } from "./state.js";
import { makeToolbarButton, openMenu, toggleMenu } from "./toolbar.js";

const MIN_CHAPTERS = 3;
const MIN_LENGTH_S = 10;
const MAX_CHAPTERS = 200;
const MAX_TITLE = 100;

const TIMESTAMP = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})`;
// A timestamp first ("0:00 Intro", "[0:00] Intro", "0:00 - Intro") or last
// ("Intro 0:00", "Intro - (0:00)").
const LEADING = new RegExp(
  String.raw`^\s*[\[(]?${TIMESTAMP}[\])]?\s*(?:[-–—:|•·]\s*)?(.*\S)\s*$`,
);
const TRAILING = new RegExp(
  String.raw`^\s*(.*?\S)\s*(?:[-–—:|•·]\s*)?[\[(]?${TIMESTAMP}[\])]?\s*$`,
);

// Seconds for a matched h:mm:ss, or null when a field is out of range.
function seconds(hours, minutes, secs) {
  if (Number(secs) > 59 || (hours !== undefined && Number(minutes) > 59))
    return null;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(secs);
}

// The chapter on one description line, or null.
function chapterOn(line) {
  const leading = line.match(LEADING);
  if (leading) {
    const start = seconds(leading[1], leading[2], leading[3]);
    return start === null ? null : { start, title: leading[4] };
  }
  const trailing = line.match(TRAILING);
  if (trailing) {
    const start = seconds(trailing[2], trailing[3], trailing[4]);
    return start === null ? null : { start, title: trailing[1] };
  }
  return null;
}

// [{ start, title }] from a description, or [] when it has no valid list.
export function parseChapters(description, duration = Infinity) {
  if (typeof description !== "string") return [];
  const chapters = [];
  for (const line of description.split("\n")) {
    const chapter = chapterOn(line);
    if (!chapter) continue;
    chapters.push({ ...chapter, title: chapter.title.slice(0, MAX_TITLE) });
    if (chapters.length > MAX_CHAPTERS) return [];
  }
  const valid =
    chapters.length >= MIN_CHAPTERS &&
    chapters[0].start === 0 &&
    chapters.every(
      (chapter, index) =>
        index === 0 ||
        chapter.start - chapters[index - 1].start >= MIN_LENGTH_S,
    ) &&
    chapters.at(-1).start < duration;
  return valid ? chapters : [];
}

// The index of the chapter playing at `time`.
export function chapterAt(chapters, time) {
  let index = 0;
  while (index + 1 < chapters.length && chapters[index + 1].start <= time)
    index += 1;
  return index;
}

// Adds the Chapters button (first in the capsule) once the video's chapters are
// known; it shows the current chapter and keeps up as the video plays.
export function addChaptersButton() {
  const toolbar = document.querySelector("#spelare-toolbar");
  const video = document.querySelector(
    "video[data-spelare-video]:not([data-spelare-fallback])",
  );
  const chapters = videoState.chapters;
  if (!toolbar || !video || toolbar.querySelector(".chapters")) return;
  if (!chapters || chapters.length === 0) return;
  log("chapters:", chapters.length);
  let shown = -1;
  const button = makeToolbarButton(
    "",
    () =>
      toggleMenu(toolbar, button, () =>
        openMenu(
          toolbar,
          button,
          "Chapters",
          chapters.map((chapter, index) => ({
            id: index,
            prefix: formatTime(chapter.start),
            label: chapter.title,
            active: index === shown,
            separatorBefore: false,
          })),
          (index) => {
            video.currentTime = chapters[index].start;
            update();
          },
        ),
      ),
    "chapters",
  );
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const update = () => {
    const index = chapterAt(chapters, video.currentTime);
    if (index === shown) return;
    shown = index;
    button.textContent = chapters[index].title;
    button.title = `Chapter ${index + 1} of ${chapters.length}: ${chapters[index].title}`;
  };
  update();
  video.addEventListener("timeupdate", update);
  video.addEventListener("seeked", update);
  toolbar.querySelector(".controls").prepend(button);
}
