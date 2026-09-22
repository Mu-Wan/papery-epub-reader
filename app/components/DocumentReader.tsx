"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ReaderAnnotation, ReaderApi, ReaderLocation, ReaderSearchResult, ReaderSelection, ReaderSettings, TocItem,
} from "../lib/reader-types";
import { pdfPageOffsets, pageAtOffset } from "../lib/reader-math";
import { loadPdfJs } from "../lib/pdf-loader";
import { saveSetting } from "../lib/local-library";

const sourceBuffers=new Map<string,Promise<ArrayBuffer>>();
function readSource(source:string){let pending=sourceBuffers.get(source);if(!pending){pending=fetch(source).then(response=>{if(!response.ok)throw new Error("读取文件失败");return response.arrayBuffer()});sourceBuffers.set(source,pending);void pending.catch(()=>{if(sourceBuffers.get(source)===pending)sourceBuffers.delete(source)});if(sourceBuffers.size>4)sourceBuffers.delete(sourceBuffers.keys().next().value!)}return pending}
function withTimeout<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{return new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`[Papery] 超时(${ms}ms): ${label}`)),ms);promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})})}
export function warmReaderFormat(format:Props["format"]){if(format==="EPUB"){void import("foliate-js/view.js")}if(format==="PDF")void loadPdfJs()}

type Props = {
  source: string;
  format: "TXT" | "EPUB" | "PDF";
  bookId: string;
  settings: ReaderSettings;
  initialLocation?: string;
  annotations: ReaderAnnotation[];
  onApi: (api: ReaderApi | null) => void;
  onLocation: (location: ReaderLocation) => void;
  onToc: (toc: TocItem[]) => void;
  onSelection: (selection: ReaderSelection) => void;
  onEdgeCue?: (side: "left" | "right" | null) => void;
  onToggleUi?: () => void;
};

export type { ReaderApi } from "../lib/reader-types";

export function DocumentReader(props: Props) {
  if (props.format === "TXT") return <TxtReader {...props}/>;
  if (props.format === "EPUB") return <EpubReader {...props}/>;
  return <PdfReader {...props}/>;
}

function fontStack(font: ReaderSettings["fontFamily"]) {
  if (font === "lxgw") return '"LXGW WenKai", "霞鹜文楷", "Kaiti SC", "Noto Serif CJK SC", serif';
  if (font === "serif") return 'Georgia, "Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif';
  if (font === "sans") return 'Inter, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  return 'system-ui, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
}

function parseLocator<T>(value?: string): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

type PortableTextAnchor = {
  offset?: number;
  start?: number;
  end?: number;
  quote?: string;
  prefix?: string;
  suffix?: string;
  search?: boolean;
  anchor?: boolean;
  annotationId?: string;
};

function textAnchorContext(text:string,start:number,end:number){
  return {
    quote:text.slice(start,end),
    prefix:text.slice(Math.max(0,start-48),start),
    suffix:text.slice(end,Math.min(text.length,end+48)),
  };
}

function rangeAnchorContext(range:Range){
  const root=range.commonAncestorContainer.ownerDocument?.body;
  if(!root)return {quote:range.toString()};
  const before=range.cloneRange(),after=range.cloneRange();
  try{before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);after.selectNodeContents(root);after.setStart(range.endContainer,range.endOffset)}catch{return{quote:range.toString()}}
  return {quote:range.toString(),prefix:before.toString().slice(-48),suffix:after.toString().slice(0,48)};
}

function matchingPrefix(left:string,right:string){let count=0;const limit=Math.min(left.length,right.length);while(count<limit&&left[left.length-1-count]===right[right.length-1-count])count++;return count}
function matchingSuffix(left:string,right:string){let count=0;const limit=Math.min(left.length,right.length);while(count<limit&&left[count]===right[count])count++;return count}

/** Resolve a saved text anchor without using layout-dependent page numbers. */
function resolveTextOffset(text:string,anchor:PortableTextAnchor){
  const expected=Math.min(text.length,Math.max(0,anchor.offset??anchor.start??0));
  const quote=anchor.quote;
  if(!quote)return expected;
  if(text.slice(expected,expected+quote.length)===quote)return expected;
  const candidates:number[]=[];let cursor=0;
  while(candidates.length<400){const found=text.indexOf(quote,cursor);if(found<0)break;candidates.push(found);cursor=found+Math.max(1,quote.length)}
  if(!candidates.length){
    const haystack=text.toLocaleLowerCase(),needle=quote.toLocaleLowerCase();cursor=0;
    while(candidates.length<400){const found=haystack.indexOf(needle,cursor);if(found<0)break;candidates.push(found);cursor=found+Math.max(1,needle.length)}
  }
  if(!candidates.length)return expected;
  return candidates.reduce((best,candidate)=>{
    const prefix=anchor.prefix?matchingPrefix(anchor.prefix,text.slice(Math.max(0,candidate-anchor.prefix.length),candidate)):0;
    const suffix=anchor.suffix?matchingSuffix(anchor.suffix,text.slice(candidate+quote.length,candidate+quote.length+anchor.suffix.length)):0;
    const score=(prefix+suffix)*1000-Math.abs(candidate-expected);
    return score>best.score?{offset:candidate,score}:best;
  },{offset:candidates[0],score:Number.NEGATIVE_INFINITY}).offset;
}

const epubFontInstalls=new WeakMap<Document,Promise<void>>();
let epubFontBuffer:Promise<ArrayBuffer>|null=null;
let epubFontBlobUrl:string|null=null;
function loadEpubFontBuffer(){return epubFontBuffer??=(fetch("/vendor/lxgw-wenkai.woff2").then(response=>{if(!response.ok)throw new Error("字体读取失败");return response.arrayBuffer()}))}
/** Get a blob URL for the font so iframes can load it synchronously without network fetch. */
function getEpubFontBlobUrl():Promise<string>{if(epubFontBlobUrl)return Promise.resolve(epubFontBlobUrl);return loadEpubFontBuffer().then(buffer=>{epubFontBlobUrl=URL.createObjectURL(new Blob([buffer],{type:"font/woff2"}));return epubFontBlobUrl}).catch(()=>"/vendor/lxgw-wenkai.woff2")}
function epubFontStack(font:ReaderSettings["fontFamily"]){return font==="lxgw"?'"Papery LXGW WenKai", "LXGW WenKai", "霞鹜文楷", "Kaiti SC", serif':fontStack(font)}
const epubFontUrl=typeof window!=="undefined"?new URL("/vendor/lxgw-wenkai.woff2",window.location.href).href:"/vendor/lxgw-wenkai.woff2";
function preloadEpubFont(){const pre=document.createElement("link");pre.rel="preload";pre.as="font";pre.type="font/woff2";pre.crossOrigin="anonymous";pre.href=epubFontUrl;document.head.append(pre)}
/** Determine if a hex background is dark enough to require light text */
function isDarkBg(hex:string){const c=hex.replace("#","");const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return(r*299+g*587+b*114)/1000<100}
function readerTextColor(pageColor:string){return isDarkBg(pageColor)?"#d6d3cb":"#302d27"}

async function applyEpubDocumentFont(doc:Document,settings:ReaderSettings){
  let install=epubFontInstalls.get(doc);
  if(settings.fontFamily==="lxgw"&&!install){
    install=(async()=>{const FontFaceCtor=(doc.defaultView as any)?.FontFace??FontFace;let fontSource:string|ArrayBuffer;try{fontSource=await loadEpubFontBuffer()}catch{fontSource=`url("${epubFontUrl}") format("woff2")`}const face=new FontFaceCtor("Papery LXGW WenKai",fontSource,{style:"normal",weight:"100 900"});doc.fonts.add(face);await face.load()})();
    epubFontInstalls.set(doc,install);
  }
  let style=doc.getElementById("papery-reader-font") as HTMLStyleElement|null;
  if(!style){style=doc.createElement("style");style.id="papery-reader-font";(doc.head||doc.documentElement).append(style)}
  const stack=epubFontStack(settings.fontFamily);
  const fontUrl=epubFontBlobUrl||epubFontUrl;
  doc.documentElement.classList.add("papery-reader-document","papery-reader-typography");
  doc.body?.classList.add("papery-reader-body");
  style.textContent=`
    @font-face{font-family:"Papery LXGW WenKai";font-style:normal;font-weight:100 900;font-display:swap;src:url("${fontUrl}") format("woff2")}
    html.papery-reader-document.papery-reader-typography,html.papery-reader-document.papery-reader-typography body.papery-reader-body{background:${settings.pageColor}!important;color:${readerTextColor(settings.pageColor)}!important;font-family:${stack}!important;font-size:${settings.fontSize}px!important;line-height:${settings.lineHeight}!important;font-synthesis:none!important;scrollbar-width:none!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body{box-sizing:border-box!important;margin:0!important;padding:0!important;max-width:none!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body *{font-family:inherit!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body>:is(main,article,section,div),html.papery-reader-document.papery-reader-typography body.papery-reader-body>:is(main,article,section,div)>:is(main,article,section,div){box-sizing:border-box!important;max-width:none!important;margin-inline:0!important;padding-inline:0!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body p{font-size:1em!important;line-height:${settings.lineHeight}!important;margin-bottom:${settings.paragraphSpacing}px!important;text-align:justify!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body :is(img,svg,video){max-width:100%!important;height:auto!important}
    html.papery-reader-document.papery-reader-typography ::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}`;
  doc.documentElement.style.setProperty("font-family",stack,"important");
  doc.body?.style.setProperty("font-family",stack,"important");
  if(install)await install.catch(()=>undefined);
}

