import ePub from "epubjs";
import { getBookFile, saveBook, saveBookLocations } from "./book-store.js";
import { loadPreferences } from "./preferences.js";
import { injectReaderFonts } from "./reader-fonts.js";
import { applyReaderTheme, setupSettingControls } from "./reader-settings.js";
import { startReadingTimer, stopReadingTimer } from "./reading-timer.js";
import { navigatePage } from "./reader-paging.js";
import { bindSwipe } from "./reader-gestures.js";
import { createMarginController } from "./reader-margin.js";
import { setupTocPanel } from "./toc-panel.js";

let book;
let rendition;
let record;
let preferences = loadPreferences();
let lastWheel = 0;
let paging = false;
let progressChanged = () => {};
let generationToken = 0;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const byId = (id) => document.querySelector(`#${id}`);
const margins = createMarginController(preferences, () => rendition, () => rendition?.location?.start?.cfi || record?.location);
const renderToc = setupTocPanel((href) => rendition?.display(href));

const updateTheme = () => applyReaderTheme(rendition, preferences);

async function page(direction) {
  if (!rendition || paging) return;
  paging = true;
  try {
    await navigatePage(rendition, direction);
  } finally {
    paging = false;
  }
}

function onWheel(event) {
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (Math.abs(delta) < 18 || Date.now() - lastWheel < 420) return;
  event.preventDefault();
  lastWheel = Date.now();
  page(delta > 0 ? "next" : "prev");
}

function onKeydown(event) {
  if (byId("readerView").hidden) return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") page("next");
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") page("prev");
}

function progressFrom(location) {
  const mapped = book.locations?.length() ? book.locations.percentageFromCfi(location.start.cfi) : NaN;
  const displayed = location.start.displayed;
  const withinChapter = displayed?.total ? displayed.page / displayed.total : 0;
  const fallback = (location.start.index + withinChapter) / Math.max(book.spine.length, 1);
  return Math.min(1, Math.max(0, Number.isFinite(mapped) ? mapped : fallback));
}

function loadLocations(fileRecord) {
  if (fileRecord.locations) {
    try {
      book.locations.load(fileRecord.locations);
      return true;
    } catch {
      fileRecord.locations = "";
    }
  }
  return false;
}

async function generateLocations(openedBook, bookId, token) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (token !== generationToken) return;
  try {
    await openedBook.locations.generate(1600);
  } catch (error) {
    if (token === generationToken) throw error;
    return;
  }
  if (token !== generationToken) return;
  await saveBookLocations(bookId, openedBook.locations.save());
  if (token === generationToken && rendition?.location) onRelocated(rendition.location);
}

function onRelocated(location) {
  const progress = progressFrom(location);
  byId("readerProgress").textContent = `${Math.round(progress * 100)}% · 第 ${location.start.index + 1} / ${book.spine.length} 章`;
  record = { ...record, location: location.start.cfi, progress, lastRead: Date.now(), updatedAt: Date.now() };
  saveBook(record);
  progressChanged(record);
}

export function setupReader(callbacks) {
  progressChanged = callbacks.onProgress;
  byId("prevButton").addEventListener("click", () => page("prev"));
  byId("nextButton").addEventListener("click", () => page("next"));
  byId("readerStage").addEventListener("wheel", onWheel, { passive: false });
  bindSwipe(byId("readerStage"), page);
  byId("backButton").addEventListener("click", callbacks.onBack);
  document.addEventListener("keydown", onKeydown);
  setupSettingControls(preferences, {
    onThemeChange: updateTheme, onMarginSync: margins.apply,
    onMarginInput: margins.schedule, onMarginCommit: margins.commit,
  });
}

export async function openReader(bookRecord) {
  record = bookRecord;
  byId("readerTitle").textContent = record.title;
  byId("readerProgress").textContent = "";
  byId("viewer").replaceChildren();
  const fileRecord = await getBookFile(record.id);
  if (!fileRecord?.data) throw new Error("书籍文件不存在");
  book = ePub(fileRecord.data);
  await book.ready;
  renderToc(book.navigation?.toc || []);
  const hasLocations = loadLocations(fileRecord);
  margins.apply();
  rendition = book.renderTo("viewer", { width: "100%", height: "100%", flow: "paginated", spread: "auto", minSpreadWidth: 960 });
  rendition.hooks.content.register(async (contents) => {
    await injectReaderFonts(contents);
    contents.document.addEventListener("wheel", onWheel, { passive: false });
    contents.document.addEventListener("keydown", onKeydown);
    bindSwipe(contents.document, page);
  });
  rendition.on("relocated", onRelocated);
  updateTheme();
  await nextFrame();
  await rendition.display(record.location || undefined);
  startReadingTimer();
  if (!hasLocations) generateLocations(book, record.id, ++generationToken).catch(console.error);
}

export async function closeReader() {
  generationToken += 1;
  await stopReadingTimer();
  rendition?.destroy();
  book?.destroy();
  rendition = null;
  book = null;
  record = null;
}
