const COLORS = ["#385c52", "#735d4b", "#4f5c78", "#7c4f51", "#646046", "#4e6670"];

function coverColor(title) {
  const code = [...title].reduce((sum, char) => sum + char.codePointAt(0), 0);
  return COLORS[code % COLORS.length];
}

function createCard(book, onOpen, onDelete) {
  const card = document.createElement("article");
  card.className = "book-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `阅读《${book.title}》`);
  const cover = document.createElement("div");
  cover.className = "book-cover";
  cover.style.background = coverColor(book.title);
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
  const info = document.createElement("div");
  info.className = "book-info";
  const heading = document.createElement("h3");
  heading.textContent = book.title;
  const author = document.createElement("p");
  author.textContent = book.author;
  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.title = "从书架移除";
  remove.textContent = "×";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    onDelete(book);
  });
  info.append(heading, author, remove);
  card.append(cover, info);
  card.addEventListener("click", () => onOpen(book));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") onOpen(book);
  });
  return card;
}

export function renderLibrary(books, onOpen, onDelete) {
  const grid = document.querySelector("#bookGrid");
  const empty = document.querySelector("#emptyState");
  document.querySelector("#bookCount").textContent = `${books.length} 本`;
  grid.replaceChildren(...books.map((book) => createCard(book, onOpen, onDelete)));
  grid.hidden = books.length === 0;
  empty.hidden = books.length > 0;
}