function decodeTxt(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const broken = (utf8.match(/�/g)?.length || 0) / Math.max(1, utf8.length);
  if (broken < .002) return utf8.replace(/^\uFEFF/, "");
  try { return new TextDecoder("gb18030").decode(bytes); } catch { return utf8; }
}

type TxtParagraph = { text: string; start: number; end: number };
type TxtChapter = { title: string; offset: number; index: number };
type TxtSection = { start: number; end: number; index: number };

function parseTxt(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  const chapters: TxtChapter[] = [];
  const chapterPattern = /^\s*((?:正文\s*)?第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[集卷部篇章节回幕]|[Cc]hapter\s+\d+|序章|序言|前言|楔子|引子|后记|尾声|番外|\d{1,4}(?!\d)(?:\s*[.、:：\-—]\s*\S|[\s.、:：\-—]*$))/;
  for (const match of normalized.matchAll(/[^\n]*/g)) {
    const raw=match[0],offset=match.index||0;
    const value = raw.trim();
    if (value && (chapterPattern.test(value) || (value.length < 28 && /[章节卷篇]$/.test(value)))) {
      chapters.push({ title: value, offset: offset + Math.max(0, raw.indexOf(value)), index: chapters.length });
    }
  }
  if (!chapters.length) chapters.push({ title: "正文", offset: 0, index: 0 });
  return { normalized, chapters };
}

function paragraphsForRange(text:string,start:number,end:number):TxtParagraph[] {
  const segment=text.slice(start,end);const result:TxtParagraph[]=[];
  for(const match of segment.matchAll(/[^\n]+/g)){
    const raw=match[0],value=raw.trim();if(!value)continue;
    const local=(match.index||0)+Math.max(0,raw.indexOf(value));
    result.push({text:value,start:start+local,end:start+local+value.length});
  }
  return result;
}

function buildTxtSections(text:string,chapters:TxtChapter[],targetSize=40000):TxtSection[]{
  if(!text.length)return[{start:0,end:0,index:0}];
  const chapterBounds=chapters.map(chapter=>chapter.offset).filter(offset=>offset>0&&offset<text.length);
  const sections:TxtSection[]=[];let start=0;
  while(start<text.length){
    const target=Math.min(text.length,start+targetSize);
    let end=chapterBounds.filter(offset=>offset>start+8000&&offset<=target).at(-1)||0;
    if(!end){end=text.lastIndexOf("\n",target);if(end<=start+8000)end=text.indexOf("\n",target)}
    if(end<=start||end>text.length)end=Math.min(text.length,target);
    sections.push({start,end,index:sections.length});start=end;
  }
  return sections;
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!))}

type TextMark={start:number;end:number;style:string;color:string;nonce:number};
function renderMarkedText(text:string,marks:TextMark[]){
  const clipped=marks.map(mark=>({...mark,start:Math.max(0,Math.min(text.length,mark.start)),end:Math.max(0,Math.min(text.length,mark.end))})).filter(mark=>mark.end>mark.start);
  if(!clipped.length)return escapeHtml(text);
  const boundaries=[...new Set([0,text.length,...clipped.flatMap(mark=>[mark.start,mark.end])])].sort((a,b)=>a-b);
  let result="";
  for(let index=0;index<boundaries.length-1;index++){
    const start=boundaries[index],end=boundaries[index+1];if(end<=start)continue;
    const active=clipped.filter(mark=>mark.start<=start&&mark.end>=end),mark=active.find(item=>item.style==="search")||active[0],body=escapeHtml(text.slice(start,end));
    if(!mark){result+=body;continue}
    const cue=mark.style==="search"?` data-search-cue="${mark.nonce}"`:"";
    result+=`<span class="readerMark ${mark.style}"${cue} style="--mark-color:${mark.color}">${body}</span>`;
  }
  return result;
}

