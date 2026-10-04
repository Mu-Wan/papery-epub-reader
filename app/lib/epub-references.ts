/* eslint-disable @typescript-eslint/no-explicit-any */
// Publisher notes are publication content, not the reader's saved annotations.
// Read raw documents only: never borrow the renderer's reference-counted URLs.
export type EpubReferenceState = {
  status: "loading" | "ready" | "error"; label: string; html: string;
  error?: string; canJump: boolean; canBack: boolean;
};
const EPUB_NS = "http://www.idpf.org/2007/ops";
const ROOT = "https://epub.invalid/";
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const tokens = (element: Element | null | undefined) => (element?.getAttributeNS(EPUB_NS,"type") || element?.getAttribute("epub:type") || "").split(/\s+/);
const hasNoteRole = (element: Element | null | undefined) => tokens(element).some(type=>["footnote","endnote","rearnote","note"].includes(type)) || /\bdoc-(footnote|endnote)\b/.test(element?.getAttribute("role") || "") || /(?:^|[\s_-])(?:footnote|endnote|rearnote)(?:$|[\s_-])/i.test(element?.className?.toString() || "");
export const isNoteReference = (element: Element | null | undefined) => tokens(element).includes("noteref") || /\bdoc-noteref\b/.test(element?.getAttribute("role") || "") || /(?:^|[\s_-])(?:noteref|footnote|endnote|fnref)(?:$|[\s_-])/i.test(element?.className?.toString() || "") || !!element?.closest("sup") && (element.textContent?.trim().length || 0)<=12;
export const isNoteBacklink = (element: Element | null | undefined) => tokens(element).includes("backlink") || /\bdoc-backlink\b/.test(element?.getAttribute("role") || "");
export const safeExternalReference = (href: string) => /^(https?:|mailto:)/i.test(href);

export function resolvePublicationHref(href: string, base = "") {
  // Decode the path for ZIP lookup and the fragment for ID/name lookup separately.
  const url = new URL(href, new URL(base,ROOT));
  if (url.origin !== new URL(ROOT).origin) throw new Error("不是书内链接");
  return { path: decode(url.pathname.slice(1)), id: decode(url.hash.slice(1)), href: url.pathname.slice(1) + url.hash };
}
export function publicationFragment(doc: Document, id: string): Element | null {
  return doc.getElementById(id) || Array.from(doc.getElementsByTagName("a")).find(a=>a.getAttribute("name")===id) || null;
}
export function noteContainer(target: Element): Element {
  // A marker inside a note should show that note, never the entire endnotes chapter.
  let element: Element | null = target;
  while (element && !/^(body|html)$/i.test(element.localName)) {
    if (hasNoteRole(element)) return element;
    element = element.parentElement;
  }
  if (/^(a|span)$/i.test(target.localName)) {
    const block=target.closest("p,li,aside,dd");
    if (block) return block;
    // EPUB 2 often puts an empty named anchor immediately before its paragraph.
    if (!target.textContent?.trim() && target.nextElementSibling) return target.nextElementSibling;
  }
  return target;
}
const hiddenTarget = (element: Element) => {
  for(let node:Element|null=element;node;node=node.parentElement){
    if(node.hasAttribute("hidden") || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute("style") || ""))return true;
    const style=node.ownerDocument.defaultView?.getComputedStyle(node);
    if(style?.display==="none"||style?.visibility==="hidden")return true;
  }
  return false;
};

export async function noteMarkup(element: Element, base: string, book: any, own: (url: string,bytes:number)=>boolean|void): Promise<string> {
  const doc=element.ownerDocument.implementation.createHTMLDocument("");
  const allowed=new Set("p div section aside article span a sup sub em strong b i u s small br hr ol ul li dl dt dd blockquote pre code table thead tbody tfoot tr td th caption img h1 h2 h3 h4 h5 h6 ruby rt rp math mrow mi mn mo msup msub mfrac msqrt mtext annotation semantics".split(" "));
  const jobs:Promise<void>[]=[];
  const copy=(node:Node,parent:Node)=>{
    if(node.nodeType===3){parent.appendChild(doc.createTextNode(node.textContent || ""));return;}
    if(node.nodeType!==1)return;
    const source=node as Element,tag=source.localName.toLowerCase();
    if(["script","style","iframe","object","embed","form","input","button","video","audio","link","meta","base","svg"].includes(tag))return;
    if(!allowed.has(tag)){for(const child of Array.from(source.childNodes))copy(child,parent);return;}
    const output=tag==="math"||source.namespaceURI==="http://www.w3.org/1998/Math/MathML"?doc.createElementNS("http://www.w3.org/1998/Math/MathML",tag):doc.createElement(tag);
    for(const attribute of ["lang","dir","colspan","rowspan","start","value"])if(source.hasAttribute(attribute))output.setAttribute(attribute,source.getAttribute(attribute)!);
    if(tag==="a"){
      const href=source.getAttribute("href");
      if(href){
        try { const url=new URL(href,new URL(base,ROOT)),resolved=url.origin===new URL(ROOT).origin?resolvePublicationHref(href,base).href:url.href;
          if(!/^[\w+.-]+:/.test(resolved)||safeExternalReference(resolved)){output.setAttribute("href","#");output.setAttribute("data-epub-href",resolved);if(isNoteBacklink(source))output.setAttribute("data-epub-backlink","true");}
        }catch{/* A malformed publisher link remains readable text. */}
      }
    }
    if(tag==="img"){
      const alt=source.getAttribute("alt") || "注释插图";output.setAttribute("alt",alt);
      const src=source.getAttribute("src");
      if(src&&jobs.length<8)jobs.push((async()=>{try{const {path}=resolvePublicationHref(src,base);const item=book.resources?.manifest?.find((entry:any)=>entry.href===path);if(!item?.mediaType?.startsWith("image/")||item.mediaType==="image/svg+xml"||(book.getSize?.(path)||0)>4*1024*1024)return;const blob=await book.loadBlob(path);if(!blob||blob.size>4*1024*1024)return;const url=URL.createObjectURL(new Blob([blob],{type:item.mediaType}));if(own(url,blob.size)!==false)output.setAttribute("src",url);}catch{/* Preserve alt text when an image is unavailable. */}})());
    }
    parent.appendChild(output);for(const child of Array.from(source.childNodes))copy(child,output);
  };
  copy(element,doc.body);await Promise.all(jobs);return doc.body.innerHTML;
}

