export async function requestPersistentStorage(toast) {
  if (window.__TAURI_INTERNALS__ || !navigator.storage?.persist) return;
  try {
    if (await navigator.storage.persisted()) return;
    const granted = await navigator.storage.persist();
    if (!granted) toast("浏览器未授予持久存储，请定期导出备份");
  } catch {
    toast("建议定期导出备份，避免浏览器清理本地书架");
  }
}
