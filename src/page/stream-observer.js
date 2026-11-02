// Page-world observer: finds an HLS manifest for the current video and posts it
// to the content script. ES module bundled by scripts/build.mjs (runs in strict mode).
// If it was already injected into this page, it only re-announces itself.
import { isGooglevideoURL } from "../shared/hosts.js";
import {
  CLIENTS,
  PLAYER_ENDPOINT,
  VISIONOS_CLIENT_ID,
  playerRequestBody,
} from "../shared/innertube.js";
import {
  CONTENT_MESSAGE,
  CONTENT_MESSAGE_SOURCE,
  PAGE_MESSAGE,
  PAGE_MESSAGE_SOURCE,
} from "../shared/page-messages.js";
import { claimInstall } from "../shared/namespace.js";
import { pollFor } from "../shared/poll.js";
import { isValidVideoId } from "../shared/video-id.js";

const SOLVER_GLOBAL = "__tubelessJSC";
const pageFetch = window.fetch;
const preparedPlayers = new Map();
let generation = 0;
let startedVideoId = null;
let deliveredVideoId = null;
function postDiagnostic(message) {
  window.postMessage(
    {
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_MESSAGE.DIAGNOSTIC,
      message: message,
    },
    location.origin,
  );
}
function currentVideoId() {
  try {
    const url = new URL(location.href);
    if (url.pathname !== "/watch") return null;
    const videoId = url.searchParams.get("v");
    if (isValidVideoId(videoId)) return videoId;
    const canonicalHref = document.querySelector('link[rel="canonical"]')?.href;
    if (canonicalHref) {
      const canonicalURL = new URL(canonicalHref, location.href);
      const canonicalId =
        canonicalURL.pathname === "/watch"
          ? canonicalURL.searchParams.get("v")
          : null;
      if (isValidVideoId(canonicalId)) return canonicalId;
    }
  } catch {}
  return null;
}
function findPlayerResponse(videoId) {
  const player =
    document.getElementById("movie_player") ??
    document.querySelector(".html5-video-player");
  const candidates = [];
  if (typeof player?.getPlayerResponse === "function")
    try {
      candidates.push(player.getPlayerResponse());
    } catch {}
  candidates.push(window.ytInitialPlayerResponse);
  return (
    candidates.find(
      (response) =>
        response?.videoDetails?.videoId === videoId &&
        typeof response?.streamingData?.hlsManifestUrl === "string",
    ) ?? null
  );
}
function webPlayerContext() {
  const context = window.ytcfg?.get?.("INNERTUBE_CONTEXT");
  if (
    !context ||
    typeof context !== "object" ||
    !context.client ||
    typeof context.client !== "object"
  )
    return null;
  const copy = {
    ...context,
    client: {
      ...context.client,
    },
  };
  const visitorData = window.ytcfg?.get?.("VISITOR_DATA");
  if (
    typeof visitorData === "string" &&
    visitorData &&
    !copy.client.visitorData
  )
    copy.client.visitorData = visitorData;
  return copy;
}
async function requestWebPlayer(videoId, requestGeneration) {
  if (typeof pageFetch !== "function")
    throw new Error("Page fetch() is not reachable");
  const context = await waitForWebPlayerContext(requestGeneration);
  if (requestGeneration !== generation) return null;
  if (!context) throw new Error("YouTube's WEB player context was not ready");
  const playbackContext = { html5Preference: "HTML5_PREF_WANTS" };
  const sts = window.ytcfg?.get?.("STS");
  if (Number.isFinite(Number(sts)))
    playbackContext.signatureTimestamp = Number(sts);
  return postPlayerRequest(
    playerRequestBody(videoId, context, playbackContext),
    {
      label: "WEB",
      credentials: "same-origin",
      headers: {},
    },
  );
}
// Polls for YouTube's WEB player context (up to ~2 s) while this request is current.
function waitForWebPlayerContext(expectedGeneration) {
  return pollFor(webPlayerContext, {
    attempts: 20,
    intervalMs: 100,
    isCurrent: () => expectedGeneration === generation,
  });
}
function findVisitorData() {
  const value = window.ytcfg?.get?.("VISITOR_DATA");
  if (typeof value === "string" && value) return value;
  const fallback =
    window.ytcfg?.get?.("INNERTUBE_CONTEXT")?.client?.visitorData;
  return typeof fallback === "string" && fallback ? fallback : null;
}
async function requestVisionOSPlayer(videoId, requestGeneration) {
  if (typeof pageFetch !== "function")
    throw new Error("Page fetch() is not reachable");
  const visitorData = await waitForVisitorData(requestGeneration);
  if (requestGeneration !== generation) return null;
  if (!visitorData) throw new Error("YouTube's visitor data was not ready");
  const client = { ...CLIENTS.VISIONOS, visitorData };
  return postPlayerRequest(playerRequestBody(videoId, { client }), {
    label: "visionOS",
    credentials: "omit",
    headers: {
      "X-Goog-Visitor-Id": visitorData,
      "X-YouTube-Client-Name": VISIONOS_CLIENT_ID,
      "X-YouTube-Client-Version": client.clientVersion,
    },
  });
}

