// Minimal browser globals so src/content/ modules can be imported and their
// pure helpers called under Node. Anything DOM-heavy is out of scope here.

globalThis.window ??= globalThis;
globalThis.browser ??= {
    runtime: { sendMessage: () => Promise.resolve() },
    storage: { sync: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
};
globalThis.window.addEventListener ??= () => {};
