// YouTube's internal player API (InnerTube), as used by the content script
// (captions, ANDROID client) and the page observer (streams, VISIONOS/WEB).
//
// The CLIENTS below impersonate YouTube apps. YouTube eventually stops
// accepting old app versions, so when a client starts failing, update its
// clientVersion/userAgent here; both scripts pick it up on the next build.
export const CLIENTS = {
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 30,
    userAgent:
      "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    osName: "Android",
    osVersion: "11",
    hl: "en",
    timeZone: "UTC",
    utcOffsetMinutes: 0,
  },
  VISIONOS: {
    clientName: "VISIONOS",
    clientVersion: "1.02",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    osName: "visionOS",
    osVersion: "26.5.23O471",
  },
};

// X-YouTube-Client-Name header value for the VISIONOS client.
export const VISIONOS_CLIENT_ID = "101";

export const PLAYER_ENDPOINT = "/youtubei/v1/player";

// Body of a /youtubei/v1/player request.
export function playerRequestBody(
  videoId,
  context,
  contentPlaybackContext = { html5Preference: "HTML5_PREF_WANTS" },
) {
  return {
    context,
    videoId,
    playbackContext: { contentPlaybackContext },
    contentCheckOk: true,
    racyCheckOk: true,
  };
}
