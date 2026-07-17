let requestInFlight;

async function persistStorage(toast, notify) {
  if (window.__TAURI_INTERNALS__ || !navigator.storage?.persist) return true;
  try {
    if (await navigator.storage.persisted()) return true;
    const granted = await navigator.storage.persist();
    if (!granted && notify) toast("本地书架尚未锁定，请在管理中定期导出备份");
    return granted;
  } catch {
    if (notify) toast("建议定期导出备份，避免浏览器清理本地书架");
    return false;
  }
}

export function setupPersistentStorage(toast) {
  const ensure = (notify = true) => {
    requestInFlight ||= persistStorage(toast, notify).finally(() => { requestInFlight = null; });
    return requestInFlight;
  };
  ensure(false).then((granted) => {
    if (!granted) toast("首次操作时会再次尝试保护本地书架");
  });
  document.addEventListener("pointerup", () => ensure(false), { once: true, capture: true });
  window.addEventListener("appinstalled", () => ensure(false));
  return ensure;
}
