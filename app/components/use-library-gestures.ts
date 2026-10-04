"use client";
import { useEffect, useRef, useState } from "react";

/** WebView native interception is disabled so OS drops expose actual File objects. */
export function useBookDrop(onFiles:(files:File[])=>Promise<void>,notify:(message:string)=>void) {
  const callbacks=useRef({onFiles,notify}),busy=useRef(false),[status,setStatus]=useState("");
  useEffect(()=>{callbacks.current={onFiles,notify}},[onFiles,notify]);
  useEffect(()=>{
    let depth=0,active=true;
    const hasFiles=(event:DragEvent)=>Array.from(event.dataTransfer?.types||[]).includes("Files");
    const enter=(event:DragEvent)=>{if(!hasFiles(event)||busy.current)return;event.preventDefault();depth++;setStatus("松开，加入书库")};
    const over=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=busy.current?"none":"copy"};
    const leave=(event:DragEvent)=>{if(!hasFiles(event))return;depth=Math.max(0,depth-1);if(!depth&&!busy.current)setStatus("")};
    const drop=(event:DragEvent)=>{if(!hasFiles(event))return;event.preventDefault();event.stopPropagation();depth=0;if(busy.current)return;const files=Array.from(event.dataTransfer?.files||[]);if(!files.length){setStatus("");callbacks.current.notify("请拖入 TXT、EPUB 或 PDF 文件");return}busy.current=true;setStatus("正在导入书籍…");void callbacks.current.onFiles(files).catch(error=>callbacks.current.notify(error instanceof Error?error.message:"导入失败，请重试")).finally(()=>{busy.current=false;if(active)setStatus("")})};
    const reset=()=>{depth=0;if(!busy.current)setStatus("")};
    document.addEventListener("dragenter",enter);document.addEventListener("dragover",over);document.addEventListener("dragleave",leave);document.addEventListener("drop",drop,true);window.addEventListener("blur",reset);
    return()=>{active=false;document.removeEventListener("dragenter",enter);document.removeEventListener("dragover",over);document.removeEventListener("dragleave",leave);document.removeEventListener("drop",drop,true);window.removeEventListener("blur",reset)};
  },[]);
  return status;
}

export function useBlankSwipe(enabled:boolean,onOpen:()=>void) {
  const open=useRef(onOpen);
  useEffect(()=>{open.current=onOpen},[onOpen]);
  useEffect(()=>{
    if(!enabled)return;
    let start:{x:number;y:number;time:number}|null=null;
    const begin=(event:TouchEvent)=>{
      start=null;if(event.touches.length!==1||document.querySelector('[role="dialog"][aria-modal="true"]')||window.getSelection()?.toString())return;
      const element=event.target as HTMLElement;
      // Leave every content/page gesture to the reader, including empty TXT lines.
      if(element.closest("button,a,input,textarea,select,[role=button],.readingStage,.readerTop,.readerBottom,.readingUiToggle,.bookCard,.noteCard,.categoryList,.segmented,.sidebar,[contenteditable=true]"))return;
      if(element.childNodes.length===1&&element.firstChild?.nodeType===Node.TEXT_NODE&&element.textContent?.trim())return;
      start={x:event.touches[0].clientX,y:event.touches[0].clientY,time:Date.now()};
    };
    const finish=(event:TouchEvent)=>{const initial=start;start=null;if(!initial||event.touches.length||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-initial.x,dy=event.changedTouches[0].clientY-initial.y;if(dx>64&&dx>Math.abs(dy)*2&&Date.now()-initial.time<900){event.preventDefault();open.current()}};
    const cancel=()=>{start=null};
    document.addEventListener("touchstart",begin,{passive:true});document.addEventListener("touchend",finish,{passive:false});document.addEventListener("touchcancel",cancel);
    return()=>{document.removeEventListener("touchstart",begin);document.removeEventListener("touchend",finish);document.removeEventListener("touchcancel",cancel)};
  },[enabled]);
}
