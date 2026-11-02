// The debug log behind the popup's "Show diagnostic log": the last 100 entries
// from content scripts, kept per tab and cleared when the tab loads a page.
// It lives in memory, so it's gone if Safari unloads this background page.
const MAX_ENTRIES = 100;
const logsByTab = new Map();

function addLog(tabId, args) {
    const strings = args.map((arg) => {
        try {
            return JSON.stringify(arg).replace(/^"(.+)"$/, '$1');
        } catch {
            return String(arg);
        }
    });

    let logs = logsByTab.get(tabId);
    if (!logs) {
        logs = [];
        logsByTab.set(tabId, logs);
    }
    logs.push(strings.join(' '));

    if (logs.length > MAX_ENTRIES) logs.shift();
}

// Runtime messages are { type: 'kebab-case', ...fields }, like the page messages.
browser.runtime.onMessage.addListener((request, sender) => {
    const tabId = sender?.tab?.id ?? -1;
    if (request.type === 'debug-log') {
        // Content scripts send batches of entries, each an array of log() args.
        for (const args of request.entries) addLog(tabId, args);
    } else if (request.type === 'clear-logs') {
        logsByTab.delete(tabId);
    } else if (request.type === 'get-logs') {
        // The popup asks for the log of the tab it was opened over.
        return Promise.resolve({ logs: logsByTab.get(request.tabId) ?? [] });
    }
});

browser.tabs?.onRemoved.addListener((tabId) => {
    logsByTab.delete(tabId);
});
