let readerEntry = false;
let returnToLibrary = () => {};

// 浏览器与窄屏 Tauri 都使用历史栈，让系统返回手势先回到书架。
const usesHistory = () => !window.__TAURI_INTERNALS__ || matchMedia("(max-width: 620px)").matches;

export function setupReaderHistory(callback) {
  returnToLibrary = callback;
  if (!usesHistory()) return;
  if (history.state?.paperyView !== "library") history.replaceState({ paperyView: "library" }, "");
  window.addEventListener("popstate", () => {
    if (!readerEntry) return;
    readerEntry = false;
    returnToLibrary();
  });
}

export function enterReaderHistory() {
  if (!usesHistory() || readerEntry) return;
  history.pushState({ paperyView: "reader" }, "");
  readerEntry = true;
}

export function leaveReaderHistory() {
  if (usesHistory() && readerEntry) {
    history.back();
    return;
  }
  readerEntry = false;
  returnToLibrary();
}