type ReferenceTarget={path:string;id:string;href:string;index:number;doc:Document;target:Element|null};
type ReferencePage={target:ReferenceTarget;state:EpubReferenceState};
export function createEpubReferenceController(view:any, publish:(state:EpubReferenceState|null)=>void, publishReturn:(visible:boolean)=>void, enqueue:(work:()=>Promise<void>)=>Promise<void>){
  const book=view.book,documents=new Map<string,Promise<Document>>(),urls=new Set<string>();
  let scrollOrigin:{index:number;offset:number}|undefined,originTarget:string|undefined,imageBytes=0;
  let dead=false,generation=0,popup:EpubReferenceState|null=null,pages:ReferencePage[]=[],current:ReferenceTarget|null=null,origin:string|undefined,transient=false;
  const release=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();imageBytes=0;};
  const emit=(state:EpubReferenceState|null)=>{popup=state;if(!dead)publish(state);};
  const snapshot=()=>{view.renderer.flushLocation?.();const renderer=view.renderer,entry=renderer.entries?.[renderer.currentIndex];if(entry&&renderer.scroller)scrollOrigin={index:entry.index,offset:renderer.scroller.scrollTop-entry.element.offsetTop};return view.lastLocation?.cfi as string|undefined;};
  const documentFor=async(path:string,index:number)=>{
    let promise=documents.get(path);
    if(!promise){const item=book.resources?.manifest?.find((item:any)=>item.href===path);promise=Promise.resolve(index>=0?book.sections[index].createDocument():item?book.loadDocument(item):null).then(doc=>{if(!doc?.documentElement||doc.querySelector("parsererror"))throw new Error("注释所在文件无法读取");return doc});documents.set(path,promise);while(documents.size>3)documents.delete(documents.keys().next().value!);promise.catch(()=>{if(documents.get(path)===promise)documents.delete(path)});}
    return promise;
  };
  const resolve=async(href:string):Promise<ReferenceTarget>=>{
    const {path,id,href:canonical}=resolvePublicationHref(href);
    const index=book.sections.findIndex((section:any)=>section.id===path);
    const doc=await documentFor(path,index),target=id?publicationFragment(doc,id):null;
    if(id&&!target)throw new Error("书中没有找到这条注释的目标位置");
    return {path,id,href:canonical,index,doc,target};
  };
  const cfiFor=(target:ReferenceTarget)=>{if(target.index<0)throw new Error("注释文件未列入正文，已在这里完整展示");const range=target.doc.createRange();range.selectNodeContents(target.target || target.doc.body || target.doc.documentElement);range.collapse(true);return view.getCFI(target.index,range);};
  const close=()=>{generation++;emit(null);release();pages=[];current=null;if(!transient){origin=undefined;originTarget=undefined;scrollOrigin=undefined;}};
  const returnToText=async()=>{
    if(!origin)return;const destination=origin;generation++;emit(null);release();pages=[];current=null;
    await enqueue(async()=>{if(dead)return;try{const resolved=await view.goTo(destination);if(!resolved)throw new Error("返回正文失败，请重试");const renderer=view.renderer;if(scrollOrigin&&renderer.scroller){const entry=renderer.entries?.[scrollOrigin.index];if(entry){renderer.scroller.scrollTop=entry.element.offsetTop+scrollOrigin.offset;renderer.flushLocation?.();}}transient=false;origin=undefined;scrollOrigin=undefined;originTarget=undefined;publishReturn(false);}catch(error){if(!dead)emit({status:"error",label:"返回正文",html:"",error:error instanceof Error?error.message:"返回正文失败",canJump:false,canBack:false});}});
  };
  const navigate=async(target:ReferenceTarget,asReference:boolean,token=generation)=>{
    const cfi=cfiFor(target);const previousTransient=transient;
    if(asReference){origin ||= snapshot();transient=true;publishReturn(true);}
    await enqueue(async()=>{if(dead||token!==generation)return;try{const resolved=await view.goTo(cfi);if(!resolved)throw new Error("书内跳转失败，请重试");if(!asReference&&!previousTransient){origin=undefined;publishReturn(false);}}
      catch(error){if(asReference){transient=previousTransient;publishReturn(previousTransient);}throw error;}});
  };
  const activate=async(href:string,source?:Element,fromPopup=false)=>{
    if(dead)return;
    if(safeExternalReference(href)){try{if("__TAURI_INTERNALS__" in window){const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(href);}else window.open(href,"_blank","noopener,noreferrer");}catch{emit({status:"error",label:"链接",html:"",error:"无法打开外部链接",canJump:false,canBack:false});}return;}
    if(/^[\w+.-]+:/.test(href))return;
    if(originTarget){try{const target=resolvePublicationHref(href);if(`${target.path}#${target.id}`===originTarget){if(transient)await returnToText();else close();return;}}catch{/* Malformed link errors are shown below. */}}
    if(isNoteBacklink(source)&&transient){await returnToText();return;}
    if(isNoteBacklink(source)&&popup){close();return;}
    const token=++generation,previous=current&&popup?.status==="ready"?{target:current,state:popup}:null;
    if(previous)pages.push(previous);if(pages.length>12)pages.shift();
    if(!origin&&source){const section=view.renderer.getContents?.().find((entry:any)=>entry.doc===source.ownerDocument);const marker=source.closest("[id]");if(section&&marker){const target=resolvePublicationHref(`#${encodeURIComponent(marker.id)}`,book.sections[section.index].id);originTarget=`${target.path}#${target.id}`;}}
    origin ||= snapshot();
    const label=source?.textContent?.trim().slice(0,32) || "";
    emit({status:"loading",label:label?`注释 ${label}`:"注释",html:"",canJump:false,canBack:pages.length>0});
    try{
      const target=await resolve(href);if(dead||token!==generation)return;
      const note=target.target?noteContainer(target.target):target.doc.body;
      const legacyNote=!!source && (source.textContent?.trim().length || 0)<=12 && /^(?:fn|ftn|ntf|note|endnote|footnote)[\d_-]/i.test(target.id);
      const isNote=!isNoteBacklink(source)&&(fromPopup||isNoteReference(source)||legacyNote||!!target.target&&hasNoteRole(note)||target.index<0);
      if(!isNote){await navigate(target,false,token);if(!dead&&token===generation)close();return;}
      const html=await noteMarkup(note!,target.path,book,(url,bytes)=>{if(dead||token!==generation||imageBytes+bytes>8*1024*1024){URL.revokeObjectURL(url);return false;}urls.add(url);imageBytes+=bytes;return true;});
      if(dead||token!==generation)return;
      current=target;
      emit({status:"ready",label:label?`注释 ${label}`:"注释",html,canJump:target.index>=0&&book.sections[target.index].linear!=="no"&&!hiddenTarget(target.target || note!),canBack:pages.length>0});
    }catch(error){if(!dead&&token===generation)emit({status:"error",label:"注释",html:"",error:error instanceof Error?error.message:"注释暂时无法读取",canJump:false,canBack:pages.length>0});}
  };
  const link=(event:Event)=>{event.preventDefault();const {a,href}=(event as CustomEvent).detail;void activate(String(href),a);};
  const external=(event:Event)=>{event.preventDefault();const {href}=(event as CustomEvent).detail;void activate(String(href));};
  view.addEventListener("link",link);view.addEventListener("external-link",external);
  return {
    activate,close,returnToText,
    isTransient:()=>transient,isOpen:()=>!!popup,
    // User search/TOC/note navigation explicitly resumes ordinary reading.
    resumeReading:()=>{close();transient=false;origin=undefined;originTarget=undefined;scrollOrigin=undefined;publishReturn(false);},
    back:()=>{generation++;const page=pages.pop();if(page){current=page.target;emit({...page.state,canBack:pages.length>0});}},
    jump:async()=>{if(!current||!popup?.canJump)return;const target=current;emit(null);try{await navigate(target,true);const loaded=view.renderer.getContents?.().find((entry:any)=>entry.index===target.index)?.doc;const actual=loaded&&target.id?publicationFragment(loaded,target.id):null;if(actual&&hiddenTarget(actual)){await returnToText();await activate(target.href,undefined,true);if(popup)emit({...popup,canJump:false});return;}release();pages=[];current=null;}catch(error){if(!dead)emit({status:"error",label:"注释",html:"",error:error instanceof Error?error.message:"注释跳转失败",canJump:false,canBack:false});}},
    destroy:()=>{dead=true;generation++;release();documents.clear();pages=[];view.removeEventListener("link",link);view.removeEventListener("external-link",external);},
  };
}
export type EpubReferenceController=ReturnType<typeof createEpubReferenceController>;
