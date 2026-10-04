"use client";
import { createPortal } from "react-dom";
import type { EpubReferenceController, EpubReferenceState } from "../lib/epub-references";
import { useDialogFocus } from "./use-dialog-focus";
import { ArrowUpRight, ChevronLeft, X } from "./PaperyIcons";

export function EpubReferencePanel({state,controller}:{state:EpubReferenceState;controller:EpubReferenceController}){
  const dialog=useDialogFocus<HTMLElement>(controller.close);
  return createPortal(<div className="epubReferenceLayer" onClick={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <button className="epubReferenceScrim" aria-label="关闭注释，继续阅读" onClick={controller.close}/>
    <aside ref={dialog} className="epubReferencePanel" role="dialog" aria-modal="true" aria-label={state.label} aria-busy={state.status==="loading"}>
      <header><div>{state.canBack&&<button aria-label="返回上一条注释" onClick={controller.back}><ChevronLeft size={18}/></button>}<h2>{state.label}</h2></div><button aria-label="关闭注释" onClick={controller.close}><X size={19}/></button></header>
      {state.status==="loading"?<div className="epubReferenceLoading" role="status" aria-label="正在读取注释"><span/><span/><span/></div>:state.status==="error"?<p className="epubReferenceError" role="alert">{state.error}</p>:<div className="epubReferenceContent" tabIndex={0} onClick={event=>{const link=(event.target as Element).closest<HTMLAnchorElement>("a[data-epub-href]");if(!link)return;event.preventDefault();if(link.dataset.epubBacklink){if(controller.isTransient())void controller.returnToText();else controller.close();}else void controller.activate(link.dataset.epubHref!,link,true);}} dangerouslySetInnerHTML={{__html:state.html}}/>}
      <footer>{state.canJump&&<button onClick={()=>void controller.jump()}>在书中查看<ArrowUpRight size={16}/></button>}<button className="epubReferenceDone" onClick={controller.close}>继续阅读</button></footer>
    </aside>
  </div>,document.querySelector(".appShell") || document.body);
}

export function EpubReferenceReturn({controller}:{controller:EpubReferenceController}){
  return createPortal(<button className="epubReferenceReturn" onClick={event=>{event.stopPropagation();void controller.returnToText();}}><ChevronLeft size={18}/>返回正文</button>,document.querySelector(".appShell") || document.body);
}
