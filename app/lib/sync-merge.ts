export type SyncRecord = { id?: string; key?: string; name?: string; updatedAt?: number; createdAt?: number; started_at?: number; [key: string]: unknown };
export type SyncSnapshot = {
  format: "papery-backup"; version: 1; exportedAt: string;
  books: SyncRecord[]; annotations: SyncRecord[]; settings: SyncRecord[];
  categories: SyncRecord[]; sessions: SyncRecord[];
  tombstones?: Record<string, number>;
};

export function validateSnapshot(value: unknown): asserts value is SyncSnapshot {
  const v = value as SyncSnapshot;
  if (!v || v.format !== "papery-backup" || v.version !== 1) throw new Error("同步文件格式不正确");
  for (const name of ["books", "annotations", "settings", "categories", "sessions"] as const) {
    if (!Array.isArray(v[name]) || v[name].some(item => !item || typeof item !== "object")) throw new Error("同步文件内容不完整");
  }
  for (const book of v.books) if (typeof book.id !== "string" || typeof book.blob !== "string" || !/^data:[^,]*;base64,/.test(book.blob) || !["TXT", "EPUB", "PDF"].includes(String(book.format))) throw new Error("同步书籍数据无效");
}

const stamp = (item: SyncRecord) => Number(item.updatedAt || item.createdAt || item.started_at || 0);
/** Deterministic last-edit-wins. Progress may move backwards; tombstones prevent resurrection. */
export function mergeSnapshots(snapshots: SyncSnapshot[]): SyncSnapshot {
  const tombstones: Record<string, number> = {};
  for (const snapshot of snapshots) {
    validateSnapshot(snapshot);
    for (const [key, time] of Object.entries(snapshot.tombstones || {})) tombstones[key] = Math.max(tombstones[key] || 0, time);
  }
  const merge = (collection: "books" | "annotations" | "settings" | "categories" | "sessions", keyName: string) => {
    const items = new Map<string, SyncRecord>();
    for (const snapshot of snapshots) for (const item of snapshot[collection]) {
      const key = String(item[keyName] || "");
      if (!key || (tombstones[`${collection}:${key}`] || -1) >= stamp(item)) continue;
      // Tokens, sync configuration, transient analysis and device preferences never leave this device.
      if (collection === "settings" && !key.startsWith("reader:")) continue;
      const previous = items.get(key);
      if (!previous || stamp(item) > stamp(previous) || (stamp(item) === stamp(previous) && JSON.stringify(item) > JSON.stringify(previous))) items.set(key, item);
    }
    return [...items.values()].sort((a,b) => String(a[keyName]).localeCompare(String(b[keyName])));
  };
  const books = merge("books", "id"), bookIds = new Set(books.map(book => book.id));
  return { format:"papery-backup", version:1, exportedAt:new Date().toISOString(), books,
    annotations:merge("annotations", "id").filter(item => bookIds.has(String(item.bookId))),
    settings:merge("settings", "key"), categories:merge("categories", "name"), sessions:merge("sessions", "id"), tombstones };
}
