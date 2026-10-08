"use client";
import { readingPercent } from "../lib/reading-progress";
import { memo, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen, Check, Menu, MoreHorizontal, Plus, Search, Trash2, X } from "./PaperyIcons";
import { BookArtwork } from "./BookArtwork";
import { SelectionGroup } from "./SelectionGroup";
import { PaperySelect } from "./PaperySelect";
import { CollectionGroup } from "./CollectionGroup";
import { groupLibraryBooks, shelfGroupOptions, shelfSortOptions, type ShelfView } from "../lib/library-groups";

export type LibraryBook = { id: string; title: string; author: string; progress: number; type: "TXT" | "EPUB" | "PDF"; color: string; category: string; last: string; source: string; blob?: Blob; coverDataUrl?: string | null; currentLocation?: string; importedAt?: number; publicationYear?: number; lastReadAt?: number; fileName?: string };
type Props = {
  books: LibraryBook[]; allBooks: LibraryBook[]; recentBooks: LibraryBook[]; selectedBook: LibraryBook | null; loading: boolean;
  search: string; setSearch: (value: string) => void; category: string; categories: string[]; setCategory: (value: string) => void;
  onImport: () => void; onRead: (book: LibraryBook) => void; onReadIntent: (book: LibraryBook) => void; onMenu: () => void;
  bookMenu: string | null; setBookMenu: (value: string | null) => void; onMove: (book: LibraryBook, category: string) => void; onDelete: (book: LibraryBook) => void;
  shelfView: ShelfView; onShelfView: (value: ShelfView) => void; recency: Map<string, number>; onEdit: (book: LibraryBook) => void;
};

