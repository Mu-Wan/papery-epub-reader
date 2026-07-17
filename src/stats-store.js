import { requestResult, STORES, transact } from "./db.js";

const MIRROR_KEY = "papery.reading-days.v1";

function readMirror() {
  try { return JSON.parse(localStorage.getItem(MIRROR_KEY)) || []; } catch { return []; }
}

export function replaceReadingMirror(days) {
  localStorage.setItem(MIRROR_KEY, JSON.stringify(days));
}

function mergeDays(primary, secondary) {
  const merged = new Map(primary.map((item) => [item.date, item]));
  secondary.forEach((item) => {
    const old = merged.get(item.date);
    if (!old || item.milliseconds > old.milliseconds) merged.set(item.date, item);
  });
  return [...merged.values()];
}

export async function listReadingDays() {
  let request;
  await transact([STORES.days], "readonly", (tx) => {
    request = requestResult(tx.objectStore(STORES.days).getAll());
  });
  const merged = mergeDays(await request, readMirror());
  replaceReadingMirror(merged);
  return merged;
}

export function stageReadingTime(date, milliseconds) {
  const mirrored = readMirror().find((item) => item.date === date);
  const optimistic = { date, milliseconds: (mirrored?.milliseconds || 0) + milliseconds, updatedAt: Date.now() };
  replaceReadingMirror(mergeDays(readMirror(), [optimistic]));
  return optimistic;
}

export async function syncReadingTime(date) {
  const mirrored = readMirror().find((item) => item.date === date);
  if (!mirrored) return null;
  let current;
  await transact([STORES.days], "readonly", (tx) => {
    current = requestResult(tx.objectStore(STORES.days).get(date));
  });
  const old = await current;
  const next = old?.milliseconds > mirrored.milliseconds ? old : mirrored;
  await transact([STORES.days], "readwrite", (tx) => tx.objectStore(STORES.days).put(next));
  replaceReadingMirror(mergeDays(readMirror(), [next]));
  return next;
}

export async function addReadingTime(date, milliseconds) {
  stageReadingTime(date, milliseconds);
  return syncReadingTime(date);
}
