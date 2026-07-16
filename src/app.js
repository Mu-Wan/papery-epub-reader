import { deleteBook, listBooks } from "./db.js";
import { importEpub } from "./importer.js";
import { renderLibrary } from "./library.js";
import { closeReader, openReader, setupReader } from "./reader.js";
import { setupWindowControls } from "./window-controls.js";

const libraryView = document.querySelector("#libraryView");
const readerView = document.querySelector("#readerView");
const input = document.querySelector("#bookInput");
const settingsButton = document.querySelector("#settingsButton");
const settingsPanel = document.querySelector("#settingsPanel");
let toastTimer;

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}

async function refresh() {
  const books = await listBooks();
  renderLibrary(books, showReader, removeBook);
}

async function showReader(book) {
  libraryView.hidden = true;
  readerView.hidden = false;
  try {
    await openReader(book);
  } catch (error) {
    console.error(error);
    toast("这本书暂时无法打开");
    showLibrary();
  }
}

async function showLibrary() {
  closeReader();
  settingsPanel.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  readerView.hidden = true;
  libraryView.hidden = false;
  await refresh();
}

async function removeBook(book) {
  if (!confirm(`从书架移除《${book.title}》？`)) return;
  await deleteBook(book.id);
  await refresh();
  toast("已从书架移除");
}

input.addEventListener("change", async () => {
  const files = [...input.files];
  for (const file of files) {
    try {
      toast(`正在添加《${file.name}》`);
      await importEpub(file);
    } catch (error) {
      console.error(error);
      toast(`无法读取 ${file.name}`);
    }
  }
  input.value = "";
  await refresh();
  if (files.length) toast(`已添加 ${files.length} 本书`);
});

settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
});

setupReader(showLibrary);
setupWindowControls();
refresh();
