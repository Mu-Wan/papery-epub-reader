const DB_NAME = "papery-reader";
const STORE_NAME = "books";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export const listBooks = async () => {
  const books = await run("readonly", (store) => store.getAll());
  return books.sort((a, b) => (b.lastRead || b.addedAt) - (a.lastRead || a.addedAt));
};

export const getBook = (id) => run("readonly", (store) => store.get(id));
export const saveBook = (book) => run("readwrite", (store) => store.put(book));
export const deleteBook = (id) => run("readwrite", (store) => store.delete(id));
