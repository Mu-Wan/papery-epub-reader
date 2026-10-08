import type { ReaderAnnotation } from "./reader-types";
import type { TimelineNote } from "./notes-timeline";
export type NoteGrouping = "time" | "book" | "author" | "kind";
export const noteGroupOptions = [
  { value: "time", label: "按时间分组" }, { value: "book", label: "按书籍分组" },
  { value: "author", label: "按作者分组" }, { value: "kind", label: "按标记类型分组" },
];
export function normalizeNoteGrouping(value: unknown): NoteGrouping {
  return noteGroupOptions.some(option => option.value === value) ? value as NoteGrouping : "time";
}
type NoteBook = { id: string; title: string; author: string };
const kindNames: Record<ReaderAnnotation["style"], string> = { highlight: "高亮", underline: "下划线", bookmark: "书签" };
const collator = new Intl.Collator("zh-CN-u-co-pinyin", { numeric: true, sensitivity: "base" });
export function groupCollectionNotes(notes: TimelineNote[], books: NoteBook[], by: Exclude<NoteGrouping, "time">) {
  const bookMap = new Map(books.map(book => [book.id, book]));
  const groups = new Map<string, { key: string; label: string; notes: TimelineNote[] }>();
  for (const item of notes) {
    const book = bookMap.get(item.note.bookId);
    const label = by === "book" ? book?.title || "书籍未记录" : by === "author" ? book?.author.trim() || "未知作者" : kindNames[item.note.style];
    const key = by === "book" ? item.note.bookId : by === "kind" ? item.note.style : label;
    const group = groups.get(key) || { key, label, notes: [] }; group.notes.push(item); groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    const unknown = (label: string) => ["未知作者", "书籍未记录"].includes(label);
    if (unknown(a.label) !== unknown(b.label)) return unknown(a.label) ? 1 : -1;
    return collator.compare(a.label, b.label) || a.key.localeCompare(b.key);
  });
}
