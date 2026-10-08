export type SyncRecord = { id?: string; key?: string; name?: string; updatedAt?: number; createdAt?: number; started_at?: number; [key: string]: unknown };
export type SyncSnapshot = {
  format: "papery-backup"; version: 1; exportedAt: string;
  books: SyncRecord[]; annotations: SyncRecord[]; settings: SyncRecord[];
  categories: SyncRecord[]; sessions: SyncRecord[];
  tombstones?: Record<string, number>;
};

export function validateSnapshot(value: unknown): asserts value is SyncSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("同步文件格式不正确");
  const v = value as SyncSnapshot;
  if (!v || v.format !== "papery-backup" || v.version !== 1) throw new Error("同步文件格式不正确");
  for (const name of ["books", "annotations", "settings", "categories", "sessions"] as const) {
    if (!Array.isArray(v[name]) || v[name].some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new Error("同步文件内容不完整");
    const key = name === "settings" ? "key" : name === "categories" ? "name" : "id";
    const seen = new Set<string>();
    for (const item of v[name]) {
      if (typeof item[key] !== "string" || !String(item[key]).trim() || seen.has(String(item[key]))) throw new Error("备份记录标识无效或重复");
      seen.add(String(item[key]));
      for (const field of ["updatedAt", "createdAt", "started_at", "importedAt", "lastReadAt"]) if (item[field] !== undefined && (typeof item[field] !== "number" || !Number.isFinite(item[field]) || Number(item[field]) < 0)) throw new Error("备份记录时间无效");
    }
  }
  for(const setting of v.settings)if(setting.key==="category-order"&&(!Array.isArray(setting.value)||setting.value.some(name=>typeof name!=="string"||!name.trim())))throw new Error("备份分类顺序无效");
  for (const setting of v.settings) {
    if (setting.key === "library-view") {
      const view = setting.value as { groupBy?: unknown; sortBy?: unknown } | null;
      if (!view || typeof view !== "object" || Array.isArray(view) || !["none", "author", "title", "published", "imported"].includes(String(view.groupBy)) || !["recent", "title", "author", "imported", "published"].includes(String(view.sortBy))) throw new Error("备份书架分组无效");
    }
    if (setting.key === "notes-view") {
      const view = setting.value as { groupBy?: unknown } | null;
      if (!view || typeof view !== "object" || Array.isArray(view) || !["time", "book", "author", "kind"].includes(String(view.groupBy))) throw new Error("备份笔记分组无效");
    }
  }
  for (const book of v.books) {
    if (book.publicationYear !== undefined && (typeof book.publicationYear !== "number" || !Number.isInteger(book.publicationYear) || book.publicationYear < 1000 || book.publicationYear > 9999)) throw new Error("备份出版年份无效");
    if (book.fileName !== undefined && typeof book.fileName !== "string") throw new Error("备份书籍文件名无效");
    if (book.metadataVersion !== undefined && (typeof book.metadataVersion !== "number" || !Number.isInteger(book.metadataVersion) || book.metadataVersion < 0)) throw new Error("备份书籍信息版本无效");
    if (book.metadataEdited !== undefined && typeof book.metadataEdited !== "boolean") throw new Error("备份书籍信息标记无效");
  }
  if (v.tombstones !== undefined) {
    if (!v.tombstones || typeof v.tombstones !== "object" || Array.isArray(v.tombstones)) throw new Error("同步删除记录无效");
    for (const [key,time] of Object.entries(v.tombstones)) {
      if (!/^(books|annotations|categories):.+/.test(key)) throw new Error("同步删除记录无效");
      if (typeof time !== "number" || !Number.isFinite(time) || time < 0) throw new Error("同步删除记录无效");
    }
  }
  for (const book of v.books) if (typeof book.blob !== "string" || !/^data:[^,]*;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(book.blob) || !["TXT", "EPUB", "PDF"].includes(String(book.format))) throw new Error("同步书籍数据无效");
  for (const note of v.annotations) if (typeof note.bookId !== "string" || !note.bookId) throw new Error("备份笔记关联无效");
  for (const session of v.sessions) if (typeof session.book_id !== "string" || !session.book_id || typeof session.duration_seconds !== "number" || !Number.isFinite(session.duration_seconds) || session.duration_seconds < 0) throw new Error("备份阅读记录无效");
}

export const portableSetting = (key: string) => key === "app" || key === "category-order" || key === "last-read-book-id" || key === "library-view" || key === "notes-view" || key.startsWith("reader:");

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
      // Only portable reader preferences and the reader profile belong in cross-device sync.
      // Cached analysis, cover extraction and OAuth/device settings are regenerated or local-only.
      if (collection === "settings" && !portableSetting(key)) continue;
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
