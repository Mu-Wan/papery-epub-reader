const COLORS = ["#385c52", "#735d4b", "#4f5c78", "#7c4f51", "#646046", "#4e6670"];
const colorFor = (title) => COLORS[[...title].reduce((sum, char) => sum + char.codePointAt(0), 0) % COLORS.length];

function actionButton(label, action, book, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.currentTarget.closest("details").removeAttribute("open");
    callback(action, book);
  });
  return button;
}

function createMenu(book, callback) {
  const details = document.createElement("details");
  details.className = "book-menu";
  details.addEventListener("click", (event) => event.stopPropagation());
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", `管理《${book.title}》`);
  summary.textContent = "⋯";
  const menu = document.createElement("div");
  menu.append(actionButton(book.status === "unread" ? "开始阅读" : "继续阅读", "open", book, callback));
  menu.append(actionButton(book.boxId ? "移出书盒" : "移入书盒…", book.boxId ? "unbox" : "box", book, callback));
  menu.append(actionButton(book.status === "finished" ? "移回在读" : "标记读完", book.status === "finished" ? "reading" : "finish", book, callback));
  menu.append(actionButton("删除", "delete", book, callback));
  details.append(summary, menu);
  return details;
}

function createCover(book) {
  const cover = document.createElement("div");
  cover.className = "book-cover";
  cover.style.background = colorFor(book.title);
  if (book.cover) {
    const image = new Image();
    image.src = book.cover;
    image.alt = `${book.title}封面`;
    cover.append(image);
  } else {
    const title = document.createElement("span");
    title.className = "cover-title";
    title.textContent = book.title;
    cover.append(title);
  }
  const badge = document.createElement("span");
  badge.className = "format-badge";
  badge.textContent = book.format?.toUpperCase() || "EPUB";
  cover.append(badge);
  return cover;
}

export function createBookCard(book, onOpen, onAction) {
  const card = document.createElement("article");
  card.className = "book-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `阅读《${book.title}》`);
  const info = document.createElement("div");
  info.className = "book-info";
  const heading = document.createElement("h3");
  heading.textContent = book.title;
  const author = document.createElement("p");
  author.textContent = book.author;
  const progress = document.createElement("div");
  progress.className = "book-progress";
  progress.innerHTML = `<span><i style="width:${Math.round((book.progress || 0) * 100)}%"></i></span><output>${Math.round((book.progress || 0) * 100)}%</output>`;
  info.append(heading, author, progress, createMenu(book, onAction));
  card.append(createCover(book), info);
  card.addEventListener("click", () => onOpen(book));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") onOpen(book);
  });
  return card;
}
