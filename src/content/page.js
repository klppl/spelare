export function injectPageScript(code) {
  const script = document.createElement("script");
  script.innerHTML = code;
  (document.head || document.documentElement).prepend(script);
  setTimeout(() => {
    script.remove();
  }, 100);
}