function TxtReader({source,bookId,settings,initialLocation,annotations,onApi,onLocation,onToc,onSelection}:Props) {
  const host=useRef<HTMLDivElement>(null),content=useRef<HTMLElement>(null);
  const nodesRef=useRef(new Map<number,HTMLElement>()),offsetRef=useRef(0),pageRef=useRef(0),renderedPageRef=useRef(0);
  const initialized=useRef(false),reflowing=useRef(false),wheelLocked=useRef(false),scrollTimer=useRef<number|null>(null),searchTimer=useRef<number|null>(null),jumpRequest=useRef<{offset:number;cue:boolean}|null>(null);
  const [text,setText]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [sectionIndex,setSectionIndex]=useState(0),[page,setPage]=useState(0),[sectionPages,setSectionPages]=useState(1),[layoutEpoch,setLayoutEpoch]=useState(0),[jumpEpoch,setJumpEpoch]=useState(0);
  const [searchTarget,setSearchTarget]=useState<{start:number;end:number;nonce:number}|null>(null);
  const [viewport,setViewport]=useState({width:900,height:650});
  const parsed=useMemo(()=>parseTxt(text),[text]);
  const sections=useMemo(()=>buildTxtSections(parsed.normalized,parsed.chapters),[parsed.normalized,parsed.chapters]);
  const initialOffset=resolveTextOffset(parsed.normalized,parseLocator<PortableTextAnchor>(initialLocation)||{});
  const sectionForOffset=useCallback((offset:number)=>{let low=0,high=sections.length-1,found=0;while(low<=high){const middle=(low+high)>>1;if(sections[middle].start<=offset){found=middle;low=middle+1}else high=middle-1}return Math.min(sections.length-1,found)},[sections]);
  const renderStart=settings.flow==="scrolled"?Math.max(0,sectionIndex-1):sectionIndex;
  const renderEnd=settings.flow==="scrolled"?Math.min(sections.length,sectionIndex+2):Math.min(sections.length,sectionIndex+1);
  const rangeStart=sections[renderStart]?.start||0,rangeEnd=sections[Math.max(renderStart,renderEnd-1)]?.end||0;
  const paragraphs=useMemo(()=>paragraphsForRange(parsed.normalized,rangeStart,rangeEnd),[parsed.normalized,rangeStart,rangeEnd]);
  const txtMarkup=useMemo(()=>{const chapterOffsets=new Set(parsed.chapters.map(chapter=>chapter.offset));return paragraphs.map(paragraph=>{const marks:TextMark[]=[...annotations.flatMap(annotation=>{const loc=parseLocator<{type:string;start?:number;end?:number}>(annotation.locator);return loc?.type==="txt"&&typeof loc.start==="number"&&typeof loc.end==="number"&&loc.end>paragraph.start&&loc.start<paragraph.end?[{start:loc.start-paragraph.start,end:loc.end-paragraph.start,style:annotation.style,color:/^#[0-9a-f]{3,8}$/i.test(annotation.color)?annotation.color:"#f1a052",nonce:0}]:[]}),...(searchTarget&&searchTarget.end>paragraph.start&&searchTarget.start<paragraph.end?[{start:searchTarget.start-paragraph.start,end:searchTarget.end-paragraph.start,style:"search",color:"#ffb347",nonce:searchTarget.nonce}]:[])];const tag=chapterOffsets.has(paragraph.start)?"h2":"p";return `<${tag} data-txt-start="${paragraph.start}">${renderMarkedText(paragraph.text,marks)}</${tag}>`}).join("")},[paragraphs,parsed.chapters,annotations,searchTarget]);
  const effectiveSpread=settings.flow==="scrolled"||viewport.width<700?"single":settings.spread,step=effectiveSpread==="double"?2:1;
  const pageGap=effectiveSpread==="double"?28:24,logicalPageWidth=effectiveSpread==="double"?Math.max(280,(viewport.width-28)/2):viewport.width;
  const horizontalPadding=logicalPageWidth*Math.min(30,Math.max(5,settings.horizontalMargin))/100,verticalPadding=viewport.height*Math.min(18,Math.max(0,settings.verticalMargin))/100;
  const usableWidth=Math.max(180,logicalPageWidth-horizontalPadding*2),usableHeight=Math.max(180,viewport.height-verticalPadding*2),columnGap=horizontalPadding*2+pageGap,columnStride=usableWidth+columnGap;
  const logicalTotal=Math.max(1,Math.ceil(parsed.normalized.length/1800));

  useEffect(()=>{let cancelled=false;readSource(source).then(buffer=>{if(!cancelled)setText(decodeTxt(buffer))}).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"无法解析 TXT")}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[source]);
  useEffect(()=>()=>{if(scrollTimer.current!==null)window.clearTimeout(scrollTimer.current);if(searchTimer.current!==null)window.clearTimeout(searchTimer.current)},[]);
  useLayoutEffect(()=>{if(!text||initialized.current)return;initialized.current=true;offsetRef.current=initialOffset;setSectionIndex(sectionForOffset(initialOffset))},[text,initialOffset,sectionForOffset]);
  useEffect(()=>{if(text){void saveSetting(`analysis:${bookId}`,{totalPages:logicalTotal,analyzedAt:Date.now()});onToc(parsed.chapters.map(chapter=>({id:`txt-${chapter.index}`,label:chapter.title,level:0,page:Math.floor(chapter.offset/1800)+1,locator:JSON.stringify({type:"txt",offset:chapter.offset})}))) }},[bookId,text,logicalTotal,parsed.chapters,onToc]);
  useEffect(()=>{const element=host.current;if(!element)return;const update=()=>setViewport({width:Math.max(320,element.clientWidth),height:Math.max(320,element.clientHeight)});const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect()},[loading]);

  const paragraphForOffset=useCallback((offset:number)=>{let low=0,high=paragraphs.length-1,found=paragraphs[0];while(low<=high){const middle=(low+high)>>1,item=paragraphs[middle];if(item.start<=offset){found=item;low=middle+1}else high=middle-1}return found},[paragraphs]);
  const elementForOffset=useCallback((offset:number)=>{const paragraph=paragraphForOffset(offset);return paragraph?nodesRef.current.get(paragraph.start)||null:null},[paragraphForOffset]);
  const rangeAtOffset=useCallback((element:HTMLElement,offset:number)=>{const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null,remaining=Math.max(0,offset);while((node=walker.nextNode())){const length=node.textContent?.length||0;if(remaining<=length){const range=document.createRange();range.setStart(node,remaining);range.collapse(true);return range}remaining-=length}const range=document.createRange();range.selectNodeContents(element);range.collapse(false);return range},[]);
  const pageForOffset=useCallback((offset:number)=>{const element=elementForOffset(offset),container=host.current;if(!element||!container)return 0;if(settings.flow==="scrolled")return 0;const paragraph=paragraphForOffset(offset),range=rangeAtOffset(element,Math.max(0,offset-(paragraph?.start||0))),rect=range.getBoundingClientRect(),bounds=container.getBoundingClientRect(),base=Math.floor(renderedPageRef.current/step)*step,naturalLeft=rect.left-bounds.left+base*columnStride;return Math.max(0,Math.floor((naturalLeft-horizontalPadding+1)/Math.max(1,columnStride)))},[elementForOffset,settings.flow,paragraphForOffset,rangeAtOffset,step,columnStride,horizontalPadding]);
  const visibleOffset=useCallback(()=>{
    const element=host.current;if(!element)return undefined;
    if(settings.flow==="paginated"){
      let low=rangeStart,high=Math.max(rangeStart,rangeEnd-1),target=pageRef.current;
      while(low<high){const middle=Math.floor((low+high)/2);if(pageForOffset(middle)<target)low=middle+1;else high=middle;}
      return low;
    }
    const bounds=element.getBoundingClientRect(),x=bounds.left+Math.min(element.clientWidth-8,Math.max(8,horizontalPadding+8));
    for(const ratio of [.03,.1,.2,.35,.5]){const probe=document.elementFromPoint(x,bounds.top+Math.max(8,verticalPadding)+Math.max(4,(element.clientHeight-verticalPadding*2)*ratio))?.closest<HTMLElement>("[data-txt-start]");if(probe)return Number(probe.dataset.txtStart)}return undefined;
  },[settings.flow,rangeStart,rangeEnd,pageForOffset,horizontalPadding,verticalPadding]);
  const chapterForOffset=useCallback((offset:number)=>{let current=parsed.chapters[0];for(const chapter of parsed.chapters){if(chapter.offset<=offset)current=chapter;else break}return current},[parsed.chapters]);
  const reportLocation=useCallback((explicitOffset?:number)=>{if(reflowing.current)return;const active=sections[sectionIndex]||sections[0],fallback=(active?.start||0)+Math.round((pageRef.current/Math.max(1,sectionPages-1))*Math.max(0,(active?.end||0)-(active?.start||0))),offset=Math.min(parsed.normalized.length,Math.max(0,explicitOffset??visibleOffset()??offsetRef.current));offsetRef.current=offset;const chapter=chapterForOffset(offset);
    const globalPage=Math.floor(offset/1800)+1,totalPages=logicalTotal;
    const anchor=textAnchorContext(parsed.normalized,offset,Math.min(parsed.normalized.length,offset+64));
    onLocation({locator:JSON.stringify({type:"txt",offset,...anchor}),progress:offset/Math.max(1,parsed.normalized.length)*100,page:Math.min(globalPage,totalPages),totalPages,chapterTitle:chapter.title,chapterIndex:chapter.index,chapterCount:parsed.chapters.length})},[sections,sectionIndex,sectionPages,logicalTotal,visibleOffset,parsed.normalized.length,parsed.chapters.length,chapterForOffset,onLocation]);

  useLayoutEffect(()=>{const container=host.current,article=content.current,anchorSection=sectionForOffset(offsetRef.current);if(!text||!container||!article||anchorSection<renderStart||anchorSection>=renderEnd)return;reflowing.current=true;nodesRef.current=new Map(Array.from(article.querySelectorAll<HTMLElement>("[data-txt-start]")).map(element=>[Number(element.dataset.txtStart),element]));const anchor=Math.min(rangeEnd-1,Math.max(rangeStart,offsetRef.current));let nextTotal=1,target=0;if(settings.flow==="paginated"){nextTotal=Math.max(1,Math.round((article.scrollWidth+columnGap)/Math.max(1,columnStride)));target=Math.min(nextTotal-1,pageForOffset(anchor))}setSectionPages(nextTotal);pageRef.current=target;setPage(target);requestAnimationFrame(()=>{if(settings.flow==="scrolled"){const cue=jumpRequest.current?.cue?article.querySelector<HTMLElement>("[data-search-cue]"):null,targetElement=cue||elementForOffset(anchor);if(targetElement){const bounds=container.getBoundingClientRect(),targetBounds=targetElement.getBoundingClientRect(),top=container.scrollTop+targetBounds.top-bounds.top-container.clientHeight*.3;container.scrollTo({top:Math.max(0,top)})}}jumpRequest.current=null;reflowing.current=false;setLayoutEpoch(value=>value+1)})},[text,txtMarkup,jumpEpoch,sectionIndex,renderStart,renderEnd,rangeStart,rangeEnd,settings.flow,settings.fontFamily,settings.fontSize,settings.lineHeight,settings.paragraphSpacing,settings.horizontalMargin,settings.verticalMargin,settings.spread,viewport.width,viewport.height,columnGap,columnStride,verticalPadding,sectionForOffset,pageForOffset,elementForOffset]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>reportLocation(visibleOffset()));return()=>cancelAnimationFrame(frame)},[page,layoutEpoch,reportLocation,visibleOffset]);

  const goTo=useCallback((locator:string)=>{const target=parseLocator<PortableTextAnchor>(locator)||{},offset=resolveTextOffset(parsed.normalized,target),cue=Boolean(target.search||target.anchor);offsetRef.current=offset;jumpRequest.current={offset,cue};reportLocation(offset);if(cue){const quote=target.quote||parsed.normalized.slice(offset,target.end??offset+1),end=Math.min(parsed.normalized.length,offset+Math.max(1,quote.length));setSearchTarget({start:offset,end,nonce:Date.now()});if(searchTimer.current!==null)window.clearTimeout(searchTimer.current);searchTimer.current=window.setTimeout(()=>{searchTimer.current=null;setSearchTarget(null)},6500)}const targetSection=sectionForOffset(offset);if(targetSection!==sectionIndex)setSectionIndex(targetSection);else setJumpEpoch(value=>value+1)},[parsed.normalized,reportLocation,sectionForOffset,sectionIndex]);
  const next=useCallback(()=>{if(settings.flow==="scrolled"){host.current?.scrollBy({top:viewport.height*.88,behavior:"smooth"});return}if(pageRef.current+step<sectionPages){const target=pageRef.current+step;pageRef.current=target;setPage(target)}else if(sectionIndex<sections.length-1){pageRef.current=0;setPage(0);offsetRef.current=sections[sectionIndex+1].start;setSectionIndex(sectionIndex+1)}},[settings.flow,viewport.height,step,sectionPages,sectionIndex,sections]);
  const prev=useCallback(()=>{if(settings.flow==="scrolled"){host.current?.scrollBy({top:-viewport.height*.88,behavior:"smooth"});return}if(pageRef.current-step>=0){const target=pageRef.current-step;pageRef.current=target;setPage(target)}else if(sectionIndex>0){pageRef.current=0;setPage(0);offsetRef.current=Math.max(sections[sectionIndex-1].start,sections[sectionIndex-1].end-1);setSectionIndex(sectionIndex-1)}},[settings.flow,viewport.height,step,sectionIndex,sections]);
  const search=useCallback(async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim().toLocaleLowerCase();if(!needle)return[];const haystack=parsed.normalized.toLocaleLowerCase(),results:ReaderSearchResult[]=[];let cursor=0;while(results.length<100){const offset=haystack.indexOf(needle,cursor);if(offset<0)break;const end=offset+needle.length,chapter=chapterForOffset(offset),logicalPage=Math.floor(offset/1800)+1,anchor=textAnchorContext(parsed.normalized,offset,end);results.push({id:`txt-search-${offset}`,label:`${chapter.title} · 位置 ${logicalPage}`,excerpt:parsed.normalized.slice(Math.max(0,offset-30),Math.min(parsed.normalized.length,end+48)).replace(/\s+/g," "),locator:JSON.stringify({type:"txt",offset,end,search:true,...anchor}),page:logicalPage});cursor=offset+Math.max(1,needle.length)}return results},[parsed.normalized,chapterForOffset]);
  useEffect(()=>{onApi({next,prev,goTo,search});return()=>onApi(null)},[next,prev,goTo,search,onApi]);
  // Post-initialization position verification: after the first layout pass, if
  // we have a non-zero initialLocation but ended up at offset 0, force reposition.
  // NOTE: We capture the ORIGINAL initialLocation at mount because the parent
  // updates it via handleLocation on every report (which may report offset 0
  // during the initial layout pass before positioning completes).
  const originalInitialLocation=useRef(initialLocation);
  const initFixApplied=useRef(false);
  useEffect(()=>{if(!text||layoutEpoch<1||initFixApplied.current)return;initFixApplied.current=true;const loc=originalInitialLocation.current;if(!loc)return;const anchor=parseLocator<PortableTextAnchor>(loc);const expected=anchor?resolveTextOffset(parsed.normalized,anchor):0;if(expected>0&&Math.abs(offsetRef.current-expected)>200){offsetRef.current=expected;jumpRequest.current={offset:expected,cue:false};const targetSection=sectionForOffset(expected);if(targetSection!==sectionIndex)setSectionIndex(targetSection);else setJumpEpoch(v=>v+1)}},[text,layoutEpoch,parsed.normalized,sectionForOffset,sectionIndex]);
  // Safety net: report final location on unmount so progress is never lost
  const reportLocationRef=useRef(reportLocation);
  useEffect(()=>{reportLocationRef.current=reportLocation},[reportLocation]);
  useEffect(()=>()=>{reflowing.current=false;reportLocationRef.current()},[]);

  const select=()=>{const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),startEl=(range.startContainer.nodeType===1?range.startContainer as HTMLElement:range.startContainer.parentElement)?.closest<HTMLElement>("[data-txt-start]"),endEl=(range.endContainer.nodeType===1?range.endContainer as HTMLElement:range.endContainer.parentElement)?.closest<HTMLElement>("[data-txt-start]");if(!startEl||!endEl)return;const within=(root:HTMLElement,node:Node,offset:number)=>{const probe=document.createRange();probe.selectNodeContents(root);try{probe.setEnd(node,offset)}catch{return 0}return probe.toString().length};const rawStart=Number(startEl.dataset.txtStart)+within(startEl,range.startContainer,range.startOffset),rawEnd=Number(endEl.dataset.txtStart)+within(endEl,range.endContainer,range.endOffset),start=Math.min(rawStart,rawEnd),end=Math.max(rawStart,rawEnd),rect=range.getBoundingClientRect(),anchor=textAnchorContext(parsed.normalized,start,end);onSelection({quote:selection.toString().trim(),locator:JSON.stringify({type:"txt",start,end,...anchor}),rect:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}});selection.removeAllRanges()};
  if(error)return <div className="readerError"><strong>TXT 打开失败</strong><p>{error}</p></div>;
  if(loading&&!text)return <div className={`txtReader flow-${settings.flow}`} style={{opacity:0}}/>;
  renderedPageRef.current=page;
  const base=effectiveSpread==="double"?Math.floor(page/2)*2:page;
  const contentStyle=settings.flow==="paginated"?{fontFamily:fontStack(settings.fontFamily),fontSize:settings.fontSize,lineHeight:settings.lineHeight,color:readerTextColor(settings.pageColor),width:usableWidth,height:usableHeight,marginTop:verticalPadding,marginLeft:horizontalPadding,columnWidth:usableWidth,columnGap,transform:`translateX(${-base*columnStride}px)`,"--paragraph-spacing":`${settings.paragraphSpacing}px`}:{fontFamily:fontStack(settings.fontFamily),fontSize:settings.fontSize,lineHeight:settings.lineHeight,color:readerTextColor(settings.pageColor),padding:`${verticalPadding}px ${horizontalPadding}px`,"--paragraph-spacing":`${settings.paragraphSpacing}px`};
  return <div ref={host} className={`txtReader flow-${settings.flow} spread-${effectiveSpread}`} onMouseUp={select}
    onWheel={event=>{if(settings.flow!=="paginated"||Math.abs(event.deltaY)<12||wheelLocked.current)return;event.preventDefault();wheelLocked.current=true;if(event.deltaY>0)next();else prev();window.setTimeout(()=>wheelLocked.current=false,160)}}
    onScroll={()=>{if(settings.flow!=="scrolled"||reflowing.current)return;if(scrollTimer.current!==null)window.clearTimeout(scrollTimer.current);scrollTimer.current=window.setTimeout(()=>{scrollTimer.current=null;const element=host.current;if(!element)return;const offset=visibleOffset();if(offset===undefined)return;offsetRef.current=offset;const visibleSection=sectionForOffset(offset);if(visibleSection!==sectionIndex&&(element.scrollTop<viewport.height*.7||element.scrollHeight-element.scrollTop-element.clientHeight<viewport.height*.7)){setSectionIndex(visibleSection);return}reportLocation(offset)},70)}}>
    <article ref={content} className="txtFlowContent" style={contentStyle as React.CSSProperties} dangerouslySetInnerHTML={{__html:txtMarkup}}/>
  </div>;
}

function flattenToc(items:any[],level=0):TocItem[]{return (items||[]).flatMap((item:any,index:number)=>[{id:item.id||`${level}-${index}`,label:item.label?.trim()||"未命名章节",level,locator:JSON.stringify({type:"epub",href:item.href})},...flattenToc(item.subitems||item.children||[],level+1)]);}

function epubMargins(settings:ReaderSettings){
  const horizontal=Math.min(30,Math.max(2,settings.horizontalMargin));
  const vertical=Math.min(18,Math.max(0,settings.verticalMargin));
  return {horizontal,vertical};
}
function EpubReader(props:Props){
  return <FoliateEpubReader {...props}/>;
}

function foliateStyles(settings:ReaderSettings,fontUrl:string){
  return `
    @font-face{font-family:"Papery LXGW WenKai";font-style:normal;font-weight:100 900;font-display:swap;src:url("${fontUrl}") format("woff2")}
    :root{--theme-bg-color:${settings.pageColor};background:${settings.pageColor}!important;color:${readerTextColor(settings.pageColor)}!important;scrollbar-width:none!important}
    html,body{background:${settings.pageColor}!important;color:${readerTextColor(settings.pageColor)}!important;scrollbar-width:none!important}
    body{box-sizing:border-box!important;margin:0!important;padding:0!important;max-width:none!important;font-family:${epubFontStack(settings.fontFamily)}!important;font-size:${settings.fontSize}px!important;line-height:${settings.lineHeight}!important;font-synthesis:none!important;}
    body *{font-family:inherit!important}
    body>:is(main,article,section,div),body>:is(main,article,section,div)>:is(main,article,section,div){box-sizing:border-box!important;max-width:none!important;margin-inline:0!important;padding-inline:0!important}
    p{font-size:1em!important;line-height:${settings.lineHeight}!important;margin-bottom:${settings.paragraphSpacing}px!important;text-align:justify!important}
    img,svg,video{max-width:100%!important;height:auto!important}
    ::selection{background:rgba(255,177,64,.62)!important;color:inherit!important}
    ::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
  `;
}

function foliateLocator(value?:string){
  const parsed=parseLocator<{cfi?:string;href?:string;fraction?:number}>(value);
  return parsed?.cfi||parsed?.href||(typeof parsed?.fraction==="number"?{fraction:parsed.fraction}:undefined);
}

function applyFoliateLayout(view:any,host:HTMLElement|null,settings:ReaderSettings,fontUrl:string,updateStyles=true){
  if(!view||!host)return;
  const width=Math.max(320,host.clientWidth),double=settings.flow==="paginated"&&settings.spread==="double"&&width>=700;
  if(view.renderer.getAttribute("flow")!==settings.flow)view.renderer.setAttribute("flow",settings.flow);
  const gapPercent=double?6:0;
  const maxInline=double?Math.max(280,Math.floor(width*(100-gapPercent)/200)):width;
  const attributes={gap:`${gapPercent}%`,edge:"0px","max-column-count":double?"2":"1","max-inline-size":`${maxInline}px`};
  for(const [name,value] of Object.entries(attributes))if(view.renderer.getAttribute(name)!==value)view.renderer.setAttribute(name,value);
  if(updateStyles)view.renderer.setStyles(foliateStyles(settings,fontUrl));
}

function FoliateEpubReader({source,bookId,settings,initialLocation,annotations,onApi,onLocation,onToc,onSelection,onEdgeCue,onToggleUi}:Props){
  const host=useRef<HTMLDivElement>(null),viewRef=useRef<any>(null),annotationsRef=useRef(annotations),settingsRef=useRef(settings);
  const callbacksRef=useRef({onLocation,onToc,onSelection,onEdgeCue,onToggleUi});
  const currentLocator=useRef(initialLocation),tocRef=useRef<TocItem[]>([]),searchCueTimer=useRef<number|null>(null);
  const initGuard=useRef(false);
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading"),[error,setError]=useState("");
  useEffect(()=>{annotationsRef.current=annotations},[annotations]);
  useEffect(()=>{settingsRef.current=settings},[settings]);
  useEffect(()=>{callbacksRef.current={onLocation,onToc,onSelection,onEdgeCue,onToggleUi}},[onLocation,onToc,onSelection,onEdgeCue,onToggleUi]);

  useEffect(()=>{
    // Guard against React Strict Mode double-invocation
    if(initGuard.current)return;
    initGuard.current=true;
    let cancelled=false,view:any;
    let activeDocumentCleanup:(()=>void)|null=null;
    let wheelPoller:number|undefined;
    let onPaginatorLoad:((event:any)=>void)|undefined;
    let hostWheel:((e:WheelEvent)=>void)|undefined;
    let fontBlobUrl="/vendor/lxgw-wenkai.woff2";
    let markReady:()=>void;
    const readySignal=new Promise<void>(resolve=>{markReady=resolve});
    (async()=>{
      console.log("[Papery] EPUB init: start");
      const [fontUrl,[{Overlayer},buffer]]=await withTimeout(Promise.all([getEpubFontBlobUrl(),Promise.all([import("foliate-js/overlayer.js"),readSource(source)])]),20000,"加载 EPUB 模块与文件");
      fontBlobUrl=fontUrl;
      console.log("[Papery] EPUB init: source loaded, buffer size=",buffer.byteLength);
      if(settingsRef.current.fontFamily==="lxgw")loadEpubFontBuffer().catch(()=>undefined);
      await withTimeout(import("foliate-js/view.js"),15000,"导入分页引擎");
      console.log("[Papery] EPUB init: view.js imported");
      if(cancelled||!host.current)return;
      view=document.createElement("foliate-view") as any;
      view.className="foliateView";
      host.current.append(view);viewRef.current=view;
      if(settingsRef.current.fontFamily==="lxgw")preloadEpubFont();
      await withTimeout(view.open(new File([buffer],`${bookId}.epub`,{type:"application/epub+zip"})),20000,"解析 EPUB 结构");
      console.log("[Papery] EPUB init: book opened, sections=",view.book?.sections?.length);
      if(cancelled)return;

      const renderer=view.renderer;
      renderer.setAttribute("flow","paginated");
      renderer.setAttribute("margin","0px");
      renderer.setAttribute("max-block-size","9999px");
      applyFoliateLayout(view,host.current,settingsRef.current,fontBlobUrl);

      const rawToc=flattenToc(view.book.toc||[]);
      const fractions=view.getSectionFractions?.()||[];
      const toc=rawToc;
      tocRef.current=toc;callbacksRef.current.onToc(toc);
      void saveSetting(`analysis:${bookId}`,{totalPages:Math.max(1,view.book.sections?.length||1),analyzedAt:Date.now(),pagination:"foliate-locations"});

      const pulseHighlight=(rects:any[],options:any)=>{const element=Overlayer.highlight(rects,{...options,padding:2}),outline=Overlayer.outline(rects,{color:"#ef8c2f",width:2,padding:3,radius:3});element.append(outline);element.style.opacity=".82";element.style.mixBlendMode="multiply";requestAnimationFrame(()=>element.animate?.([{opacity:.42,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"},{opacity:1,filter:"drop-shadow(0 0 5px rgba(240,145,43,.58))"},{opacity:.42,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"}],{duration:900,iterations:6,easing:"ease-in-out"}));return element};
      const drawAnnotation=(event:any)=>{const {draw,annotation,doc}=event.detail;const writingMode=doc?.defaultView?.getComputedStyle(doc.documentElement).writingMode,options={color:annotation.color||"#f1a052",writingMode};draw(String(annotation.id||"").startsWith("papery-cue-")?pulseHighlight:annotation.style==="underline"?Overlayer.underline:Overlayer.highlight,options)};
      const addVisibleAnnotations=(index:number)=>{for(const annotation of annotationsRef.current){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type!=="epub"||!loc.cfi||annotation.style==="bookmark")continue;try{if(view.resolveNavigation(loc.cfi)?.index===index)void view.addAnnotation({value:loc.cfi,style:annotation.style,color:annotation.color,id:annotation.id})}catch{}}};
      // NOTE: do NOT call section.load()/unload() manually here. foliate-js's Loader
      // ref-counts blob URLs of shared resources (CSS/fonts) across chapters; external
      // load/unload calls unbalance the counts and cause revokeObjectURL on resources
      // still used by the displayed chapter (blank content / page reset crashes).
      let navigation=Promise.resolve();
      const safeNavigate=(direction:"next"|"prev")=>{
        navigation=navigation.then(async()=>{if(cancelled)return;await withTimeout(direction==="next"?view.next():view.prev(),15000,"翻页");}).catch(reason=>{if(!cancelled){console.warn("[Papery] navigation failed",reason);setError("翻页失败，请返回书库后重新打开");}});
        return navigation;
      };
      // ROBUST WHEEL v3: Triple-redundant wheel attachment.
      // Root cause: iframe wheel events do NOT bubble to the parent document.
      // The wheel listener MUST be on each iframe's contentDocument. The old
      // approach relied solely on foliate-view's re-dispatched 'load' event;
      // if view.js's intermediate handler failed, no wheel listener was attached
      // and scrolling permanently stopped while buttons (API calls) still worked.
      // Fix: (1) listen on the paginator's 'load' event DIRECTLY (bypasses
      // view.js), (2) keep foliate-view 'load' listener, (3) 120ms poller backup.
      const wheelDocs=new WeakSet<Document>();
      let wheelLocked=false;
      const handleWheelDoc=(doc:Document|null|undefined)=>{if(!doc||wheelDocs.has(doc))return;wheelDocs.add(doc);const onWheel=(e:WheelEvent)=>{if(settingsRef.current.flow!=="paginated"||e.ctrlKey||Math.abs(e.deltaY)<14)return;e.preventDefault();if(wheelLocked)return;e.preventDefault();wheelLocked=true;void safeNavigate(e.deltaY>0?"next":"prev").finally(()=>window.setTimeout(()=>{wheelLocked=false},150));window.setTimeout(()=>{wheelLocked=false},800)};doc.addEventListener("wheel",onWheel,{passive:false})};
      onPaginatorLoad=(event:any)=>{try{handleWheelDoc(event.detail?.doc)}catch{}};
      view.renderer.addEventListener("load",onPaginatorLoad);
      wheelPoller=window.setInterval(()=>{try{handleWheelDoc(view?.renderer?.getContents?.()?.[0]?.doc)}catch{}},120);
      const onOverlay=(event:any)=>queueMicrotask(()=>addVisibleAnnotations(event.detail.index));
      const onRelocate=(event:any)=>{try{const detail=event.detail||{},cfi=detail.cfi;if(cancelled||!cfi)return;markReady();const fraction=Number.isFinite(detail.fraction)?detail.fraction:0,locator=JSON.stringify({type:"epub",cfi,fraction});currentLocator.current=locator;const total=Math.max(1,detail.location?.total||view.book.sections?.length||1),page=Math.min(total,Math.max(1,(detail.location?.current||0)+1));const chapterTitle=detail.tocItem?.label||"正文";let chapterIndex=tocRef.current.findIndex(item=>item.label===chapterTitle);if(chapterIndex<0)chapterIndex=0;callbacksRef.current.onLocation({locator,progress:Math.max(0,Math.min(100,fraction*100)),page,totalPages:total,chapterTitle,chapterIndex,chapterCount:Math.max(1,tocRef.current.length)})}catch(e){console.warn("[Papery] relocate error:",e)}};
      const onLoad=(event:any)=>{
        activeDocumentCleanup?.();
        const {doc,index}=event.detail;let selectionGuard=0;
        for(const svg of doc.querySelectorAll("svg")){
          if(svg.hasAttribute("viewbox")&&!svg.hasAttribute("viewBox"))svg.setAttribute("viewBox",svg.getAttribute("viewbox"));
          if(svg.hasAttribute("preserveaspectratio"))svg.setAttribute("preserveAspectRatio",svg.getAttribute("preserveaspectratio"));
          svg.style.maxHeight=`${host.current?.clientHeight||600}px`;
        }
        handleWheelDoc(doc);
        void applyEpubDocumentFont(doc,settingsRef.current);
        const prevZone=.25,nextZone=.75;
        const pointerRatio=(event:MouseEvent)=>{const bounds=host.current?.getBoundingClientRect(),frame=(doc.defaultView?.frameElement as HTMLElement|null)?.getBoundingClientRect();return bounds&&frame?(frame.left+event.clientX-bounds.left)/Math.max(1,bounds.width):event.clientX/Math.max(1,doc.defaultView?.innerWidth||1)};
        const click=(event:MouseEvent)=>{if(event.defaultPrevented||Date.now()<selectionGuard||doc.getSelection()?.toString()||(event.target as Element|null)?.closest?.("a,button,input,select,textarea"))return;const ratio=pointerRatio(event);if(settingsRef.current.flow==="scrolled"){if(ratio>=prevZone&&ratio<nextZone)callbacksRef.current.onToggleUi?.();return;}if(ratio<prevZone)void safeNavigate("prev");else if(ratio>=nextZone)void safeNavigate("next");else callbacksRef.current.onToggleUi?.()};
        const move=(event:MouseEvent)=>{const ratio=pointerRatio(event);callbacksRef.current.onEdgeCue?.(ratio<prevZone?"left":ratio>=nextZone?"right":null)};
        const leave=()=>callbacksRef.current.onEdgeCue?.(null);
        const select=()=>{window.setTimeout(()=>{const selection=doc.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),quote=selection.toString().trim();if(!quote)return;selectionGuard=Date.now()+450;const cfi=view.getCFI(index,range),rect=range.getBoundingClientRect(),bounds=host.current?.getBoundingClientRect(),anchor=rangeAnchorContext(range);callbacksRef.current.onSelection({quote,locator:JSON.stringify({type:"epub",cfi,sectionIndex:index,...anchor,quote}),rect:{x:(bounds?.left||0)+rect.left,y:(bounds?.top||0)+rect.top,width:rect.width,height:rect.height}});selection.removeAllRanges()},0)};
        let touchStartX=0,touchStartY=0;
        const touchStart=(e:TouchEvent)=>{touchStartX=e.touches[0]?.clientX||0;touchStartY=e.touches[0]?.clientY||0};
        const touchEnd=(e:TouchEvent)=>{const dx=(e.changedTouches[0]?.clientX||0)-touchStartX,dy=(e.changedTouches[0]?.clientY||0)-touchStartY;if(Math.abs(dx)>12||Math.abs(dy)>12)selectionGuard=Date.now()+500;else select();};
        const key=(event:KeyboardEvent)=>{if((event.target as Element)?.closest?.("input,textarea,select,[contenteditable=true]"))return;const forwarded=new KeyboardEvent("keydown",{key:event.key,code:event.code,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,cancelable:true});if(!window.dispatchEvent(forwarded))event.preventDefault();};doc.addEventListener("keydown",key);doc.addEventListener("click",click);doc.addEventListener("mousemove",move);doc.addEventListener("mouseleave",leave);doc.addEventListener("mouseup",select);doc.addEventListener("touchstart",touchStart,{passive:true});doc.addEventListener("touchend",touchEnd,{passive:true});
        activeDocumentCleanup=()=>{doc.removeEventListener("keydown",key);doc.removeEventListener("click",click);doc.removeEventListener("mousemove",move);doc.removeEventListener("mouseleave",leave);doc.removeEventListener("mouseup",select);doc.removeEventListener("touchstart",touchStart);doc.removeEventListener("touchend",touchEnd)};
        addVisibleAnnotations(index);
      };
      view.addEventListener("draw-annotation",drawAnnotation);view.addEventListener("create-overlay",onOverlay);view.addEventListener("relocate",onRelocate);view.addEventListener("load",onLoad);
      // Host div wheel fallback (covers margin/gap areas outside the iframe)
      hostWheel=(e:WheelEvent)=>{if(settingsRef.current.flow!=="paginated"||e.ctrlKey||Math.abs(e.deltaY)<14)return;e.preventDefault();if(wheelLocked)return;e.preventDefault();wheelLocked=true;void safeNavigate(e.deltaY>0?"next":"prev").finally(()=>window.setTimeout(()=>{wheelLocked=false},150));window.setTimeout(()=>{wheelLocked=false},800)};
      host.current?.addEventListener("wheel",hostWheel,{passive:false});

      // Initialize the view - use relocate event as the primary ready signal
      const target=foliateLocator(currentLocator.current);
      console.log("[Papery] EPUB init: calling view.init, target=",target);
      // Fire init but don't block on it - the relocate event will signal readiness
      view.init({lastLocation:target,showTextStart:true}).catch((e:any)=>{console.warn("[Papery] view.init error (non-fatal):",e);void view.next().catch(()=>undefined)});
      // Wait for the first relocate event (content actually displayed) with timeout fallback
      await Promise.race([readySignal,new Promise(resolve=>setTimeout(resolve,8000))]);
      console.log("[Papery] EPUB init: content ready");
      if(cancelled)return;
      setStatus("ready");
      const findQuote=async(quote:string,preferredIndex?:number,prefix?:string,suffix?:string)=>{const candidates:{cfi:string;index:number;score:number}[]=[];for await(const item of view.search({query:quote})){if(item==="done")break;for(const match of item?.subitems||[]){if(!match?.cfi)continue;let index=-1;try{index=view.resolveNavigation(match.cfi)?.index??-1}catch{}const pre=String(match.excerpt?.pre||""),post=String(match.excerpt?.post||"");candidates.push({cfi:match.cfi,index,score:(index===preferredIndex?1000000:0)+(prefix?matchingPrefix(prefix,pre)*1000:0)+(suffix?matchingSuffix(suffix,post)*1000:0)})}}view.clearSearch();return candidates.sort((a,b)=>b.score-a.score)[0]?.cfi||null};
      const showCue=async(cfi:string,annotation?:ReaderAnnotation)=>{await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));await view.addAnnotation({value:cfi,style:"highlight",color:"#ffad33",id:"papery-cue-target"});if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);searchCueTimer.current=window.setTimeout(()=>{searchCueTimer.current=null;void view.deleteAnnotation({value:cfi});if(annotation&&annotation.style!=="bookmark")void view.addAnnotation({value:cfi,style:annotation.style,color:annotation.color,id:annotation.id})},6500)};
      const goTo=async(locator:string)=>{const parsed=parseLocator<{cfi?:string;href?:string;fraction?:number;search?:boolean;anchor?:boolean;annotationId?:string;quote?:string;prefix?:string;suffix?:string;sectionIndex?:number}>(locator),fallback=foliateLocator(locator);if(fallback==null)return;const annotation=annotationsRef.current.find(item=>item.id===parsed?.annotationId||item.locator===locator||(parsed?.cfi&&parseLocator<{cfi?:string}>(item.locator)?.cfi===parsed.cfi));let cfi=parsed?.cfi;if(parsed?.anchor&&parsed.quote){let preferred=parsed.sectionIndex;try{preferred??=parsed.cfi?view.resolveNavigation(parsed.cfi)?.index:undefined}catch{}cfi=await findQuote(parsed.quote,preferred,parsed.prefix,parsed.suffix)||cfi}const resolvedTarget=cfi||fallback,resolved=await view.goTo(resolvedTarget);if(!resolved)return;if((parsed?.search||parsed?.anchor)&&cfi)await showCue(cfi,annotation);else if(annotation&&annotation.style!=="bookmark"&&cfi){await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));await view.addAnnotation({value:cfi,style:annotation.style,color:annotation.color,id:annotation.id})}};
      const search=async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim();if(!needle)return[];const results:ReaderSearchResult[]=[];for await(const item of view.search({query:needle})){if(item==="done"||!item?.subitems)continue;for(const match of item.subitems){if(results.length>=100)break;let sectionIndex=0;try{sectionIndex=view.resolveNavigation(match.cfi)?.index??0}catch{}const excerpt=match.excerpt?.pre+match.excerpt?.match+match.excerpt?.post||String(match.excerpt||"").replace(/\s+/g," ");results.push({id:`foliate-search-${results.length}`,label:item.label||"正文",excerpt,locator:JSON.stringify({type:"epub",cfi:match.cfi,quote:needle,prefix:String(match.excerpt?.pre||"").slice(-48),suffix:String(match.excerpt?.post||"").slice(0,48),sectionIndex,search:true}),page:Math.max(1,sectionIndex+1)})}if(results.length>=100)break}return results};
      onApi({next:()=>{void safeNavigate("next")},prev:()=>{void safeNavigate("prev")},goTo:(locator:string)=>{navigation=navigation.then(()=>cancelled?undefined:goTo(locator)).catch(reason=>console.warn("[Papery] jump failed",reason));},search});
    })().catch(reason=>{if(!cancelled){console.error("[Papery] EPUB init error:",reason);setError(reason instanceof Error?reason.message:"EPUB 分页器初始化失败");setStatus("error")}});
    return()=>{cancelled=true;initGuard.current=false;onApi(null);callbacksRef.current.onEdgeCue?.(null);activeDocumentCleanup?.();if(wheelPoller!==undefined)window.clearInterval(wheelPoller);if(onPaginatorLoad)try{view?.renderer?.removeEventListener?.("load",onPaginatorLoad)}catch{}if(hostWheel)host.current?.removeEventListener("wheel",hostWheel);if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);try{view?.close?.();view?.book?.destroy?.();view?.remove?.()}catch{}if(viewRef.current===view)viewRef.current=null};
  },[source,bookId,onApi]);

  useEffect(()=>{const view=viewRef.current,element=host.current;if(!view||!element||status!=="ready")return;getEpubFontBlobUrl().then(fontUrl=>{applyFoliateLayout(view,element,settings,fontUrl);const doc=view.renderer.getContents?.()[0]?.doc as Document|undefined;if(doc)void applyEpubDocumentFont(doc,settings)});let frame=0,lastWidth=element.clientWidth;const observer=new ResizeObserver(()=>{const width=element.clientWidth;if(Math.abs(width-lastWidth)<1)return;lastWidth=width;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>getEpubFontBlobUrl().then(fontUrl=>applyFoliateLayout(view,element,settings,fontUrl,false)))});observer.observe(element);return()=>{cancelAnimationFrame(frame);observer.disconnect()}},[settings,status]);
  useEffect(()=>{const view=viewRef.current;if(!view||status!=="ready")return;const previous=(view.__paperyAnnotations||[]) as ReaderAnnotation[];for(const annotation of previous){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type==="epub"&&loc.cfi)void view.deleteAnnotation({value:loc.cfi})}view.__paperyAnnotations=annotations;const contents=view.renderer.getContents?.()||[];for(const content of contents){const idx=content.index;if(typeof idx!=="number")continue;setTimeout(()=>{for(const annotation of annotations){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type!=="epub"||!loc.cfi||annotation.style==="bookmark")continue;try{if(view.resolveNavigation(loc.cfi)?.index===idx)void view.addAnnotation({value:loc.cfi,style:annotation.style,color:annotation.color,id:annotation.id})}catch{}}},200)}},[annotations,status]);

  const {horizontal:rawHorizontal,vertical}=epubMargins(settings),horizontal=rawHorizontal;
  return <div className={`epubHost foliateHost flow-${settings.flow} spread-${settings.spread} texture-${settings.paperTexture}`} style={{background:settings.pageColor}}>
    <div ref={host} className="foliateRendition" style={{left:`${horizontal}%`,right:`${horizontal}%`,top:`${vertical}%`,bottom:`${vertical}%`}}/>
    {status==="loading"&&<div className="epubLoadingMinimal"><span/></div>}
    {status==="error"&&<div className="readerError"><strong>EPUB 打开失败</strong><p>{error}</p></div>}
  </div>;
}

