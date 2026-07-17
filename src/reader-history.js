let readerEntry = false;
let returnToLibrary = () => {};

const isWeb = () => !window.__TAURI_INTERNALS__;

export function setupReaderHistory(callback) {
  returnToLibrary = callback;
  if (!isWeb()) return;
  if (history.state?.paperyView !== "library") history.replaceState({ paperyView: "library" }, "");
  window.addEventListener("popstate", () => {
    if (!readerEntry) return;
    readerEntry = false;
    returnToLibrary();
  });
}

export function enterReaderHistory() {
  if (!isWeb() || readerEntry) return;
  history.pushState({ paperyView: "reader" }, "");
  readerEntry = true;
}

export function leaveReaderHistory() {
  if (isWeb() && readerEntry) {
    history.back();
    return;
  }
  readerEntry = false;
  returnToLibrary();
}
