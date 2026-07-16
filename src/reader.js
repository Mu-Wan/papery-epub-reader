import ePub from "epubjs";
import { saveBook } from "./db.js";
import { loadPreferences } from "./preferences.js";
import { applyReaderTheme, setupSettingControls } from "./reader-settings.js";

let book;
let rendition;
let record;
let preferences = loadPreferences();
let lastWheel = 0;
let contentPointerDown = () => {};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function applyReaderMargin() {
  document.querySelector("#readerView").style.setProperty("--reader-margin", `${preferences.margin}px`);
}

const updateTheme = () => applyReaderTheme(rendition, preferences);

function page(direction) {
  if (!rendition) return;
  direction === "next" ? rendition.next() : rendition.prev();
}

function onWheel(event) {
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (Math.abs(delta) < 18 || Date.now() - lastWheel < 420) return;
  event.preventDefault();
  lastWheel = Date.now();
  page(delta > 0 ? "next" : "prev");
}

function onKeydown(event) {
  if (document.querySelector("#readerView").hidden) return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") page("next");
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") page("prev");
}

async function commitMargin() {
  applyReaderMargin();
  if (!rendition) return;
  const location = rendition.location?.start?.cfi || record?.location;
  await nextFrame();
  rendition.resize(undefined, undefined, location);
}

export function setupReader(onBack, onContentPointerDown) {
  contentPointerDown = onContentPointerDown;
  document.querySelector("#prevButton").addEventListener("click", () => page("prev"));
  document.querySelector("#nextButton").addEventListener("click", () => page("next"));
  document.querySelector("#readerStage").addEventListener("wheel", onWheel, { passive: false });
  document.querySelector("#backButton").addEventListener("click", onBack);
  document.addEventListener("keydown", onKeydown);
  setupSettingControls(preferences, { onThemeChange: updateTheme, onMarginInput: applyReaderMargin, onMarginCommit: commitMargin });
}

export async function openReader(bookRecord) {
  record = bookRecord;
  document.querySelector("#readerTitle").textContent = record.title;
  document.querySelector("#viewer").innerHTML = '<div class="loading">正在打开书页…</div>';
  book = ePub(record.data);
  await book.ready;
  document.querySelector("#viewer").replaceChildren();
  applyReaderMargin();
  rendition = book.renderTo("viewer", { width: "100%", height: "100%", flow: "paginated", spread: "auto", minSpreadWidth: 960 });
  rendition.hooks.content.register((contents) => {
    contents.document.addEventListener("wheel", onWheel, { passive: false });
    contents.document.addEventListener("keydown", onKeydown);
    contents.document.addEventListener("pointerdown", contentPointerDown);
  });
  rendition.on("relocated", async (location) => {
    const current = location.start.index + 1;
    const total = book.spine.length;
    document.querySelector("#readerProgress").textContent = `第 ${current} / ${total} 章`;
    record = { ...record, location: location.start.cfi, lastRead: Date.now() };
    await saveBook(record);
  });
  updateTheme();
  await nextFrame();
  await rendition.display(record.location || undefined);
}

export function closeReader() {
  rendition?.destroy();
  book?.destroy();
  rendition = null;
  book = null;
  record = null;
}
