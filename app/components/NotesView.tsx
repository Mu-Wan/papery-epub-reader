"use client";
import { PaperySelect } from "./PaperySelect";
import { readingPercent } from "../lib/reading-progress";
import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { BookMarked, Bookmark, Highlighter, Menu, PenLine, Search, Trash2, Underline } from "./PaperyIcons";
import type { ReaderAnnotation } from "../lib/reader-types";
import { groupTimelineNotes, indexTimelineNotes } from "../lib/notes-timeline";
import type { LibraryBook } from "./LibraryView";
import { BookArtwork } from "./BookArtwork";
import { SelectionGroup } from "./SelectionGroup";
import { CollectionGroup } from "./CollectionGroup";
import { groupCollectionNotes, normalizeNoteGrouping, noteGroupOptions, type NoteGrouping } from "../lib/note-groups";
import { loadSetting, saveSetting } from "../lib/local-library";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });
type NoteAction = (note: ReaderAnnotation) => void;
const NoteEntry = memo(function NoteEntry({ note, timestamp, bookTitle, onOpen, onEdit, onDelete }: {
  note: ReaderAnnotation; timestamp: number; bookTitle: string;
  onOpen: NoteAction; onEdit: NoteAction; onDelete: NoteAction;
}) {
  return <article className="noteCard">
    <button className="noteOpen" aria-label={`返回标注位置：${note.quote || note.chapterTitle}`} onClick={() => onOpen(note)}>
      <span className="noteKind">{note.style === "bookmark" ? <Bookmark size={17}/> : note.style === "underline" ? <Underline size={17}/> : <Highlighter size={17}/>}</span>
      <span className="noteContent"><span className="noteQuote">{note.quote || note.chapterTitle}</span>{note.note && <span className="noteBody">{note.note}</span>}</span>
    </button>
    <footer><span>{[bookTitle, note.chapterTitle, `${readingPercent(note.progress)}%`].filter(Boolean).join(" · ")}</span>
      <time dateTime={timestamp ? new Date(timestamp).toISOString() : undefined}>{timestamp ? dateFormatter.format(timestamp) : "日期未记录"}</time>
      <button aria-label="编辑笔记" onClick={() => onEdit(note)}><PenLine size={16}/></button>
      <button aria-label="删除笔记" className="danger" onClick={() => onDelete(note)}><Trash2 size={16}/></button>
    </footer>
  </article>;
});