type PdfRect={x:number;y:number;width:number;height:number};
type PdfLocator={type:"pdf";page:number;offset?:number;rects?:PdfRect[]};

function PdfPage({pdf,pageNumber,annotations,onSelection,onRendered,scaleHint,zoom,pageColor}:any){
  const canvas=useRef<HTMLCanvasElement>(null);
  const textLayer=useRef<HTMLDivElement>(null);
  const wrap=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:600,height:800});
  useEffect(()=>{
    let task:any,layer:any,cancelled=false;
    (async()=>{
      const page=await pdf.getPage(pageNumber);if(cancelled)return;
      const base=page.getViewport({scale:1});
      const cssScale=Math.max(.01,(scaleHint/base.width)*zoom);
      const cssViewport=page.getViewport({scale:cssScale});
      const dpr=Math.min(2,window.devicePixelRatio||1,Math.sqrt(12000000/Math.max(1,cssViewport.width*cssViewport.height)));
      const renderViewport=page.getViewport({scale:cssScale*dpr});
      const element=canvas.current!;
      element.width=Math.floor(renderViewport.width);element.height=Math.floor(renderViewport.height);
      element.style.width=`${cssViewport.width}px`;element.style.height=`${cssViewport.height}px`;
      setSize({width:cssViewport.width,height:cssViewport.height});
      task=page.render({canvasContext:element.getContext("2d")!,viewport:renderViewport});
      await task.promise;
      const pdfjs=await loadPdfJs();if(cancelled||!textLayer.current)return;
      textLayer.current.replaceChildren();
      textLayer.current.style.setProperty("--scale-factor",String(cssScale));
      const textContent=await page.getTextContent();if(cancelled)return;
      layer=new pdfjs.TextLayer({textContentSource:textContent,container:textLayer.current,viewport:cssViewport});
      await layer.render();
      if(!cancelled)onRendered?.(pageNumber);
    })().catch(reason=>{if(!cancelled)console.warn("[Papery] PDF render failed",reason)});
    return()=>{cancelled=true;task?.cancel?.();layer?.cancel?.()};
  },[pdf,pageNumber,scaleHint,zoom,onRendered]);

  const pageMarks=annotations.flatMap((annotation:ReaderAnnotation)=>{const loc=parseLocator<PdfLocator>(annotation.locator);return loc?.type==="pdf"&&loc.page===pageNumber?(loc.rects||[]).map(rect=>({annotation,rect})):[]});
  const select=()=>{
    const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount||!wrap.current)return;
    const range=selection.getRangeAt(0),base=wrap.current.getBoundingClientRect();
    const rects=Array.from(range.getClientRects()).filter(rect=>rect.width>1&&rect.height>1&&rect.bottom>base.top&&rect.top<base.bottom).map(rect=>({
      x:Math.max(0,(rect.left-base.left)/base.width),y:Math.max(0,(rect.top-base.top)/base.height),
      width:Math.min(1,(rect.width/base.width)),height:Math.min(1,(rect.height/base.height))
    }));
    if(!rects.length)return;
    const rect=range.getBoundingClientRect();
    onSelection({quote:selection.toString().trim(),locator:JSON.stringify({type:"pdf",page:pageNumber,rects}),rect:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}});
    selection.removeAllRanges();
  };
  return <div ref={wrap} className="pdfPage" data-pdf-page={pageNumber} style={{width:size.width,height:size.height,background:pageColor}} onMouseUp={select} onTouchEnd={select}>
    <canvas ref={canvas}/><div ref={textLayer} className="pdfTextLayer"/>
    {pageMarks.map(({annotation,rect}:any,index:number)=><span key={`${annotation.id}-${index}`} className={`pdfAnnotation ${annotation.style}`} style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`,"--mark-color":annotation.color} as React.CSSProperties}/>)}
  </div>;
}

function PdfReader({source,bookId,settings,initialLocation,annotations,onApi,onLocation,onToc,onSelection}:Props){
  const host=useRef<HTMLDivElement>(null);
  const pinch=useRef(0);
  const drag=useRef<{x:number;y:number;left:number;top:number;moved:boolean}|null>(null);
  const suppressClick=useRef(0);
  const restoring=useRef(true);
  const [initialPage]=useState(()=>Math.max(1,Math.floor(parseLocator<PdfLocator>(initialLocation)?.page||1)));
  const [pageOffset,setPageOffset]=useState(()=>Math.max(0,Math.min(.99,parseLocator<PdfLocator>(initialLocation)?.offset||0)));
  const [pageRatios,setPageRatios]=useState<number[]>([]);
  const [panning,setPanning]=useState(false);
  const [hostWidth,setHostWidth]=useState(900);
  const [hostHeight,setHostHeight]=useState(700);
  const [layoutReady,setLayoutReady]=useState(false);
  const [firstPageReady,setFirstPageReady]=useState(false);
  const [pdf,setPdf]=useState<any>(null);
  const [page,setPage]=useState(initialPage);
  const pageRef=useRef(page);
  useEffect(()=>{pageRef.current=page},[page]);
  const [toc,setToc]=useState<TocItem[]>([]);
  const [zoom,setZoom]=useState(1);
  const [fitMode,setFitMode]=useState<"width"|"page"|"custom">("width");
  const [pageRatio,setPageRatio]=useState(1.414);
  const [renderRadius,setRenderRadius]=useState(0);
  const [error,setError]=useState("");
  const textCache=useRef(new Map<number,string>());
  const handlePageRendered=useCallback(()=>setFirstPageReady(true),[]);
  useEffect(()=>{const element=host.current;if(!element||!pdf)return;const update=()=>{setHostWidth(Math.max(320,element.clientWidth));setHostHeight(Math.max(320,element.clientHeight));setLayoutReady(true)};const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect()},[pdf]);
  useEffect(()=>{let doc:any,cancelled=false,timer=0;(async()=>{const [pdfjs,buffer]=await Promise.all([loadPdfJs(),readSource(source)]);pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.min.mjs";doc=await pdfjs.getDocument({data:buffer.slice(0)}).promise;if(cancelled){await doc.destroy();return;}const ratios:number[]=[];for(let start=1;start<=doc.numPages;start+=12){if(cancelled){await doc.destroy();return;}ratios.push(...await Promise.all(Array.from({length:Math.min(12,doc.numPages-start+1)},async(_,i)=>{const p=await doc.getPage(start+i),v=p.getViewport({scale:1});return v.height/v.width})));}if(cancelled)return;setPageRatios(ratios);setPage(Math.min(initialPage,doc.numPages));setPdf(doc);void saveSetting(`analysis:${bookId}`,{totalPages:doc.numPages,analyzedAt:Date.now()});const first=await doc.getPage(1),viewport=first.getViewport({scale:1});setPageRatio(viewport.height/viewport.width);timer=window.setTimeout(()=>setRenderRadius(1),160);const outline=await doc.getOutline();const result:TocItem[]=[];const walk=async(items:any[],level=0)=>{for(const item of items||[]){let pageNumber=1;try{const dest=typeof item.dest==="string"?await doc.getDestination(item.dest):item.dest;if(dest?.[0])pageNumber=await doc.getPageIndex(dest[0])+1}catch{}result.push({id:`pdf-${result.length}`,label:item.title||`第 ${pageNumber} 页`,level,page:pageNumber,locator:JSON.stringify({type:"pdf",page:pageNumber})});await walk(item.items||[],level+1)}};await walk(outline||[]);if(!result.length){for(let value=1;value<=doc.numPages;value++)result.push({id:`pdf-${value}`,label:`第 ${value} 页`,level:0,page:value,locator:JSON.stringify({type:"pdf",page:value})})}setToc(result);onToc(result)})().catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"PDF 解析失败")});return()=>{cancelled=true;clearTimeout(timer);doc?.destroy?.()}},[source,bookId,onToc]);
  const widthHint=Math.max(260,Math.min(1200,hostWidth));
  const pageHint=Math.max(240,Math.min(widthHint,hostHeight/pageRatio));
  const scaleHint=fitMode==="page"?pageHint:widthHint;
  const offsets=useMemo(()=>pdfPageOffsets(pageRatios,scaleHint*zoom),[pageRatios,scaleHint,zoom]);
  const slotHeight=scaleHint*zoom*(pageRatios[page-1]||pageRatio)+24;
  const pageWidth=scaleHint*zoom;
  const trackWidth=pageWidth>hostWidth?pageWidth+32:hostWidth;
  useLayoutEffect(()=>{if(!pdf||!layoutReady||!restoring.current)return;const frame=requestAnimationFrame(()=>{const element=host.current;if(!element)return;const bounded=Math.min(initialPage,pdf.numPages);element.scrollTop=(offsets[bounded-1]||0)+pageOffset*(offsets[bounded]-offsets[bounded-1]);element.scrollLeft=Math.max(0,(trackWidth-element.clientWidth)/2);requestAnimationFrame(()=>{restoring.current=false;setPage(Math.min(initialPage,pdf.numPages))})});return()=>cancelAnimationFrame(frame)},[pdf,layoutReady,initialPage,slotHeight,trackWidth,offsets,pageOffset]);
  const scrollToPage=useCallback((target:number,behavior:ScrollBehavior="instant")=>{const bounded=Math.min(pdf?.numPages||target,Math.max(1,target));pageRef.current=bounded;setPage(bounded);setPageOffset(0);requestAnimationFrame(()=>host.current?.scrollTo({top:offsets[bounded-1]||0,behavior}))},[pdf,offsets]);
  const goTo=useCallback((locator:string)=>{const target=parseLocator<PdfLocator>(locator);if(!target||!pdf)return;restoring.current=false;scrollToPage(target.page);const bounded=Math.min(pdf.numPages,Math.max(1,target.page)),fraction=Math.max(0,Math.min(.99,target.offset??((target.rects?.[0]?.y||0)-.15)));requestAnimationFrame(()=>{if(host.current)host.current.scrollTop=offsets[bounded-1]+fraction*(offsets[bounded]-offsets[bounded-1]);});},[scrollToPage,pdf,offsets]);
  const next=useCallback(()=>scrollToPage(pageRef.current+1),[scrollToPage]);
  const prev=useCallback(()=>scrollToPage(pageRef.current-1),[scrollToPage]);
  const search=useCallback(async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim().toLocaleLowerCase();if(!pdf||!needle)return[];const results:ReaderSearchResult[]=[];for(let start=1;start<=pdf.numPages&&results.length<100;start+=6){const numbers=Array.from({length:Math.min(6,pdf.numPages-start+1)},(_,index)=>start+index);const texts=await Promise.all(numbers.map(async pageNumber=>{const cached=textCache.current.get(pageNumber);if(cached!==undefined)return cached;const pdfPage=await pdf.getPage(pageNumber),content=await pdfPage.getTextContent();const value=content.items.map((item:any)=>item.str||"").join(" ");textCache.current.set(pageNumber,value);return value}));texts.forEach((value,index)=>{const lower=value.toLocaleLowerCase();let cursor=0;while(results.length<100){const found=lower.indexOf(needle,cursor);if(found<0)break;const pageNumber=numbers[index];results.push({id:`pdf-search-${pageNumber}-${found}`,label:`第 ${pageNumber} 页`,excerpt:value.slice(Math.max(0,found-34),Math.min(value.length,found+needle.length+52)).replace(/\s+/g," "),locator:JSON.stringify({type:"pdf",page:pageNumber}),page:pageNumber});cursor=found+Math.max(1,needle.length)}})}return results},[pdf]);
  useEffect(()=>{onApi({next,prev,goTo,search});return()=>onApi(null)},[next,prev,goTo,search,onApi]);
  useEffect(()=>{if(!pdf)return;let chapterIndex=0;toc.forEach((item,index)=>{const loc=parseLocator<PdfLocator>(item.locator);if((loc?.page||1)<=page)chapterIndex=index});onLocation({locator:JSON.stringify({type:"pdf",page,offset:pageOffset}),progress:page/pdf.numPages*100,page,totalPages:pdf.numPages,chapterTitle:toc[chapterIndex]?.label||`第 ${page} 页`,chapterIndex,chapterCount:toc.length})},[pdf,page,pageOffset,toc,onLocation]);
  if(error)return <div className="readerError"><strong>PDF 打开失败</strong><p>{error}</p></div>;
  if(!pdf)return <div className="pdfReaderShell" style={{background:settings.pageColor}}><div className="epubLoadingMinimal"><span/></div></div>;
  const first=Math.max(1,page-renderRadius),last=Math.min(pdf.numPages,page+renderRadius),pages=Array.from({length:last-first+1},(_,index)=>first+index);
  const preserveView=(nextWidth:number,nextSlotHeight:number)=>{const element=host.current;if(!element)return;const horizontal=(element.scrollLeft+element.clientWidth/2)/Math.max(1,trackWidth),within=(element.scrollTop-offsets[pageRef.current-1])/Math.max(1,offsets[pageRef.current]-offsets[pageRef.current-1]);requestAnimationFrame(()=>requestAnimationFrame(()=>{const current=host.current;if(!current)return;current.scrollLeft=Math.max(0,horizontal*Math.max(current.clientWidth,nextWidth+32)-current.clientWidth/2);current.scrollTop=Math.max(0,(pdfPageOffsets(pageRatios,nextWidth)[pageRef.current-1]||0)+within*(nextWidth*(pageRatios[pageRef.current-1]||pageRatio)+24))}))};
  const changeZoom=(nextZoom:number)=>{const next=Math.min(4,Math.max(.6,Math.round(nextZoom*10)/10)),nextWidth=widthHint*next,nextSlot=nextWidth*pageRatio+24;preserveView(nextWidth,nextSlot);setFitMode("custom");setZoom(next)};
  const fit=(mode:"width"|"page")=>{const nextWidth=mode==="page"?pageHint:widthHint;preserveView(nextWidth,nextWidth*pageRatio+24);setFitMode(mode);setZoom(1)};
  return <div className="pdfReaderShell"><div className="pdfZoomControls" onClick={event=>event.stopPropagation()}>
      <button onClick={()=>changeZoom(zoom-.1)} aria-label="缩小 PDF">−</button>
      <button className="zoomValue" onClick={()=>fit("width")} aria-label="恢复适合宽度">{Math.round(zoom*100)}%</button>
      <button onClick={()=>changeZoom(zoom+.1)} aria-label="放大 PDF">＋</button>
      <i/>
      <button className={fitMode==="width"?"active":""} onClick={()=>fit("width")}>适应宽度</button>
      <button className={fitMode==="page"?"active":""} onClick={()=>fit("page")}>适应页面</button>
    </div><div ref={host} className={`pdfHost pdfContinuous ${pageWidth>hostWidth?"zoomed canPan":""} ${panning?"panning":""}`}
    onScroll={event=>{if(restoring.current)return;const top=event.currentTarget.scrollTop,next=pageAtOffset(offsets,top);pageRef.current=next;setPage(next);setPageOffset(Math.max(0,Math.min(.99,(top-offsets[next-1])/Math.max(1,offsets[next]-offsets[next-1]))))}}
    onWheel={event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();changeZoom(zoom-event.deltaY*.002)}}}
    onTouchStart={event=>{if(event.touches.length===2)pinch.current=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY)}}
    onTouchMove={event=>{if(event.touches.length!==2||!pinch.current)return;const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);if(Math.abs(distance-pinch.current)>12){changeZoom(zoom+(distance>pinch.current ? .1 : -.1));pinch.current=distance}}}
    onTouchEnd={event=>{if(pinch.current){event.stopPropagation();pinch.current=0}}}
    onPointerDown={event=>{if(event.button!==0||pageWidth<=hostWidth||((event.target as HTMLElement).closest(".pdfTextLayer span")))return;drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop,moved:false};event.currentTarget.setPointerCapture(event.pointerId);setPanning(true)}}
    onPointerMove={event=>{const start=drag.current;if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>4)start.moved=true;event.currentTarget.scrollLeft=start.left-dx;event.currentTarget.scrollTop=start.top-dy}}
    onClickCapture={event=>{if(Date.now()<suppressClick.current)event.stopPropagation()}}
    onPointerUp={event=>{if(!drag.current)return;if(drag.current.moved)suppressClick.current=Date.now()+500;event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;setPanning(false)}}
    onPointerCancel={()=>{drag.current=null;setPanning(false)}} style={{background:settings.pageColor}}>
    <div className="pdfVirtualTrack" style={{width:trackWidth}}>
      <div style={{height:offsets[first-1]||0}}/>
      {pages.map(pageNumber=><div className="pdfSlot" style={{height:offsets[pageNumber]-offsets[pageNumber-1]}} key={pageNumber}><PdfPage pdf={pdf} pageNumber={pageNumber} annotations={annotations} onSelection={onSelection} onRendered={handlePageRendered} scaleHint={scaleHint} zoom={zoom} pageColor={settings.pageColor}/></div>)}
      <div style={{height:Math.max(0,(offsets[pdf.numPages]||0)-(offsets[last]||0))}}/>
    </div>
    {!firstPageReady&&<div className="epubLoadingMinimal"><span/></div>}
  </div></div>;
}
