import { deleteBook, listBooks, updateBook } from "./book-store.js";
import { deleteBox, listBoxes, saveBox } from "./box-store.js";
import { renderHeatmap } from "./heatmap.js";
import { renderLibrary } from "./library.js";
import { closeReader, openReader, setupReader } from "./reader.js";
import { enterReaderHistory, leaveReaderHistory, setupReaderHistory } from "./reader-history.js";
import { openBoxDialog, setupShelfControls } from "./shelf-controls.js";
import { setupPwaInstall } from "./pwa-install.js";
import { setupPwaUpdates } from "./pwa-update.js";
import { setupPersistentStorage } from "./storage.js";
import { setupWindowControls } from "./window-controls.js";
import { setupSettingsDialog } from "./settings-dialog.js";
import { setupDismissiblePopovers } from "./dismiss-popovers.js";
import { moveBookToBox, reorderBooks } from "./book-order.js";
const byId = (id) => document.querySelector(`#${id}`);
const libraryView = byId("libraryView");
const readerView = byId("readerView");
const state = { books: [], boxes: [], view: "library", boxId: null };
let toastTimer;
let shelfTransition;
const closeSettings = setupSettingsDialog();
function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 4200);
}

async function refresh() {
  [state.books, state.boxes] = await Promise.all([listBooks(), listBoxes()]);
  renderLibrary(state, callbacks);
  await renderHeatmap();
}

function transitionShelf() {
  const render = () => renderLibrary(state, callbacks);
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return render();
  shelfTransition?.skipTransition();
  shelfTransition = document.startViewTransition(render);
  return shelfTransition.finished.catch(() => {});
}

async function preloadBoxCovers(box) {
  const covers = state.books.filter((book) => book.boxId === box.id && book.cover).map((book) => book.cover);
  await Promise.all(covers.map(async (source) => {
    const image = new Image();
    image.src = source;
    try { await image.decode(); } catch { /* 封面解码失败时仍允许进入书盒。 */ }
  }));
}

async function showReader(book) {
  const activeBook = book.status === "unread" ? await updateBook(book.id, { status: "reading" }) : book;
  libraryView.hidden = true;
  readerView.hidden = false;
  enterReaderHistory();
  try {
    await openReader(activeBook);
  } catch (error) {
    console.error(error);
    toast("这本书暂时无法打开");
    leaveReaderHistory();
  }
}

async function showLibrary() {
  await closeReader();
  closeSettings();
  readerView.hidden = true;
  libraryView.hidden = false;
  await refresh();
}

async function setBookStatus(book, status) {
  const finished = status === "finished";
  await updateBook(book.id, {
    status,
    finishedAt: finished ? Date.now() : null,
    finishPrompted: finished || book.finishPrompted,
  });
  const messages = { finished: "已放入已读完", reading: "已移回在读", unread: "已取消在读" };
  toast(messages[status]);
  await refresh();
}

async function onBookAction(action, book) {
  if (action === "open") return showReader(book);
  if (action === "box") return openBoxDialog(book, state.boxes, toast);
  if (action === "unbox") await updateBook(book.id, { boxId: null });
  if (["finish", "reading", "unread"].includes(action)) {
    return setBookStatus(book, action === "finish" ? "finished" : action);
  }
  if (action === "delete") {
    if (!confirm(`从书架删除《${book.title}》？`)) return;
    await deleteBook(book.id);
    toast("已从书架删除");
  }
  await refresh();
}

async function onBoxAction(action, box) {
  if (action === "rename") {
    const name = prompt("书盒的新名字", box.name)?.trim();
    if (!name) return;
    await saveBox({ ...box, name, updatedAt: Date.now() });
  }
  if (action === "delete") {
    if (!confirm(`删除书盒“${box.name}”？书籍会回到主书架。`)) return;
    await deleteBox(box.id);
  }
  await refresh();
}

async function onProgress(book) {
  const stored = state.books.find((item) => item.id === book.id);
  if (stored) Object.assign(stored, book);
  if (book.progress < 0.98 || book.finishPrompted || book.status === "finished") return;
  book.finishPrompted = true;
  await updateBook(book.id, { finishPrompted: true });
  if (confirm("已经读到末尾，要标记为已读完吗？")) await updateBook(book.id, { status: "finished", finishedAt: Date.now() });
}

const callbacks = {
  onOpen: showReader,
  onBookAction,
  onOpenBox: async (box) => {
    await preloadBoxCovers(box);
    state.view = "library";
    state.boxId = box.id;
    await transitionShelf();
  },
  onBoxAction,
  onReorder: async (ids) => { await reorderBooks(ids); await refresh(); },
  onMoveToBox: async (bookId, boxId) => {
    await moveBookToBox(bookId, boxId, state.books);
    toast("已拖入书盒");
    await refresh();
  },
};

setupReaderHistory(showLibrary);
setupReader({ onBack: leaveReaderHistory, onProgress });
setupShelfControls({ state, refresh, render: transitionShelf, toast, ensureStorage: setupPersistentStorage(toast) });
setupWindowControls();
setupPwaInstall({ toast });
setupPwaUpdates(toast);
setupDismissiblePopovers();
refresh();