export const NotesView = memo(function NotesView({ annotations, books, onMenu, onOpen, onEdit, onDelete }: {
  annotations: ReaderAnnotation[]; books: LibraryBook[]; onMenu: () => void;
  onOpen: NoteAction; onEdit: NoteAction; onDelete: NoteAction;
}) {
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState("全部");
  const [monthKey, setMonthKey] = useState("全部");
  const [groupBy, setGroupBy] = useState<NoteGrouping>("time"), [groupKey, setGroupKey] = useState("全部分组");
  const [preferenceError, setPreferenceError] = useState("");
  useEffect(() => { let active = true; void loadSetting<{ groupBy?: NoteGrouping }>("notes-view").then(value => { if (active) setGroupBy(normalizeNoteGrouping(value?.groupBy)); }).catch(() => {}); return () => { active = false; }; }, []);
  const search = useDeferredValue(query.trim().normalize("NFKC").toLowerCase());
  const indexed = useMemo(() => indexTimelineNotes(annotations), [annotations]);
  const counts = useMemo(() => { const result = new Map<string, number>(); for (const note of annotations) result.set(note.bookId, (result.get(note.bookId) || 0) + 1); return result; }, [annotations]);
  const titles = useMemo(() => new Map(books.map(book => [book.id, book.title])), [books]);
  const bookMap = useMemo(() => new Map(books.map(book => [book.id, book])), [books]);
  const notedBooks = useMemo(() => books.filter(book => counts.has(book.id)), [books, counts]);
  const selectedBookId = bookId === "全部" || counts.has(bookId) ? bookId : "全部";
  const bookNotes = useMemo(() => indexed.filter(item => selectedBookId === "全部" || item.note.bookId === selectedBookId), [indexed, selectedBookId]);
  const months = useMemo(() => groupTimelineNotes(bookNotes), [bookNotes]);
  const selectedMonth = months.some(month => month.key === monthKey) ? monthKey : "全部";
  const filtered = useMemo(() => bookNotes.filter(item => { const book = bookMap.get(item.note.bookId); const text = `${item.searchText} ${item.note.chapterTitle} ${book?.title || ""} ${book?.author || ""}`.normalize("NFKC").toLowerCase(); return (selectedMonth === "全部" || item.monthKey === selectedMonth) && search.split(/\s+/).every(term => text.includes(term)); }), [bookNotes, selectedMonth, search, bookMap]);
  const collectionGroups = useMemo(() => groupBy === "time" ? [] : groupCollectionNotes(filtered, books, groupBy), [filtered, books, groupBy]);
  const selectedGroup = !search && collectionGroups.some(group => group.key === groupKey) ? groupKey : "全部分组";
  const years = useMemo(() => {
    const groups = new Map<number, ReturnType<typeof groupTimelineNotes>>();
    for (const month of groupTimelineNotes(filtered)) { const group = groups.get(month.year) || []; group.push(month); groups.set(month.year, group); }
    return [...groups].map(([year, months]) => ({ year, months }));
  }, [filtered]);

  return <div className="page simplePage notesPage">
    <div className="pageHeader"><div className="headerTitle"><button className="menuButton" aria-label="打开导航" onClick={onMenu}><Menu size={21}/></button><h1>标记与笔记</h1><span className="pageCount">{annotations.length} 条</span></div></div>
    <div className="notesLayout">
      <aside className="noteBooks"><h2>按书籍查看</h2><SelectionGroup className="noteBookChoices" label="按书籍筛选">
        <button aria-pressed={selectedBookId === "全部"} className={selectedBookId === "全部" ? "active" : ""} onClick={() => { setBookId("全部"); setMonthKey("全部"); setGroupKey("全部分组"); }}><span className="miniCover all"><BookMarked size={18}/></span><span><strong>全部书籍</strong><small>{annotations.length} 条记录</small></span></button>
        {notedBooks.map(book => <button aria-pressed={selectedBookId === book.id} className={selectedBookId === book.id ? "active" : ""} key={book.id} onClick={() => { setBookId(book.id); setMonthKey("全部"); setGroupKey("全部分组"); }}><BookArtwork className="miniCover" book={book}/><span><strong>{book.title}</strong><small>{counts.get(book.id) || 0} 条记录</small></span></button>)}
      </SelectionGroup></aside>
      <section className="noteList" aria-label="笔记列表">
        <div className="noteToolbar"><label className="searchBox"><Search size={17}/><input type="search" aria-label="搜索笔记、书名或作者" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索笔记、书名或作者"/></label>
          <PaperySelect className="noteBookSelect" label="筛选笔记书籍" value={selectedBookId} onChange={next=>{setBookId(next);setMonthKey("全部");setGroupKey("全部分组")}} options={[{value:"全部",label:"全部书籍"},...notedBooks.map(book=>({value:book.id,label:book.title}))]}/>
          <PaperySelect className="noteMonthSelect" label="按年月筛选笔记" value={selectedMonth} onChange={setMonthKey} options={[{value:"全部",label:"全部时间"},...months.map(month=>({value:month.key,label:month.year?`${month.year} 年 ${month.month} 月`:"日期未记录"}))]}/>
          <span aria-live="polite">{filtered.length} 条</span>
        </div>
        <div className="noteOrganize"><PaperySelect label="笔记分组方式" value={groupBy} options={noteGroupOptions} onChange={value => { const next = normalizeNoteGrouping(value); setGroupBy(next); setGroupKey("全部分组"); setPreferenceError(""); void saveSetting("notes-view", { groupBy: next }).catch(() => setPreferenceError("分组偏好保存失败，请重试。")); }}/>{collectionGroups.length > 1 && <PaperySelect label="筛选笔记分组" value={selectedGroup} options={[{ value: "全部分组", label: `全部分组 · ${collectionGroups.length}` }, ...collectionGroups.map(group => ({ value: group.key, label: `${group.label} · ${group.notes.length} 条` }))]} onChange={setGroupKey}/>}</div>
        {preferenceError && <p role="status">{preferenceError}</p>}
        <div className={`notesTimeline ${groupBy !== "time" ? "notesCollection" : ""}`} aria-busy={query.trim().normalize("NFKC").toLowerCase() !== search}>
          {groupBy === "time" ? years.map(({ year, months }) => <section className="noteYear" key={year} aria-label={year ? `${year} 年笔记` : "日期未记录的笔记"}>
            <h2 className="noteYearLabel">{year || "未记日期"}{year > 0 && <small>年</small>}</h2>
            <div className="noteYearContent">{months.map(month => <section className="noteMonth" key={month.key} aria-label={month.year ? `${month.month} 月笔记` : "未记日期"}>
              <h3 className="noteMonthHeading"><span>{month.year ? `${month.month} 月` : "未记日期"}</span><small>{month.notes.length} 条</small></h3>
              {month.notes.map(({ note, timestamp }) => <NoteEntry key={note.id} note={note} timestamp={timestamp} bookTitle={titles.get(note.bookId) || ""} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete}/>)}
            </section>)}</div>
          </section>) : collectionGroups.filter(group => selectedGroup === "全部分组" || group.key === selectedGroup).map(group => <CollectionGroup key={`${groupBy}:${group.key}:${search}`} label={group.label} count={group.notes.length} unit="条">{group.notes.map(({ note, timestamp }) => <NoteEntry key={note.id} note={note} timestamp={timestamp} bookTitle={titles.get(note.bookId) || ""} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete}/>)}</CollectionGroup>)}
        </div>
        {!filtered.length && <div className="emptyNotes"><BookMarked size={32}/><strong>{annotations.length ? "没有找到相关笔记" : "还没有笔记"}</strong><span>{annotations.length ? "试试其他关键词、书籍或月份。" : "阅读时选中文字，即可添加高亮、下划线与笔记。"}</span></div>}
      </section>
    </div>
  </div>;
});
