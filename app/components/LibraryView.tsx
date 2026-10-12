"use client";
import { readingPercent } from "../lib/reading-progress";
import { memo, useMemo } from "react";
import { Menu, Plus, Search, X } from "./PaperyIcons";
import { BookArtwork } from "./BookArtwork";
import { EmptyLibrary } from "./EmptyLibrary";
import { BookSpineShelf } from "./BookSpineShelf";
import { SelectionGroup } from "./SelectionGroup";
import { PaperySelect } from "./PaperySelect";
import { orderedShelfBooks, shelfSortOptions, type ShelfView } from "../lib/library-groups";

export type LibraryBook = { id: string; title: string; author: string; progress: number; type: "TXT" | "EPUB" | "PDF"; color: string; category: string; last: string; source: string; blob?: Blob; coverDataUrl?: string | null; hasCover?: boolean; currentLocation?: string; importedAt?: number; publicationYear?: number; lastReadAt?: number; fileName?: string };
type Props = {
  books: LibraryBook[]; allBooks: LibraryBook[]; recentBooks: LibraryBook[]; selectedBook: LibraryBook | null; loading: boolean; mobile: boolean;
  search: string; setSearch: (value: string) => void; category: string; categories: string[]; setCategory: (value: string) => void;
  onImport: () => void; onRead: (book: LibraryBook) => void; onReadIntent: (book: LibraryBook) => void; onMenu: () => void;
  bookMenu: string | null; setBookMenu: (value: string | null) => void; onMove: (book: LibraryBook, category: string) => void; onDelete: (book: LibraryBook) => void;
  shelfView: ShelfView; onShelfView: (value: ShelfView) => void; recency: Map<string, number>; onEdit: (book: LibraryBook) => void;
};

export const LibraryView = memo(function LibraryView({ books, allBooks, recentBooks, selectedBook, loading, mobile, search, setSearch, category, categories, setCategory, onImport, onRead, onReadIntent, onMenu, bookMenu, setBookMenu, onMove, onDelete, shelfView, onShelfView, recency, onEdit }: Props) {
  const readingBooks = selectedBook ? [selectedBook, ...(!mobile ? recentBooks.filter(book => book.id !== selectedBook.id).slice(0, 2) : [])] : [];
  const arrangedBooks = useMemo(() => orderedShelfBooks(books, shelfView.sortBy, recency), [books, shelfView.sortBy, recency]);
  return <div className="page libraryPage" data-empty={!loading && !allBooks.length}>
    <div className="pageHeader">
      <div className="headerTitle"><button className="menuButton" aria-label="打开导航" onClick={onMenu}><Menu size={21}/></button><h1>我的书库</h1></div>
      {(loading||allBooks.length>0)&&<div className="headerActions"><button className="uiButton addBookCard" aria-label="导入书籍" title="导入书籍" onClick={onImport} disabled={loading}><Plus size={18}/><span>导入书籍</span></button></div>}
    </div>
    {loading ? <div className="librarySkeleton" role="status" aria-label="正在载入书库"><div className="skeleton skeletonHero"/><div className="skeleton skeletonShelf"/><div className="skeleton skeletonBook"/><div className="skeleton skeletonBook"/><div className="skeleton skeletonBook"/></div> : <>
      {readingBooks.length > 0 && !search.trim() && <section className="readingHistoryStrip" aria-label="最近阅读" data-reading-count={readingBooks.length}>
        {readingBooks.map((book,index) => <button key={book.id} className={`readingHistoryBook${index === 0 ? " readingHistoryCurrent" : ""}`} aria-label={`${index === 0 ? "继续阅读" : "阅读"}《${book.title}》`} title={book.title} onPointerEnter={() => onReadIntent(book)} onFocus={() => onReadIntent(book)} onTouchStart={() => onReadIntent(book)} onClick={() => onRead(book)}>
          <BookArtwork book={book} className="historyArtwork"/>
          <span className="historyCopy"><span className="historyIdentity"><strong className="historyTitle">{book.title}</strong>{book.author && book.author !== "未知作者" && <small className="historyAuthor">{book.author}</small>}</span><span className="historyProgress"><span className="historyTrack" role="progressbar" aria-label={`《${book.title}》阅读进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={readingPercent(book.progress)}><i style={{width:`${readingPercent(book.progress)}%`}}/></span><small>{readingPercent(book.progress)}<span>%</span></small></span></span>
        </button>)}
      </section>}
      {!allBooks.length?<EmptyLibrary onImport={onImport}/>:<section className="sectionBlock"><div className="sectionHeading shelfHeading"><h2 className="sectionMeta" aria-live="polite">{search.trim() ? "搜索结果" : category === "全部" ? "全部藏书" : category}<span>{books.length} 本</span></h2><div className="libraryTools"><label className="searchBox" data-searching={!!search} title="搜索书名或作者"><Search size={18}/><input type="search" aria-label="搜索书名或作者" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearch(""); event.currentTarget.blur(); } }}/>{!!search && <button className="clearShelfSearch" aria-label="清除书籍搜索" onClick={() => setSearch("")}><X size={16}/></button>}</label><PaperySelect className="shelfSort" label="书籍排序" displayLabel="排序" value={shelfView.sortBy} options={shelfSortOptions} onChange={sortBy=>onShelfView({groupBy:"none",sortBy:sortBy as ShelfView["sortBy"]})}/></div></div>
        {!search.trim()&&categories.length>0&&<SelectionGroup className="segmented shelfCategories" label="书籍分类">{["全部",...categories].map(item=><button key={item} onClick={()=>setCategory(item)} aria-pressed={category===item} className={category===item?"active":""}>{item}</button>)}</SelectionGroup>}
        {!!allBooks.length && !books.length && <p className="emptyLibraryHint">没有符合条件的书籍。可以调整分类或搜索词。</p>}
        {!!arrangedBooks.length&&<BookSpineShelf books={arrangedBooks} categories={categories} onRead={onRead} onReadIntent={onReadIntent} bookMenu={bookMenu} setBookMenu={setBookMenu} onEdit={onEdit} onMove={onMove} onDelete={onDelete}/>}
      </section>}
    </>}
  </div>;
});
