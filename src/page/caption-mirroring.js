(() => {
  try {
    Object.defineProperty(window, "setupCaptionMirroring", {
      get: () => function () {},
      set() {},
      configurable: false,
    });
  } catch (error) {}
  function spelareVideo() {
    return (
      document.querySelector("video[data-spelare-video]") ||
      (location.pathname.startsWith("/embed/")
        ? document.querySelector("video")
        : null)
    );
  }
  function subtitleTracks(video) {
    return Array.from(video.textTracks).filter(
      (track) => track.kind === "subtitles",
    );
  }
  function isYouTubeForcedTrack(track) {
    return track.kind === "forced" && track.label === "YouTube Captions";
  }
  const nativeModeDescriptor = Object.getOwnPropertyDescriptor(
    TextTrack.prototype,
    "mode",
  );
  if (nativeModeDescriptor?.set)
    Object.defineProperty(TextTrack.prototype, "mode", {
      configurable: true,
      enumerable: nativeModeDescriptor.enumerable,
      get() {
        return nativeModeDescriptor.get.call(this);
      },
      set(mode) {
        const video = spelareVideo();
        if (
          isYouTubeForcedTrack(this) &&
          video &&
          Array.from(video.textTracks).includes(this)
        )
          mode = "disabled";
        nativeModeDescriptor.set.call(this, mode);
      },
    });
  const mediaSession = navigator.mediaSession;
  let updatingSession = false;
  let captionHandlersInstalled = false;
  const setNativeActionHandler =
    mediaSession?.setActionHandler.bind(mediaSession);
  if (mediaSession && "captionTracks" in mediaSession) {
    for (const property of ["captionTracks", "captionsEnabled"]) {
      let descriptor;
      let proto = mediaSession;
      for (; proto && !descriptor;) {
        descriptor = Object.getOwnPropertyDescriptor(proto, property);
        proto = Object.getPrototypeOf(proto);
      }
      if (descriptor?.set)
        Object.defineProperty(mediaSession, property, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get() {
            return descriptor.get.call(this);
          },
          set(value) {
            if (!(!updatingSession && spelareVideo()))
              descriptor.set.call(this, value);
          },
        });
    }
    mediaSession.setActionHandler = function (action, handler) {
      if (
        !spelareVideo() ||
        !["togglecaptions", "selectcaptiontrack"].includes(action)
      )
        return setNativeActionHandler(action, handler);
    };
  }
  function syncMediaSessionCaptions(video) {
    if (video !== spelareVideo()) return;
    for (const track of video.textTracks)
      if (isYouTubeForcedTrack(track) && track.mode !== "disabled")
        track.mode = "disabled";
    if (!mediaSession || !("captionTracks" in mediaSession)) return;
    installCaptionActionHandlers();
    const tracks = subtitleTracks(video);
    updatingSession = true;
    try {
      mediaSession.captionTracks = tracks.map((track) => ({
        label: track.label,
        language: track.language,
        enabled: track.mode === "showing",
      }));
      mediaSession.captionsEnabled = tracks.some(
        (track) => track.mode === "showing",
      );
    } finally {
      updatingSession = false;
    }
  }
  function installCaptionActionHandlers() {
    if (captionHandlersInstalled) return;
    try {
      setNativeActionHandler("togglecaptions", () => {
        const video = spelareVideo();
        if (!video) return;
        const tracks = subtitleTracks(video);
        if (tracks.some((track) => track.mode === "showing"))
          selectSubtitleTrack(video, -1);
        else {
          const autoIndex = tracks.findIndex((track) =>
            track.label.startsWith("Auto-translated"),
          );
          selectSubtitleTrack(video, -1 === autoIndex ? 0 : autoIndex);
        }
      });
      setNativeActionHandler("selectcaptiontrack", (details) => {
        const video = spelareVideo();
        if (video) selectSubtitleTrack(video, details.trackIndex);
      });
      captionHandlersInstalled = true;
    } catch (error) {}
  }
  function selectSubtitleTrack(video, selectedIndex) {
    subtitleTracks(video).forEach((track, index) => {
      track.mode = index === selectedIndex ? "showing" : "disabled";
    });
    syncMediaSessionCaptions(video);
  }
  const watchedVideos = new WeakSet();
  function watchTextTracks(video) {
    if (!watchedVideos.has(video)) {
      watchedVideos.add(video);
      ["addtrack", "removetrack", "change"].forEach((type) => {
        video.textTracks.addEventListener(type, () =>
          syncMediaSessionCaptions(video),
        );
      });
    }
    syncMediaSessionCaptions(video);
  }
  const nativeClassListAdd = DOMTokenList.prototype.add;
  function keepPageVisible() {
    document.addEventListener(
      "visibilitychange",
      (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
    document.addEventListener(
      "webkitvisibilitychange",
      (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
    window.addEventListener(
      "pagehide",
      (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
    Object.defineProperties(document, {
      hidden: {
        value: false,
      },
      visibilityState: {
        value: "visible",
      },
    });
  }
  DOMTokenList.prototype.add = function (...tokens) {
    nativeClassListAdd.apply(this, tokens);
    if (tokens[0] !== "ad-created") return;
    const player = document.querySelector("#movie_player");
    if (typeof player?.getPlayerResponse !== "function") return;
    // Between videos there may be no response; this runs inside YouTube's
    // own classList.add call, so it must not throw.
    const response = player.getPlayerResponse();
    if (!response) return;
    if (response.playerAds) response.playerAds = [];
    if (response.adPlacements) response.adPlacements = [];
    if (response.adSlots) response.adSlots = [];
  };
  if (document.visibilityState === "visible") keepPageVisible();
  else
    document.addEventListener(
      "visibilitychange",
      function onVisible() {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVisible, true);
          keepPageVisible();
        }
      },
      true,
    );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "SELECT" ||
        event.target.tagName === "TEXTAREA" ||
        event.target.isContentEditable
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if ("cfijklmqt,. <>".includes(key)) {
        event.stopImmediatePropagation();
        if (key === " ") event.preventDefault();
      }
    },
    true,
  );
  const controlsObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const video = mutation.target;
      if (!video.controls) video.controls = true;
      if (!(video.readyState < 4)) {
        if (true === video.webkitWirelessVideoPlaybackDisabled)
          video.webkitWirelessVideoPlaybackDisabled = false;
        if (true === video.disableRemotePlayback)
          video.disableRemotePlayback = false;
      }
    });
  });
  function setupSpelareVideo() {
    const video = document.querySelector(
      "video[data-spelare-video]:not([data-spelare-setup])",
    );
    if (!video) return;
    const container = video.closest("div");
    if (container) container.setAttribute("data-spelare-container", true);
    video.controls = true;
    if (video.hasAttribute("data-spelare-fallback"))
      controlsObserver.observe(video, {
        attributes: true,
        attributeFilter: ["controls"],
      });
    video.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    video.addEventListener("dblclick", (event) => {
      event.stopPropagation();
    });
    video.addEventListener("contextmenu", (event) => {
      event.stopPropagation();
    });
    watchTextTracks(video);
    video.setAttribute("data-spelare-setup", true);
  }
  function removeOtherVideos() {
    if (!document.querySelector("video[data-spelare-video]")) return;
    const others = document.querySelectorAll("video:not([data-spelare-video])");
    if (others.length !== 0)
      others.forEach((video) => {
        video.remove();
      });
  }
  function setupEmbedVideo() {
    const video = document.querySelector("video:not([data-spelare-setup])");
    if (!video) return;
    const container = video.closest("div");
    if (container) container.setAttribute("data-spelare-container", true);
    video.controls = true;
    controlsObserver.observe(video, {
      attributes: true,
      attributeFilter: ["controls"],
    });
    video.addEventListener("contextmenu", (event) => {
      event.stopPropagation();
    });
    video.addEventListener("play", (event) => {
      const topControls = document.querySelector(
        ".ytp-chrome-top, .ytwPlayerTopControlsHost",
      );
      if (topControls) topControls.classList.remove("paused");
    });
    video.addEventListener("pause", (event) => {
      const topControls = document.querySelector(
        ".ytp-chrome-top, .ytwPlayerTopControlsHost",
      );
      if (topControls) topControls.classList.add("paused");
    });
    video.addEventListener("ended", (event) => {
      video.removeAttribute("data-spelare-video");
    });
    video.setAttribute("data-spelare-video", true);
    watchTextTracks(video);
    video.setAttribute("data-spelare-setup", true);
  }
  if (location.pathname.startsWith("/embed/")) {
    window.addEventListener(
      "click",
      (event) => {
        if (event.metaKey) return;
        const path = event.composedPath();
        for (let node of path)
          if (
            node.nodeType === 1 &&
            node.nodeName === "A" &&
            node.hasAttribute("href")
          ) {
            if (node.isContentEditable) return;
            event.preventDefault();
            window.open(node.href, "_blank");
          }
      },
      true,
    );
    setupEmbedVideo();
  } else if (!location.pathname.startsWith("/shorts/")) {
    setupSpelareVideo();
    removeOtherVideos();
  }
  new MutationObserver((mutations) => {
    if (location.pathname.startsWith("/embed/")) setupEmbedVideo();
    else if (!location.pathname.startsWith("/shorts/")) {
      setupSpelareVideo();
      removeOtherVideos();
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
