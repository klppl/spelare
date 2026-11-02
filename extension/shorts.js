// Runs on /shorts/ pages, where mac.js stays out and YouTube's own player
// plays. YouTube moves between pages without reloading, so when it navigates
// away from Shorts, reload: the new page then starts with mac.js.
function reloadUnlessShorts() {
    if (!location.pathname.startsWith('/shorts/')) location.replace(location.href);
}

document.addEventListener('yt-navigate-finish', reloadUnlessShorts);
window.addEventListener('popstate', reloadUnlessShorts);
