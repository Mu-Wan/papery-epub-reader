import type { ReaderAnnotation } from "./reader-types";

export type TimelineNote = {
  note: ReaderAnnotation; timestamp: number; year: number; month: number;
  monthKey: string; searchText: string;
};
export type NotesMonth = { key: string; year: number; month: number; notes: TimelineNote[] };

export function indexTimelineNotes(annotations: ReaderAnnotation[]): TimelineNote[] {
  return annotations.map(note => {
    const timestamp = Number.isFinite(note.createdAt) && note.createdAt > 0 ? note.createdAt : note.updatedAt;
    const date = new Date(timestamp);
    const valid = Number.isFinite(date.getTime());
    const year = valid ? date.getFullYear() : 0, month = valid ? date.getMonth() + 1 : 0;
    return { note, timestamp: valid ? timestamp : 0, year, month,
      monthKey: valid ? `${year}-${String(month).padStart(2, "0")}` : "unknown",
      searchText: `${note.quote}${note.note}`.toLowerCase() };
  }).sort((a, b) => b.timestamp - a.timestamp || b.note.updatedAt - a.note.updatedAt);
}

export function groupTimelineNotes(notes: TimelineNote[]) {
  const groups = new Map<string, NotesMonth>();
  for (const item of notes) {
    let group = groups.get(item.monthKey);
    if (!group) { group = { key: item.monthKey, year: item.year, month: item.month, notes: [] }; groups.set(item.monthKey, group); }
    group.notes.push(item);
  }
  return [...groups.values()];
}
