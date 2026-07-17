import { requestResult, STORES, transact } from "./db.js";

export async function listBoxes() {
  let request;
  await transact([STORES.boxes], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.boxes).getAll());
  });
  return (await request).sort((a, b) => a.createdAt - b.createdAt);
}

export function saveBox(box) {
  return transact([STORES.boxes], "readwrite", (tx) => tx.objectStore(STORES.boxes).put(box));
}

export function createBox(name) {
  const now = Date.now();
  const id = globalThis.crypto?.randomUUID?.() || `box-${now}`;
  const box = { id, name: name.trim(), createdAt: now, updatedAt: now };
  return saveBox(box).then(() => box);
}

export function deleteBox(boxId) {
  return transact([STORES.boxes, STORES.books], "readwrite", (tx) => {
    tx.objectStore(STORES.boxes).delete(boxId);
    const books = tx.objectStore(STORES.books);
    books.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      if (cursor.value.boxId === boxId) cursor.update({ ...cursor.value, boxId: null, updatedAt: Date.now() });
      cursor.continue();
    };
  });
}
