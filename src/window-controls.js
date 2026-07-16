import { getCurrentWindow } from "@tauri-apps/api/window";

export function setupWindowControls() {
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
  document.documentElement.classList.toggle("tauri", isTauri);
  if (!isTauri) return;

  const appWindow = getCurrentWindow();
  document.querySelector("#minimizeButton").addEventListener("click", () => appWindow.minimize());
  document.querySelector("#maximizeButton").addEventListener("click", () => appWindow.toggleMaximize());
  document.querySelector("#closeButton").addEventListener("click", () => appWindow.close());
  document.querySelector("#appTitlebar").addEventListener("dblclick", (event) => {
    if (!event.target.closest("button")) appWindow.toggleMaximize();
  });
}
