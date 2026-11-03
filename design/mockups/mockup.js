// Builds a README mockup: Safari showing a video with Spelare's controls.
// Each page sets window.SHOT to "player", "menu" or "popup" before this runs.
// Spelare's controls and menu use the same markup as src/content/toolbar.js,
// styled by extension/mac.css.

const icon = {
    sidebar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="2.5"/><path d="M6 2.5v11"/></svg>',
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    forward: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>',
    lock: '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="5" width="8" height="6" rx="1.5"/><path d="M4 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    share: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5v8M5 4.5l3-3 3 3M4.5 7H3.5v7h9V7h-1"/></svg>',
    tabs: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="4.5" width="10" height="10" rx="2"/><path d="M4.5 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8"/></svg>',
    fullscreen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
    pip: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="13" height="10" rx="2"/><rect x="8" y="7.5" width="5" height="3.5" rx="1" fill="currentColor"/></svg>',
    sound: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.5 6.5 0 0 1 0 9"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>',
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2c.5-.3.5-1 0-1.3l-8-5.2c-.5-.3-1.2 0-1.2.7z"/></svg>',
    captions: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M4.5 7h3M9 7h2.5M4.5 9.8h2M8 9.8h3.5" stroke-linecap="round"/></svg>',
    like: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5 7.2 7.6 2c1 0 1.7.8 1.5 1.8L8.7 6H13a1.5 1.5 0 0 1 1.5 1.7l-.8 5A1.5 1.5 0 0 1 12.2 14H5zM2 7.2h3V14H2z"/></svg>',
    dislike: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M11 8.8 8.4 14c-1 0-1.7-.8-1.5-1.8L7.3 10H3a1.5 1.5 0 0 1-1.5-1.7l.8-5A1.5 1.5 0 0 1 3.8 2H11zM14 8.8h-3V2h3z"/></svg>',
    airplay: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 11.5H2.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H12"/><path d="M8 9.5l3.5 4h-7z" fill="currentColor"/></svg>',
};

const SHOT = window.SHOT || "player";
const playing = SHOT === "player";

function chrome() {
    return `
    <div class="chrome">
      <div class="lights"><i></i><i></i><i></i></div>
      <div class="icon">${icon.sidebar}</div>
      <div class="icon">${icon.back}</div>
      <div class="icon">${icon.forward}</div>
      <div class="address">${icon.lock} youtube.com</div>
      <div class="extension ${SHOT === "popup" ? "open" : ""}">
        <img src="../../extension/images/toolbar-icon-38.png" alt="">
        <span class="badge">1080</span>
      </div>
      <div class="icon">${icon.share}</div>
      <div class="icon">${icon.tabs}</div>
    </div>`;
}

function nativeControls() {
    return `
    <div class="native top-left"><span class="b">${icon.fullscreen}</span><span class="b">${icon.pip}</span></div>
    <div class="native top-right"><span class="b">${icon.sound}</span></div>
    <div class="native bar">
      <span class="b">${playing ? icon.pause : icon.play}</span>
      <span>12:04</span>
      <span class="scrub"><i></i></span>
      <span>−19:41</span>
      <span class="b">${icon.airplay}</span>
      <span class="b">${icon.captions}</span>
    </div>`;
}

// Spelare's capsule, as createToolbar() and addChaptersButton() build it.
function spelareToolbar() {
    const menuOpen = SHOT === "menu";
    return `
    <div id="spelare-toolbar" class="visible">
      <div class="controls">
        <button type="button" class="button chapters" aria-haspopup="menu" aria-expanded="false">Golden hour over the fjord</button>
        <button type="button" class="button settings icon-only" aria-label="Settings" aria-haspopup="menu" aria-expanded="${menuOpen}"></button>
        <button type="button" class="button theater icon-only" aria-label="Theater mode"></button>
      </div>
      ${menuOpen ? settingsMenu() : ""}
    </div>`;
}

// The Settings menu, with the items settingsMenuItems() gives a video that
// has two dubs.
function settingsMenu() {
    const row = (label, active = false) =>
        `<button type="button" class="button${active ? " active" : ""}" role="menuitemradio" aria-checked="${active}"><span class="menu-label">${label}</span></button>`;
    const heading = (text) => `<div class="menu-heading" role="presentation">${text}</div>`;
    const separator = '<div class="separator" role="separator"></div>';
    return `
    <div class="picker" role="menu" aria-label="Settings" style="--spelare-menu-max-height: 600px">
      ${heading("Quality")}
      ${row("Auto")}
      ${row("2160p")}
      ${row("1440p")}
      ${row("1080p", true)}
      ${row("720p")}
      ${row("480p")}
      ${row("360p")}
      ${separator}
      ${row("Sound only")}
      ${separator}
      ${heading("Audio")}
      ${row("Original (English)", true)}
      ${row("Spanish")}
      ${row("Japanese")}
    </div>`;
}

function sideCards() {
    const thumbs = [
        "linear-gradient(135deg, #2b5876, #4e4376)",
        "linear-gradient(135deg, #f7971e, #c0392b)",
        "linear-gradient(135deg, #11998e, #38ef7d)",
        "linear-gradient(135deg, #8e2de2, #4a00e0)",
        "linear-gradient(135deg, #ee9ca7, #ffdde1)",
        "linear-gradient(135deg, #355c7d, #c06c84)",
    ];
    return thumbs
        .map((bg) => `<div class="card"><div class="thumb" style="background:${bg}"></div><div class="lines"><i></i><i></i><i></i></div></div>`)
        .join("");
}

function popover() {
    return `
    <div class="popover" style="--arrow-right: 98px">
      <iframe src="popup-frame.html"></iframe>
    </div>`;
}

document.body.innerHTML = `
  <div class="window">
    ${chrome()}
    ${SHOT === "popup" ? popover() : ""}
    <div class="page">
      <div>
        <div class="player html5-video-player">
          <div class="frame"></div>
          ${nativeControls()}
          ${spelareToolbar()}
        </div>
        <div class="title">Golden Hour in the Fjords: A Slow Film for Quiet Evenings (4K)</div>
        <div class="channel"><span class="avatar"></span><b>Nordic Light</b> · 812K views
          <div class="actions"><span>${icon.like} 24K</span><span>${icon.dislike} 312</span><span>${icon.share} Share</span></div>
        </div>
        <div class="description"><b>812K views · 2 weeks ago</b><br>
          Thirty minutes of golden hour on a Norwegian fjord, filmed in one take. Put it on, dim the lights, breathe out.<br>
          0:00 Golden hour over the fjord · 9:40 The boat · 18:15 Blue hour · 26:30 First stars</div>
      </div>
      <div class="side">${sideCards()}</div>
    </div>
  </div>`;

// The menu opens under the Settings button, as openMenu() places it.
const picker = document.querySelector("#spelare-toolbar .picker");
if (picker) {
    const anchor = document.querySelector("#spelare-toolbar .settings");
    picker.style.setProperty("--spelare-menu-left", `${anchor.offsetLeft}px`);
}
