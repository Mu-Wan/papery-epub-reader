"use client";
import {useEffect,useRef,useState} from "react";
import {Bookmark,ChevronLeft,ListTree,PanelLeftOpen,PenLine,Search,Settings2,Menu,MoreHorizontal} from "./PaperyIcons";
type Props={title:string;visible:boolean;format:string;pdfMode:"original"|"text";bookmarked:boolean;onBack:()=>void;onNavigation:()=>void;onHide:()=>void;onSearch:()=>void;onToc:()=>void;onNotes:()=>void;onBookmark:()=>void;onSettings:()=>void;onPdfMode:(mode:"original"|"text")=>void};
export function ReaderToolbar(props:Props){
  const [more,setMore]=useState(false),menu=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!more)return;const close=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setMore(false)};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setMore(false);menu.current?.querySelector<HTMLButtonElement>(".readerMoreToggle")?.focus()}};document.addEventListener("pointerdown",close,true);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close,true);document.removeEventListener("keydown",escape)}},[more]);
  const [wasVisible,setWasVisible]=useState(props.visible);
  if(wasVisible!==props.visible){setWasVisible(props.visible);if(!props.visible)setMore(false)}
  const action=(callback:()=>void)=>{setMore(false);callback()};
  return <div className={`readerTop readingToolbar ${props.visible?"visible":""}`}>
    <div className="readingToolbarHead"><button aria-label="返回书库" onClick={props.onBack}><ChevronLeft size={21}/></button><button className="readerDesktopTool" aria-label="显示导航" onClick={props.onNavigation}><PanelLeftOpen size={19}/></button><strong title={props.title}>{props.title}</strong><button aria-label="书内搜索" onClick={props.onSearch}><Search size={19}/></button><button aria-label="目录" onClick={props.onToc}><ListTree size={19}/></button><button className="readerDesktopTool" aria-label="隐藏阅读工具栏" onClick={props.onHide}><Menu size={19}/></button></div>
    <div className="readingQuickTools" role="toolbar" aria-label="阅读常用操作">
      {props.format==="PDF"&&<div className="pdfReadingModes" role="group" aria-label="PDF 阅读模式"><button aria-pressed={props.pdfMode==="original"} onClick={()=>props.onPdfMode("original")}>原版</button><button aria-pressed={props.pdfMode==="text"} onClick={()=>props.onPdfMode("text")}>文字</button></div>}
      {props.format==="PDF"&&<button className="pdfMobileMode" aria-label={props.pdfMode==="original"?"切换到文字阅读":"切换到原版阅读"} onClick={()=>props.onPdfMode(props.pdfMode==="original"?"text":"original")}>{props.pdfMode==="original"?"文字":"原版"}</button>}
      <button className="readerDesktopTool" aria-label="阅读笔记" onClick={props.onNotes}><PenLine size={17}/><span>笔记</span></button><button aria-label={props.bookmarked?"移除书签":"添加书签"} aria-pressed={props.bookmarked} onClick={props.onBookmark}><Bookmark size={17} fill={props.bookmarked?"currentColor":"none"}/><span>书签</span></button><button aria-label="排版" onClick={props.onSettings}><Settings2 size={17}/><span>排版</span></button>
      <div className="readerMobileMore" ref={menu}><button className="readerMoreToggle" aria-label="更多阅读操作" aria-expanded={more} onClick={()=>setMore(value=>!value)}><MoreHorizontal size={19}/></button>{more&&<div className="readerToolMenu"><button onClick={()=>action(props.onNotes)}><PenLine size={17}/>阅读笔记</button><button onClick={()=>action(props.onNavigation)}><PanelLeftOpen size={17}/>显示导航</button><button onClick={()=>action(props.onHide)}><Menu size={17}/>隐藏工具栏</button></div>}</div>
    </div>
  </div>;
}
