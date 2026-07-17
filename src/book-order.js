import { updateBook } from "./book-store.js";

export function reorderBooks(bookIds) {
  return Promise.all(bookIds.map((id, index) => updateBook(id, { sortOrder: index })));
}

export function moveBookToBox(bookId, boxId, books) {
  const orders = books.filter((book) => book.boxId === boxId && Number.isFinite(book.sortOrder))
    .map((book) => book.sortOrder);
  const sortOrder = orders.length ? Math.max(...orders) + 1 : 0;
  return updateBook(bookId, { boxId, sortOrder });
}