// POSTs a player request through the page's own fetch and returns the
// response if YouTube says the video is playable; `label` names the client in errors.
async function postPlayerRequest(body, { label, credentials, headers }) {
  const url = new URL(PLAYER_ENDPOINT, location.origin);
  url.searchParams.set("prettyPrint", "false");
  const apiKey = window.ytcfg?.get?.("INNERTUBE_API_KEY");
  if (typeof apiKey === "string" && apiKey) url.searchParams.set("key", apiKey);
  const response = await Reflect.apply(pageFetch, window, [
    url.href,
    {
      method: "POST",
      credentials,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  ]);
  if (!response.ok)
    throw new Error(`${label} player request returned HTTP ${response.status}`);
  const data = await response.json();
  if (data?.playabilityStatus?.status !== "OK")
    throw new Error(
      `${label} player request returned ${data?.playabilityStatus?.status ?? "an invalid response"}`,
    );
  return data;
}
// Polls for YouTube's visitor data (up to ~2 s) while this request is current.
function waitForVisitorData(expectedGeneration) {
  return pollFor(findVisitorData, {
    attempts: 20,
    intervalMs: 100,
    isCurrent: () => expectedGeneration === generation,
  });
}
function playerScriptURL(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin &&
      url.pathname.startsWith("/s/player/") &&
      url.pathname.endsWith(".js")
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function findPlayerScriptURL() {
  const candidates = [
    window.ytcfg?.get?.("PLAYER_JS_URL"),
    window.ytplayer?.config?.assets?.js,
  ];
  const configs = window.ytcfg?.get?.("WEB_PLAYER_CONTEXT_CONFIGS");
  if (configs && typeof configs === "object")
    for (const config of Object.values(configs)) candidates.push(config?.jsUrl);
  for (const candidate of candidates) {
    const url = playerScriptURL(candidate);
    if (url) return url;
  }
  const fromScripts = [...document.scripts]
    .map((script) => playerScriptURL(script.src))
    .find(Boolean);
  return (
    fromScripts ||
    (performance
      .getEntriesByType("resource")
      .map((entry) => playerScriptURL(entry.name))
      .find(Boolean) ??
      null)
  );
}
async function solveNChallenge(manifestURL) {
  const challenge = nChallengeFrom(manifestURL);
  if (!challenge) return manifestURL;
  const playerURL = await waitForPlayerScriptURL();
  const preprocessed = await preparePlayer(playerURL);
  const solved = window[SOLVER_GLOBAL]({
    type: "preprocessed",
    preprocessed_player: preprocessed,
    requests: [
      {
        type: "n",
        challenges: [challenge],
      },
    ],
  });
  const first = solved?.responses?.[0];
  const solution = first?.data?.[challenge];
  if (
    solved?.type !== "result" ||
    first?.type !== "result" ||
    typeof solution !== "string" ||
    !solution
  )
    throw new Error(
      first?.error ||
        solved?.error ||
        "YouTube's n challenge could not be solved",
    );
  const solvedURL = new URL(manifestURL);
  solvedURL.pathname = solvedURL.pathname.replace(
    `/n/${challenge}/`,
    `/n/${solution}/`,
  );
  return solvedURL.href;
}
function nChallengeFrom(url) {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).pathname.match(/\/n\/([^/]+)\//)?.[1] ?? null;
  } catch {
    return null;
  }
}
function preparePlayer(scriptURL) {
  let pending = preparedPlayers.get(scriptURL);
  return (
    pending ||
    ((pending = (async () => {
      const solver = window[SOLVER_GLOBAL];
      if (typeof solver !== "function")
        throw new Error("Challenge solver failed to load");
      if (typeof pageFetch !== "function")
        throw new Error("Page fetch() is not reachable");
      const response = await Reflect.apply(pageFetch, window, [
        scriptURL,
        {
          credentials: "same-origin",
        },
      ]);
      if (!response.ok)
        throw new Error(
          `YouTube's player JavaScript returned HTTP ${response.status}`,
        );
      const result = solver({
        type: "player",
        player: await response.text(),
        requests: [],
        output_preprocessed: true,
      });
      if (
        result?.type !== "result" ||
        typeof result.preprocessed_player !== "string"
      )
        throw new Error(
          result?.error || "Could not load the YouTube player script",
        );
      return result.preprocessed_player;
    })()),
    preparedPlayers.set(scriptURL, pending),
    pending.catch(() => preparedPlayers.delete(scriptURL)),
    pending)
  );
}
// Polls for the player JavaScript URL (up to ~2 s); throws if it never appears.
async function waitForPlayerScriptURL() {
  const found = await pollFor(findPlayerScriptURL, {
    attempts: 20,
    intervalMs: 100,
  });
  if (!found) throw new Error("YouTube's player JavaScript URL was not found");
  return found;
}
async function deliverVideoStream(
  playerResponse,
  videoId,
  requestGeneration,
  sourceLabel,
) {
  const responseVideoId = playerResponse?.videoDetails?.videoId;
  const manifestURL = playerResponse?.streamingData?.hlsManifestUrl;
  if (
    requestGeneration !== generation ||
    responseVideoId !== videoId ||
    !isValidVideoId(responseVideoId) ||
    typeof manifestURL !== "string"
  )
    return false;
  const solvedURL = await solveNChallenge(manifestURL);
  return (
    !(requestGeneration !== generation || !isGooglevideoURL(solvedURL)) &&
    (postDiagnostic(
      `Using the HLS stream from ${sourceLabel} for ${responseVideoId}`,
    ),
    window.postMessage(
      {
        source: PAGE_MESSAGE_SOURCE,
        type: PAGE_MESSAGE.PLAYER_RESPONSE,
        candidate: {
          videoId: responseVideoId,
          hlsManifestURL: solvedURL,
        },
      },
      location.origin,
    ),
    (deliveredVideoId = responseVideoId),
    true)
  );
}
async function acquireVideoStream(videoId, requestGeneration, visionOSRequest) {
  try {
    const playerResponse = await waitForPlayerResponse(
      videoId,
      requestGeneration,
    );
    if (playerResponse)
      try {
        if (
          await deliverVideoStream(
            playerResponse,
            videoId,
            requestGeneration,
            "YouTube's player response",
          )
        )
          return;
      } catch (error) {
        postDiagnostic(
          `Could not use the current player response; trying visionOS: ${error?.message ?? "unknown error"}`,
        );
      }
    try {
      const visionOSResponse = await visionOSRequest;
      if (
        visionOSResponse &&
        (await deliverVideoStream(
          visionOSResponse,
          videoId,
          requestGeneration,
          "the visionOS response",
        ))
      )
        return;
    } catch (error) {
      if (requestGeneration === generation)
        postDiagnostic(
          `Could not use the visionOS player response; trying WEB: ${error?.message ?? "unknown error"}`,
        );
    }
    const webResponse = await requestWebPlayer(videoId, requestGeneration);
    if (
      webResponse &&
      (await deliverVideoStream(
        webResponse,
        videoId,
        requestGeneration,
        "the WEB response",
      ))
    )
      return;
    if (requestGeneration === generation)
      throw new Error("No playable HLS stream in the YouTube response");
  } catch (error) {
    if (requestGeneration === generation) {
      const message = error?.message ?? "unknown error";
      postDiagnostic(`Could not obtain YouTube's HLS stream: ${message}`);
      postVideoError(videoId, message);
    }
  }
}
// Polls for YouTube's own player response for `id` (6 tries, 50 ms apart).
function waitForPlayerResponse(id, expectedGeneration) {
  return pollFor(() => findPlayerResponse(id), {
    attempts: 6,
    intervalMs: 50,
    isCurrent: () => expectedGeneration === generation,
  });
}
function postVideoError(id, errorMessage) {
  window.postMessage(
    {
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_MESSAGE.VIDEO_ERROR,
      videoId: id,
      message: errorMessage,
    },
    location.origin,
  );
}
async function acquireAudioStream(videoId, requestGeneration, visionOSRequest) {
  try {
    const playerResponse = await visionOSRequest;
    if (
      playerResponse &&
      (await deliverAudioStream(playerResponse, videoId, requestGeneration))
    )
      return;
    if (requestGeneration === generation)
      throw new Error(
        "No playable audio-only HLS stream in the YouTube response",
      );
  } catch (error) {
    if (requestGeneration === generation)
      postDiagnostic(
        `Could not obtain YouTube's audio-only HLS stream: ${error?.message ?? "unknown error"}`,
      );
  }
}
async function deliverAudioStream(response, id, expectedGeneration) {
  const responseVideoId = response?.videoDetails?.videoId;
  const manifestURL = response?.streamingData?.hlsManifestUrl;
  if (
    expectedGeneration !== generation ||
    responseVideoId !== id ||
    !isValidVideoId(responseVideoId) ||
    typeof manifestURL !== "string"
  )
    return false;
  const solvedURL = await solveNChallenge(manifestURL);
  return !(
    expectedGeneration !== generation ||
    !isGooglevideoURL(solvedURL) ||
    (window.postMessage(
      {
        source: PAGE_MESSAGE_SOURCE,
        type: PAGE_MESSAGE.AUDIO_RESPONSE,
        candidate: {
          videoId: responseVideoId,
          audioManifestURL: solvedURL,
        },
      },
      location.origin,
    ),
    0)
  );
}
function startAcquisition() {
  const videoId = currentVideoId();
  if (
    !isValidVideoId(videoId) ||
    videoId === startedVideoId ||
    videoId === deliveredVideoId
  )
    return;
  startedVideoId = videoId;
  generation += 1;
  postDiagnostic(`Starting HLS stream acquisition for ${videoId}`);
  const visionOSRequest = requestVisionOSPlayer(videoId, generation);
  acquireVideoStream(videoId, generation, visionOSRequest);
  acquireAudioStream(videoId, generation, visionOSRequest);
}
function handleNavigation() {
  if (currentVideoId() !== deliveredVideoId) {
    startedVideoId = null;
    startAcquisition();
  }
}
function postReady() {
  window.postMessage(
    {
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_MESSAGE.READY,
    },
    location.origin,
  );
}
function install() {
  document.addEventListener("yt-navigate-start", () => {
    generation += 1;
    startedVideoId = null;
    deliveredVideoId = null;
  });
  document.addEventListener("yt-navigate-finish", handleNavigation);
  window.addEventListener("load", handleNavigation, {
    once: true,
  });
  window.addEventListener("popstate", () =>
    window.setTimeout(startAcquisition, 0),
  );
  // The content script pings in case it started listening after this
  // observer's first announcement (they're injected by separate scripts).
  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.origin === location.origin &&
      event.data?.source === CONTENT_MESSAGE_SOURCE &&
      event.data.type === CONTENT_MESSAGE.PING
    )
      postReady();
  });
  postReady();
  window.setTimeout(startAcquisition, 0);
}
if (claimInstall("streamObserver")) install();
else postReady();
