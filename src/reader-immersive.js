// 手机沉浸模式保留系统安全区和页码，轻触页面顶部即可退出。
const byId = (id) => document.querySelector(`#${id}`);

export function setupImmersiveMode(getRendition) {
  const view = byId("readerView");
  const button = byId("immersiveButton");
  const exit = byId("immersiveExit");
  const compact = matchMedia("(max-width: 620px)");
  let resizeTimer;

  function resizeReader() {
    const resize = () => {
      const current = getRendition();
      if (current?.manager) current.resize();
    };
    requestAnimationFrame(resize);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 220);
  }

  function setImmersive(enabled) {
    const active = Boolean(enabled && compact.matches);
    const changed = view.classList.contains("immersive") !== active;
    view.classList.toggle("immersive", active);
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "退出" : "沉浸";
    exit.hidden = !active;
    if (changed) resizeReader();
  }

  button.addEventListener("click", () => setImmersive(!view.classList.contains("immersive")));
  exit.addEventListener("click", () => setImmersive(false));
  window.addEventListener("reader-before-leave", (event) => {
    if (!view.classList.contains("immersive")) return;
    event.preventDefault();
    setImmersive(false);
  });
  compact.addEventListener("change", (event) => { if (!event.matches) setImmersive(false); });
  return () => setImmersive(false);
}
