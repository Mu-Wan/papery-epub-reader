import { pinyin } from "pinyin-pro";

export type ShelfGrouping = "none" | "author" | "title" | "published" | "imported";
export type ShelfSort = "recent" | "title" | "author" | "imported" | "published";
export type ShelfView = { groupBy: ShelfGrouping; sortBy: ShelfSort };
export const defaultShelfView: ShelfView = { groupBy: "none", sortBy: "recent" };
export const shelfGroupOptions = [
  { value: "none", label: "不分组" }, { value: "author", label: "按作者分组" },
  { value: "title", label: "按书名 A–Z" }, { value: "published", label: "按出版年份" }, { value: "imported", label: "按导入年份" },
];
export const shelfSortOptions = [
  { value: "recent", label: "最近阅读优先" }, { value: "title", label: "书名 A–Z" },
  { value: "author", label: "作者 A–Z" }, { value: "imported", label: "最近导入优先" }, { value: "published", label: "出版年份从新到旧" },
];
export function normalizeShelfView(value?: Partial<ShelfView> | null): ShelfView {
  return { groupBy: shelfGroupOptions.some(option => option.value === value?.groupBy) ? value!.groupBy! : "none",
    sortBy: shelfSortOptions.some(option => option.value === value?.sortBy) ? value!.sortBy! : "recent" };
}
type GroupableBook = { id: string; title: string; author: string; progress: number; currentLocation?: string; lastReadAt?: number; importedAt?: number; publicationYear?: number };
const collator = new Intl.Collator("zh-CN-u-co-pinyin", { numeric: true, sensitivity: "base" });
export const compareBookText = (a: string, b: string) => collator.compare(a, b);
const searchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[《》〈〉“”"'‘’]/g, "");
export function bookMatchesSearch(book: Pick<GroupableBook, "title" | "author">, query: string) {
  const text = searchText(`${book.title} ${book.author}`).replace(/\s+/g, "");
  return searchText(query).trim().split(/\s+/).filter(Boolean).every(term => text.includes(term));
}

export function titleInitial(title: string) {
  const normalized = title.normalize("NFKC").replace(/^[\s\p{P}\p{S}]+/u, "");
  const first = pinyin(normalized, { pattern: "first", toneType: "none", type: "array" })[0]?.toUpperCase() || "";
  return /^[A-Z]/.test(first) ? first[0] : /^\d/.test(first) ? "0–9" : "其他";
}

export function readingRecency(books: GroupableBook[], sessions: { book_id: string; started_at: number }[], lastReadId?: string | null) {
  const latest = new Map<string, number>();
  for (const session of sessions) if (Number.isFinite(session.started_at) && session.started_at > 0) latest.set(session.book_id, Math.max(latest.get(session.book_id) || 0, session.started_at));
  for (const book of books) {
    if (Number.isFinite(book.lastReadAt) && book.lastReadAt! > 0) latest.set(book.id, Math.max(latest.get(book.id) || 0, book.lastReadAt!));
    // Existing libraries can contain locators and progress without any session.
    if (!latest.has(book.id) && (book.currentLocation || book.progress > 0 || book.id === lastReadId)) latest.set(book.id, 1);
  }
  return latest;
}
export function recentLibraryBooks<T extends GroupableBook>(books: T[], recency: Map<string, number>) {
  return books.filter(book => recency.has(book.id)).sort((a, b) => (recency.get(b.id) || 0) - (recency.get(a.id) || 0) || compareBookText(a.title, b.title));
}

export function groupLibraryBooks<T extends GroupableBook>(books: T[], view: ShelfView, recency = new Map<string, number>()) {
  const sorted = [...books].sort((a, b) => {
    const tie = () => compareBookText(a.title, b.title) || a.id.localeCompare(b.id);
    switch (view.sortBy) {
      case "author": return compareBookText(a.author, b.author) || tie();
      case "imported": return (b.importedAt || 0) - (a.importedAt || 0) || tie();
      case "published": return (b.publicationYear || 0) - (a.publicationYear || 0) || tie();
      case "recent": return (recency.get(b.id) || 0) - (recency.get(a.id) || 0) || (b.importedAt || 0) - (a.importedAt || 0) || tie();
      default: return tie();
    }
  });
  const groups = new Map<string, { key: string; label: string; books: T[] }>();
  for (const book of sorted) {
    const year = view.groupBy === "published" ? book.publicationYear : book.importedAt ? new Date(book.importedAt).getFullYear() : undefined;
    const label = view.groupBy === "author" ? book.author.trim() || "未知作者" : view.groupBy === "title" ? titleInitial(book.title)
      : view.groupBy === "published" || view.groupBy === "imported" ? year ? `${year} 年` : "年份未记录" : "全部藏书";
    const group = groups.get(label) || { key: label, label, books: [] };
    group.books.push(book); groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => {
    const unknown = (label: string) => ["未知作者", "年份未记录", "其他"].includes(label);
    if (unknown(a.label) !== unknown(b.label)) return unknown(a.label) ? 1 : -1;
    return view.groupBy === "published" || view.groupBy === "imported" ? compareBookText(b.label, a.label) : compareBookText(a.label, b.label);
  });
}
