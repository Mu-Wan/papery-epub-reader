"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {LibraryBook} from "./LibraryView";
import {BookArtwork} from "./BookArtwork";
import {ArrowUpRight,BookOpen,Check,MoreHorizontal,Trash2,X} from "./PaperyIcons";
import {spineGap,spineMetrics,spineRows} from "../lib/book-spines";
import {useDialogFocus} from "./use-dialog-focus";
type Props={books:LibraryBook[];onRead:(book:LibraryBook)=>void;onReadIntent:(book:LibraryBook)=>void;bookMenu:string|null;setBookMenu:(id:string|null)=>void;onEdit:(book:LibraryBook)=>void;onMove:(book:LibraryBook,category:string)=>void;onDelete:(book:LibraryBook)=>void;categories:string[]};
export function BookSpineShelf(props:Props){
  const root=useRef<HTMLDivElement>(null),[width,setWidth]=useState(800),[touch,setTouch]=useState(false),[hover,setHover]=useState<string|null>(null),[preview,setPreview]=useState<LibraryBook|null>(null);
  useEffect(()=>{const node=root.current;if(!node)return;const update=()=>{setWidth(node.clientWidth);setTouch(window.matchMedia("(pointer:coarse)").matches||node.clientWidth<600);};const observer=new ResizeObserver(update);observer.observe(node);update();return()=>observer.disconnect();},[]);
  const rows=useMemo(()=>spineRows(props.books,Math.max(80,width-(touch?0:16)),touch),[props.books,width,touch]);
  return <div ref={root} className="bookcase" data-touch-shelf={touch}>
    {rows.map(row=><div className="spineShelfRow" key={row[0].id} style={{"--row-height":`${Math.max(...row.map(book=>spineMetrics(book,touch).height))}px`} as React.CSSProperties}>
      <div className="spineShelfBooks">{row.map((book,position)=>{const metrics=spineMetrics(book,touch),active=hover===book.id;return <article className="spineBook" key={book.id} data-author={book.author} data-book-menu-root={props.bookMenu===book.id?"true":undefined} data-book-id={book.id} data-preview-open={active||undefined} data-long-title={book.title.length>18||undefined} data-preview-side={position>=row.length-3?"left":"right"} style={{"--spine-gap":`${spineGap(row[position-1],book,touch)}px`,"--spine-width":`${metrics.width}px`,"--spine-height":`${metrics.height}px`,"--binding":metrics.color,"--binding-ink":metrics.ink} as React.CSSProperties} onPointerEnter={()=>{if(!touch)setHover(book.id);props.onReadIntent(book);}} onPointerLeave={()=>setHover(current=>current===book.id?null:current)}>
        <button className="spineOpen" aria-label={touch?`查看《${book.title}》`:`阅读《${book.title}》`} onFocus={()=>{setHover(book.id);props.onReadIntent(book);}} onBlur={()=>setHover(null)} onClick={()=>touch?setPreview(book):props.onRead(book)}><span className="spineBinding"><span className="spineTitle" title={book.title}>{book.title}</span><span className="spineAuthor">{book.author}</span>{book.progress>0&&<i className="spinePosition" style={{height:`${Math.min(100,book.progress)}%`}}/>}</span>{book.progress>0&&<span className="spineBookmark" title={`已读 ${Math.round(book.progress)}%`} style={{height:`${18+Math.min(100,book.progress)*.28}px`}} aria-hidden="true"/>}</button>
        {!touch&&active&&<div className="spineCoverPreview" aria-hidden="true"><BookArtwork book={book}/></div>}
        <button className="spineManage" aria-label={`管理《${book.title}》`} aria-expanded={props.bookMenu===book.id} onClick={()=>props.setBookMenu(props.bookMenu===book.id?null:book.id)}><MoreHorizontal size={16}/></button>
        {props.bookMenu===book.id&&<div className="bookMenu"><button onClick={()=>props.onEdit(book)}><BookOpen size={14}/>编辑书籍信息</button><small>移动到分类</small>{props.categories.map(category=><button key={category} className={category===book.category?"active":""} onClick={()=>props.onMove(book,category)}>{category===book.category&&<Check size={13}/>}<span>{category}</span></button>)}<button className="deleteBookAction" onClick={()=>props.onDelete(book)}><Trash2 size={14}/>删除书籍</button></div>}
      </article>;})}</div><div className="shelfBoard" aria-hidden="true"/>
    </div>)}
    {preview&&<SpinePreview book={preview} onClose={()=>setPreview(null)} onRead={()=>props.onRead(preview)} onEdit={()=>{props.onEdit(preview);setPreview(null);}} onDelete={()=>{props.onDelete(preview);setPreview(null);}} onManage={()=>{props.setBookMenu(preview.id);setPreview(null);}}/>}
  </div>;
}
function SpinePreview({book,onClose,onRead,onEdit,onDelete,onManage}:{book:LibraryBook;onClose:()=>void;onRead:()=>void;onEdit:()=>void;onDelete:()=>void;onManage:()=>void}){
  const dialog=useDialogFocus<HTMLDivElement>(onClose);
  return <><button className="modalScrim" aria-label="关闭书籍预览" onClick={onClose}/><div ref={dialog} className="spinePreviewSheet" role="dialog" aria-modal="true" aria-label={`书籍预览 ${book.title}`}><button className="spinePreviewClose" aria-label="关闭书籍预览" onClick={onClose}><X size={20}/></button><BookArtwork book={book}/><div className="spinePreviewCopy"><h2>{book.title}</h2><p>{book.author}</p><span>{book.type} · 已读 {Math.round(book.progress)}%</span><button className="spineReadButton" onClick={onRead}>{book.progress>0?"继续阅读":"开始阅读"}<ArrowUpRight size={19}/></button><div className="spinePreviewActions"><button onClick={onEdit}>编辑信息</button><button onClick={onManage}>分类管理</button><button onClick={onDelete}>删除书籍</button></div></div></div></>;
}