export const LibraryView = memo(function LibraryView({ books, allBooks, recentBooks, selectedBook, loading, search, setSearch, category, categories, setCategory, onImport, onRead, onReadIntent, onMenu, bookMenu, setBookMenu, onMove, onDelete, shelfView, onShelfView, recency, onEdit }: Props) {
  const nearby = recentBooks.slice(0, 3);
  const [groupKey, setGroupKey] = useState("全部分组");
  const groups = useMemo(() => groupLibraryBooks(books, shelfView, recency), [books, shelfView, recency]);
  const activeGroup = !search.trim() && groups.some(group => group.key === groupKey) ? groupKey : "全部分组";
  return <div className="page libraryPage">
    <div className="pageHeader">
      <div className="headerTitle"><button className="menuButton" aria-label="打开导航" onClick={onMenu}><Menu size={21}/></button><h1>我的书库</h1><span className="pageCount">{allBooks.length} 本</span></div>
      <div className="headerActions"><label className="searchBox"><Search size={18}/><input type="search" aria-label="搜索书名或作者" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setSearch(""); }} placeholder="搜索书名或作者"/>{!!search && <button className="clearShelfSearch" aria-label="清除书籍搜索" onClick={() => setSearch("")}><X size={16}/></button>}</label><button className="uiButton addBookCard" onClick={onImport} disabled={loading}><Plus size={18}/><span>导入书籍</span></button></div>
    </div>
    {loading ? <div className="librarySkeleton" role="status" aria-label="正在载入书库"><div className="skeleton skeletonHero"/><div className="skeleton skeletonShelf"/><div className="skeleton skeletonBook"/><div className="skeleton skeletonBook"/><div className="skeleton skeletonBook"/></div> : <>
      {selectedBook && !search.trim() && <div className="libraryLead">
        <section className="resumeScene">
          <div className="resumeVisual"><span className="glassLabel"><BookOpen size={14}/>正在读</span><button className="resumeArtworkButton" aria-label={`继续阅读《${selectedBook.title}》`} onPointerEnter={() => onReadIntent(selectedBook)} onFocus={() => onReadIntent(selectedBook)} onTouchStart={() => onReadIntent(selectedBook)} onClick={() => onRead(selectedBook)}><BookArtwork book={selectedBook}/></button><span className="resumeFormat">{selectedBook.type}</span></div>
          <div className="resumeCopy"><div className="resumeIdentity"><h2 title={selectedBook.title}>{selectedBook.title}</h2><p>{selectedBook.author}</p></div><div className="resumeProgressGroup"><div className="resumePosition"><span>{selectedBook.currentLocation ? "阅读位置已保存" : "尚未开始阅读"}</span><strong>{readingPercent(selectedBook.progress)}<small>%</small></strong></div><div className="resumeTrack" role="progressbar" aria-label="当前书籍阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readingPercent(selectedBook.progress)}><i style={{ width: `${selectedBook.progress}%` }}/></div></div><button className="resumeAction" onPointerEnter={() => onReadIntent(selectedBook)} onFocus={() => onReadIntent(selectedBook)} onTouchStart={() => onReadIntent(selectedBook)} onClick={() => onRead(selectedBook)}><span>继续阅读</span><span className="roundIcon"><ArrowUpRight size={20}/></span></button></div>
        </section>
        <aside className="shelfPeek"><div className="widgetHeading"><h2>最近阅读</h2><span>{nearby.length} 本</span></div><div className="peekRows">{nearby.map(book => <button key={book.id} onPointerEnter={() => onReadIntent(book)} onFocus={() => onReadIntent(book)} onTouchStart={() => onReadIntent(book)} onClick={() => onRead(book)}><BookArtwork book={book}/><span><strong>{book.title}</strong><small>{book.author}</small></span><ArrowUpRight size={17}/></button>)}{!nearby.length && <p className="peekEmpty">阅读过的书籍会出现在这里。</p>}</div></aside>
      </div>}
      <section className="sectionBlock"><div className="sectionHeading"><h2 className="sectionMeta" aria-live="polite">{search.trim() ? "搜索结果" : category === "全部" ? "全部藏书" : category}<span>{books.length} 本</span></h2>{!search.trim() && <SelectionGroup className="segmented" label="书籍分类">{["全部", ...categories].map(item => <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={category === item ? "active" : ""}>{item}</button>)}</SelectionGroup>}</div>
        {!!allBooks.length && <div className="shelfOrganize"><PaperySelect label="书架分组方式" value={shelfView.groupBy} options={shelfGroupOptions} onChange={groupBy => { setGroupKey("全部分组"); onShelfView({ ...shelfView, groupBy: groupBy as ShelfView["groupBy"] }); }}/><PaperySelect label="组内书籍排序" value={shelfView.sortBy} options={shelfSortOptions} onChange={sortBy => onShelfView({ ...shelfView, sortBy: sortBy as ShelfView["sortBy"] })}/>{shelfView.groupBy !== "none" && groups.length > 1 && <PaperySelect label="筛选分组" value={activeGroup} options={[{ value: "全部分组", label: `全部分组 · ${groups.length}` }, ...groups.map(group => ({ value: group.key, label: `${group.label} · ${group.books.length} 本` }))]} onChange={setGroupKey}/>}</div>}
        {!allBooks.length && <div className="emptyLibrary"><BookOpen size={36}/><h2>放进第一本书</h2><p>导入 EPUB、PDF 或 TXT，书籍和阅读记录会保存在本机。</p><button className="uiButton primary" onClick={onImport}><Plus size={18}/>选择书籍</button></div>}
        {!!allBooks.length && !books.length && <p className="emptyLibraryHint">没有符合条件的书籍。可以调整分类或搜索词。</p>}
        {groups.filter(group => activeGroup === "全部分组" || group.key === activeGroup).map(group => {
          const grid = <div className="bookGrid">{group.books.map((book, index) => <article className="bookCard" style={{ animationDelay: `${Math.min(index, 3) * 50}ms` }} data-book-menu-root={bookMenu === book.id ? "true" : undefined} key={book.id}>
          <button className="bookOpen" aria-label={`阅读《${book.title}》`} onPointerEnter={() => onReadIntent(book)} onFocus={() => onReadIntent(book)} onTouchStart={() => onReadIntent(book)} onClick={() => onRead(book)}><div className="cover"><BookArtwork book={book}/>{book.coverDataUrl && <span className="typePill">{book.type}</span>}</div><div className="bookInfo"><h3 title={book.title}>{book.title}</h3><p>{book.author}</p><div className="bookProgress"><span><i className={book.progress >= 100 ? "complete" : ""} style={{ width: `${book.progress}%` }}/></span><em>{readingPercent(book.progress)}%</em></div></div></button>
          <button className="moreBook" aria-label={`管理《${book.title}》`} aria-expanded={bookMenu === book.id} onClick={() => setBookMenu(bookMenu === book.id ? null : book.id)}><MoreHorizontal size={18}/></button>
          {bookMenu === book.id && <div className="bookMenu"><button onClick={() => onEdit(book)}><BookOpen size={14}/><span>编辑书籍信息</span></button><small>移动到分类</small>{categories.map(item => <button key={item} className={book.category === item ? "active" : ""} onClick={() => onMove(book, item)}>{book.category === item && <Check size={13}/>}<span>{item}</span></button>)}<button className="deleteBookAction" onClick={() => onDelete(book)}><Trash2 size={14}/><span>删除书籍</span></button></div>}
        </article>)}</div>;
          return shelfView.groupBy === "none" ? <div key="ungrouped">{grid}</div> : <CollectionGroup key={`${shelfView.groupBy}:${group.key}:${search.trim()}`} label={group.label} count={group.books.length} unit="本">{grid}</CollectionGroup>;
        })}
      </section>
    </>}
  </div>;
});
