"use client";
import { memo, useMemo, useState } from "react";
import { BookMarked, Bookmark, Highlighter, Menu, PenLine, Search, Trash2, Underline } from "./PaperyIcons";
import type { ReaderAnnotation } from "../lib/reader-types";
import type { LibraryBook } from "./LibraryView";
import { BookArtwork } from "./BookArtwork";
import { SelectionGroup } from "./SelectionGroup";

export const NotesView = memo(function NotesView({ annotations, books, onMenu, onOpen, onEdit, onDelete }: { annotations: ReaderAnnotation[]; books: LibraryBook[]; onMenu: () => void; onOpen: (note: ReaderAnnotation) => void; onEdit: (note: ReaderAnnotation) => void; onDelete: (note: ReaderAnnotation) => void }) {
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState("全部");
  const filtered = useMemo(() => annotations.filter(note => (bookId === "全部" || note.bookId === bookId) && `${note.quote}${note.note}`.toLowerCase().includes(query.toLowerCase())), [annotations, bookId, query]);
  const counts = useMemo(() => { const result: Record<string, number> = {}; for (const note of annotations) result[note.bookId] = (result[note.bookId] || 0) + 1; return result; }, [annotations]);
  return <div className="page simplePage notesPage"><div className="pageHeader"><div className="headerTitle"><button className="menuButton" aria-label="打开导航" onClick={onMenu}><Menu size={21}/></button><h1>标记与笔记</h1><span className="pageCount">{annotations.length} 条</span></div></div>
    <div className="notesLayout"><aside className="noteBooks"><h2>按书籍查看</h2><SelectionGroup className="noteBookChoices" label="按书籍筛选"><button aria-pressed={bookId === "全部"} className={bookId === "全部" ? "active" : ""} onClick={() => setBookId("全部")}><span className="miniCover all"><BookMarked size={18}/></span><span><strong>全部书籍</strong><small>{annotations.length} 条记录</small></span></button>{books.map(book => <button aria-pressed={bookId === book.id} className={bookId === book.id ? "active" : ""} key={book.id} onClick={() => setBookId(book.id)}><BookArtwork className="miniCover" book={book}/><span><strong>{book.title}</strong><small>{counts[book.id] || 0} 条记录</small></span></button>)}</SelectionGroup></aside>
      <section className="noteList"><div className="noteToolbar"><label className="searchBox"><Search size={17}/><input aria-label="搜索笔记内容" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索笔记内容"/></label><select className="noteBookSelect" aria-label="筛选笔记书籍" value={bookId} onChange={event => setBookId(event.target.value)}><option value="全部">全部书籍</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select><span>{filtered.length} 条</span></div>
        {filtered.map((note, index) => <article className="noteCard" key={note.id} style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }}><button className="noteOpen" aria-label={`返回标注位置：${note.quote || note.chapterTitle}`} onClick={() => onOpen(note)}><span className="noteKind">{note.style === "bookmark" ? <Bookmark size={17}/> : note.style === "underline" ? <Underline size={17}/> : <Highlighter size={17}/>}</span><span className="noteContent"><span className="noteQuote">{note.quote || note.chapterTitle}</span>{note.note && <span className="noteBody">{note.note}</span>}</span></button><footer><span>{books.find(book => book.id === note.bookId)?.title} · {note.chapterTitle} · {Math.round(note.progress)}%</span><time>{new Date(note.updatedAt).toLocaleDateString("zh-CN")}</time><button aria-label="编辑笔记" onClick={() => onEdit(note)}><PenLine size={16}/></button><button aria-label="删除笔记" className="danger" onClick={() => onDelete(note)}><Trash2 size={16}/></button></footer></article>)}
        {!filtered.length && <div className="emptyNotes"><BookMarked size={32}/><strong>{annotations.length ? "没有找到相关笔记" : "还没有笔记"}</strong><span>{annotations.length ? "试试其他关键词或书籍。" : "阅读时选中文字，即可添加高亮、下划线与笔记。"}</span></div>}
      </section>
    </div>
  </div>;
});
