import { openDatabase, STORES } from "./db.js";

const names = Object.values(STORES);

export async function readSnapshot() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(names, "readonly");
    const result = {};
    names.forEach((name) => {
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => { result[name] = request.result; };
    });
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function newer(local, incoming) {
  if (!local) return incoming;
  return (incoming.updatedAt || 0) > (local.updatedAt || 0) ? incoming : local;
}

function mergedSnapshot(local, incoming) {
  const books = new Map(local.books.map((item) => [item.id, item]));
  incoming.books.forEach((item) => books.set(item.id, newer(books.get(item.id), item)));
  const boxes = new Map(local.boxes.map((item) => [item.id, item]));
  incoming.boxes.forEach((item) => boxes.set(item.id, newer(boxes.get(item.id), item)));
  const days = new Map(local.readingDays.map((item) => [item.date, item]));
  incoming.readingDays.forEach((item) => {
    const old = days.get(item.date);
    days.set(item.date, !old || item.milliseconds > old.milliseconds ? item : old);
  });
  const files = new Map(local.bookFiles.map((item) => [item.bookId, item]));
  incoming.bookFiles.forEach((item) => {
    const incomingBook = incoming.books.find((book) => book.id === item.bookId);
    const localBook = local.books.find((book) => book.id === item.bookId);
    if (!files.has(item.bookId) || (incomingBook?.updatedAt || 0) > (localBook?.updatedAt || 0)) files.set(item.bookId, item);
  });
  return { books: [...books.values()], boxes: [...boxes.values()], readingDays: [...days.values()], bookFiles: [...files.values()] };
}

export async function restoreSnapshot(incoming, overwrite = false) {
  const snapshot = overwrite ? incoming : mergedSnapshot(await readSnapshot(), incoming);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(names, "readwrite");
    const source = { books: snapshot.books, bookFiles: snapshot.bookFiles, boxes: snapshot.boxes, readingDays: snapshot.readingDays };
    names.forEach((name) => {
      const store = transaction.objectStore(name);
      store.clear();
      source[name].forEach((item) => store.put(item));
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
