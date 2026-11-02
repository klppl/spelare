// YouTube video ids as accepted from URLs and page messages.
export function isValidVideoId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
