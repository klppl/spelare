// URL checks shared by the content script and the page observer.

// True for an https URL string on `domain` or one of its subdomains.
export function isAllowedHost(url, domain) {
  if (typeof url !== "string") return false;
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === domain || hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}

export const isGooglevideoURL = (url) => isAllowedHost(url, "googlevideo.com");
export const isYouTubeURL = (url) => isAllowedHost(url, "youtube.com");
