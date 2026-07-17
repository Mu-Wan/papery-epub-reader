import { registerSW } from "virtual:pwa-register";

export function setupPwaUpdates(toast) {
  if (import.meta.env.MODE !== "web" || !("serviceWorker" in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast("发现新版，正在更新页面…");
      updateSW(true);
    },
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
    hadController = true;
  });
  const check = () => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  setTimeout(check, 1200);
  setInterval(check, 10 * 60 * 1000);
}
