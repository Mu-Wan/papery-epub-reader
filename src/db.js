const DB_NAME = "papery-reader";
const DB_VERSION = 2;
export const STORES = { books: "books", files: "bookFiles", boxes: "boxes", days: "readingDays" };

function normalizeBook(book) {
  const now = Date.now();
  return {
    ...book,
    format: book.format || "epub",
    progress: Number(book.progress) || 0,
    status: book.status || (book.lastRead ? "reading" : "unread"),
    boxId: book.boxId || null,
    finishedAt: book.finishedAt || null,
    finishPrompted: Boolean(book.finishPrompted),
    updatedAt: book.updatedAt || book.lastRead || book.addedAt || now,
  };
}

function migrateBooks(transaction) {
  const books = transaction.objectStore(STORES.books);
  const files = transaction.objectStore(STORES.files);
  books.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    const oldBook = cursor.value;
    const nextBook = normalizeBook(oldBook);
    if (oldBook.data) {
      files.put({ bookId: oldBook.id, data: oldBook.data, locations: "" });
      delete nextBook.data;
    }
    cursor.update(nextBook);
    cursor.continue();
  };
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!database.objectStoreNames.contains(STORES.books)) {
        database.createObjectStore(STORES.books, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STORES.files)) {
        database.createObjectStore(STORES.files, { keyPath: "bookId" });
      }
      if (!database.objectStoreNames.contains(STORES.boxes)) {
        database.createObjectStore(STORES.boxes, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(STORES.days)) {
        database.createObjectStore(STORES.days, { keyPath: "date" });
      }
      if (event.oldVersion === 1) migrateBooks(transaction);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function transact(storeNames, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    let result;
    try {
      result = action(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("数据库操作已取消"));
  });
}

export function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
