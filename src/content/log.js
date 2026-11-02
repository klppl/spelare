// Debug log for the popup's "Show debug info", kept by background.js.
// Entries are sent in batches, at most every FLUSH_DELAY_MS and when the page
// goes away, rather than as one runtime message per call.
const FLUSH_DELAY_MS = 250;
let pending = [];
let flushTimer = null;

// Copies args now, so a logged object (e.g. settings) is recorded as it was.
function snapshot(args) {
  try {
    return structuredClone(args);
  } catch {
    return args.map(String);
  }
}

export function log(...args) {
  pending.push(snapshot(args));
  flushTimer ??= setTimeout(flushLog, FLUSH_DELAY_MS);
}

export function flushLog() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (pending.length === 0) return;
  const entries = pending;
  pending = [];
  browser.runtime.sendMessage({
    type: "debug-log",
    entries,
  });
}

window.addEventListener("pagehide", flushLog);
