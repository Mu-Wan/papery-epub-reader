import { createBookCard } from "./book-card.js";
import { setupBookDrag } from "./book-drag.js";

const byId = (id) => document.querySelector(`#${id}`);

function createBoxCard(box, books, callbacks) {
  const card = document.createElement("article");
  card.className = "box-card";
  card.dataset.boxId = box.id;
  const boxBooks = books.filter((book) => book.boxId === box.id);
  const open = document.createElement("button");
  open.className = "box-open";
  open.type = "button";
  const visual = new Image();
  visual.className = "box-visual";
  visual.src = `${import.meta.env.BASE_URL}box-assets/box-${Math.min(boxBooks.length, 5)}.png`;
  visual.alt = "";
  visual.draggable = false;
  const copy = document.createElement("span");
  copy.className = "box-copy";
  const title = document.createElement("strong");
  title.textContent = box.name;
  const count = document.createElement("small");
  count.textContent = `${boxBooks.length} 本书`;
  copy.append(title, count);
  open.append(visual, copy);
  const menu = document.createElement("details");
  menu.className = "box-menu";
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", `管理书盒“${box.name}”`);
  summary.textContent = "•••";
  const actions = document.createElement("div");
  const rename = document.createElement("button");
  rename.textContent = "重命名";
  rename.addEventListener("click", () => callbacks.onBoxAction("rename", box));
  const remove = document.createElement("button");
  remove.textContent = "删除";
  remove.addEventListener("click", () => callbacks.onBoxAction("delete", box));
  actions.append(rename, remove);
  menu.append(summary, actions);
  card.append(open, menu);
  open.addEventListener("click", () => callbacks.onOpenBox(box));
  return card;
}

function visibleBooks(state) {
  if (state.boxId) return state.books.filter((book) => book.boxId === state.boxId);
  if (state.view === "finished") return state.books.filter((book) => book.status === "finished");
  if (state.view === "reading") return state.books.filter((book) => book.status === "reading");
  return state.books.filter((book) => book.status !== "finished" && !book.boxId);
}

function headingFor(state) {
  if (state.boxId) return state.boxes.find((box) => box.id === state.boxId)?.name || "书盒";
  return { reading: "正在读", library: "我的书架", finished: "已完成" }[state.view];
}

export function renderLibrary(state, callbacks) {
  const books = visibleBooks(state);
  const isLibraryOverview = state.view === "library" && !state.boxId;
  byId("shelfTitle").textContent = headingFor(state);
  byId("boxBackButton").hidden = !state.boxId;
  byId("bookCount").textContent = isLibraryOverview ? `${books.length} 本 · ${state.boxes.length} 个书盒` : `${books.length} 本`;
  byId("createBoxButton").hidden = !isLibraryOverview;
  document.querySelectorAll("#shelfTabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  const boxGrid = byId("boxGrid");
  boxGrid.hidden = !isLibraryOverview || state.boxes.length === 0;
  boxGrid.replaceChildren(...state.boxes.map((box) => createBoxCard(box, state.books, callbacks)));
  const grid = byId("bookGrid");
  grid.hidden = books.length === 0;
  grid.replaceChildren(...books.map((book) => createBookCard(book, callbacks.onOpen, callbacks.onBookAction)));
  setupBookDrag(callbacks);
  const empty = byId("emptyState");
  empty.hidden = isLibraryOverview ? state.boxes.length + books.length > 0 : books.length > 0;
  empty.querySelector("h3").textContent = "这里还没有书";
  empty.querySelector("p").textContent = state.view === "reading" ? "点开书架中的一本书，它就会出现在这里。" : "添加本地 EPUB 或 TXT，开始安静阅读。";
  empty.querySelector("label").hidden = state.view === "reading";
}
