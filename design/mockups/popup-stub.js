// Stands in for Safari's extension APIs, so the real popup.js can draw the
// popup for a mockup with these settings.
const SETTINGS = {
    showToolbar: true,
    autoplay: false,
    resumePlayback: true,
    evenLoudness: true,
    quality: '1080p',
    showCaption: false,
    subtitles: 'system',
    hideShorts: true,
    hideRecommendations: false,
    hideComments: true,
    hideEndScreens: true,
    showDislikes: true,
};
const pick = (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, SETTINGS[k]]));
window.browser = {
    runtime: { sendMessage: () => Promise.resolve({ logs: [] }) },
    storage: {
        sync: { get: (keys) => Promise.resolve(pick(keys)), set: () => Promise.resolve() },
        local: { get: () => Promise.resolve({ icloudSync: true }), set: () => Promise.resolve() },
    },
    tabs: { query: () => Promise.resolve([]), sendMessage: () => Promise.resolve() },
};
