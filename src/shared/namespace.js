// Spelare's one global in each JavaScript world: window.__spelare, which
// records the scripts already installed there. The content scripts' isolated
// world and the page world each get their own. The vendored solver's
// window.__tubelessJSC is the only other global (see src/page/vendor/).
const NAMESPACE = "__spelare";

function namespace() {
  if (!Object.hasOwn(window, NAMESPACE))
    Object.defineProperty(window, NAMESPACE, {
      configurable: false,
      enumerable: false,
      value: Object.create(null),
      writable: false,
    });
  return window[NAMESPACE];
}

// Marks `script` installed in this world. Returns false if it already was, so
// a script injected twice (or a reloaded content script) runs its setup once.
export function claimInstall(script) {
  const installed = namespace();
  if (installed[script]) return false;
  Object.defineProperty(installed, script, {
    configurable: false,
    enumerable: true,
    value: true,
    writable: false,
  });
  return true;
}
