import { requestResult, STORES, transact } from "./db.js";

const sorted = (books) => books.sort((a, b) => (b.lastRead || b.addedAt) - (a.lastRead || a.addedAt));

export async function listBooks() {
  let request;
  await transact([STORES.books], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.books).getAll());
  });
  return sorted(await request);
}

export async function getBook(id) {
  let request;
  await transact([STORES.books], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.books).get(id));
  });
  return request;
}

export function saveBook(book) {
  const nextBook = { ...book, updatedAt: book.updatedAt || Date.now() };
  return transact([STORES.books], "readwrite", (tx) => tx.objectStore(STORES.books).put(nextBook));
}

export function saveImportedBook(book, data) {
  return transact([STORES.books, STORES.files], "readwrite", (tx) => {
    tx.objectStore(STORES.books).put(book);
    tx.objectStore(STORES.files).put({ bookId: book.id, data, locations: "" });
  });
}

export async function getBookFile(bookId) {
  let request;
  await transact([STORES.files], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.files).get(bookId));
  });
  return request;
}

export function saveBookLocations(bookId, locations) {
  return transact([STORES.files], "readwrite", (tx) => {
    const store = tx.objectStore(STORES.files);
    const request = store.get(bookId);
    request.onsuccess = () => store.put({ ...request.result, bookId, locations });
  });
}

export function deleteBook(id) {
  return transact([STORES.books, STORES.files], "readwrite", (tx) => {
    tx.objectStore(STORES.books).delete(id);
    tx.objectStore(STORES.files).delete(id);
  });
}

export async function updateBook(id, changes) {
  const book = await getBook(id);
  if (!book) return null;
  const nextBook = { ...book, ...changes, updatedAt: Date.now() };
  await saveBook(nextBook);
  return nextBook;
}
