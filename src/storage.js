let requestInFlight;

async function persistStorage(toast, notify) {
  if (window.__TAURI_INTERNALS__ || !navigator.storage?.persist) return true;
  try {
    if (await navigator.storage.persisted()) return true;
    const granted = await navigator.storage.persist();
    if (!granted && notify) toast("浏览器暂未允许保护存储，请保留备份；稍后可在“管理”中重试");
    return granted;
  } catch {
    if (notify) toast("建议定期导出备份，避免浏览器清理本地书架");
    return false;
  }
}

export function setupPersistentStorage(toast) {
  const button = document.querySelector("#protectStorageButton");
  if (window.__TAURI_INTERNALS__ || !navigator.storage?.persist) {
    if (button) button.hidden = true;
    return async () => true;
  }
  const ensure = (notify = true) => {
    requestInFlight ||= persistStorage(toast, notify).finally(() => { requestInFlight = null; });
    return requestInFlight;
  };
  const syncButton = async () => {
    const granted = await navigator.storage.persisted();
    button.textContent = granted ? "本地书架已保护" : "保护本地书架";
    button.disabled = granted;
  };
  button.addEventListener("click", async () => {
    const granted = await ensure(true);
    await syncButton();
    button.closest("details")?.removeAttribute("open");
    if (granted) toast("本地书架已获得持久存储保护");
  });
  syncButton();
  window.addEventListener("appinstalled", () => ensure(false));
  return ensure;
}
