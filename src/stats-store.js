import { requestResult, STORES, transact } from "./db.js";

export async function listReadingDays() {
  let request;
  await transact([STORES.days], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.days).getAll());
  });
  return request;
}

export async function addReadingTime(date, milliseconds) {
  let current;
  await transact([STORES.days], "readonly", (tx) => {
    current = requestResult(tx.objectStore(STORES.days).get(date));
  });
  const old = await current;
  const next = { date, milliseconds: (old?.milliseconds || 0) + milliseconds, updatedAt: Date.now() };
  await transact([STORES.days], "readwrite", (tx) => tx.objectStore(STORES.days).put(next));
  return next;
}
