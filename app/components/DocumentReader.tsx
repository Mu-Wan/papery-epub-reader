"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ReaderAnnotation, ReaderApi, ReaderLocation, ReaderSearchResult, ReaderSelection, ReaderSettings, TocItem,
} from "../lib/reader-types";
import { loadPdfJs } from "../lib/pdf-loader";
import { saveSetting } from "../lib/local-library";

const sourceBuffers=new Map<string,Promise<ArrayBuffer>>();
function readSource(source:string){let pending=sourceBuffers.get(source);if(!pending){pending=fetch(source).then(response=>{if(!response.ok)throw new Error("读取文件失败");return response.arrayBuffer()});sourceBuffers.set(source,pending);if(sourceBuffers.size>4)sourceBuffers.delete(sourceBuffers.keys().next().value!)}return pending}
export function warmReaderFormat(format:Props["format"]){if(format==="EPUB"){void import("epubjs");void import("foliate-js/view.js")}if(format==="PDF")void loadPdfJs()}

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
};

export type { ReaderApi } from "../lib/reader-types";

export function DocumentReader(props: Props) {
  if (props.format === "TXT") return <TxtReader {...props}/>;
  if (props.format === "EPUB") return <EpubReader {...props}/>;
  return <PdfReader {...props}/>;
}

function fontStack(font: ReaderSettings["fontFamily"]) {
  if (font === "lxgw") return '"LXGW WenKai", "霞鹜文楷", "Kaiti SC", serif';
  if (font === "serif") return 'Georgia, "Songti SC", "Noto Serif SC", serif';
  if (font === "sans") return 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  return 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
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
function loadEpubFontBuffer(){return epubFontBuffer??=(fetch("/vendor/lxgw-wenkai.woff2").then(response=>{if(!response.ok)throw new Error("字体读取失败");return response.arrayBuffer()}))}
function epubFontStack(font:ReaderSettings["fontFamily"]){return font==="lxgw"?'"Papery LXGW WenKai", "LXGW WenKai", "霞鹜文楷", "Kaiti SC", serif':fontStack(font)}
const epubFontUrl=typeof window!=="undefined"?new URL("/vendor/lxgw-wenkai.woff2",window.location.href).href:"/vendor/lxgw-wenkai.woff2";
function preloadEpubFont(){const pre=document.createElement("link");pre.rel="preload";pre.as="font";pre.type="font/woff2";pre.crossOrigin="anonymous";pre.href=epubFontUrl;document.head.append(pre)}
async function applyEpubDocumentFont(doc:Document,settings:ReaderSettings){
  let install=epubFontInstalls.get(doc);
  if(settings.fontFamily==="lxgw"&&!install){
    install=(async()=>{const FontFaceCtor=(doc.defaultView as any)?.FontFace??FontFace;let fontSource:string|ArrayBuffer;try{fontSource=await loadEpubFontBuffer()}catch{fontSource=`url("${epubFontUrl}") format("woff2")`}const face=new FontFaceCtor("Papery LXGW WenKai",fontSource,{style:"normal",weight:"100 900"});doc.fonts.add(face);await face.load()})();
    epubFontInstalls.set(doc,install);
  }
  let style=doc.getElementById("papery-reader-font") as HTMLStyleElement|null;
  if(!style){style=doc.createElement("style");style.id="papery-reader-font";(doc.head||doc.documentElement).append(style)}
  const stack=epubFontStack(settings.fontFamily);
  doc.documentElement.classList.add("papery-reader-document","papery-reader-typography");
  doc.body?.classList.add("papery-reader-body");
  style.textContent=`
    html.papery-reader-document.papery-reader-typography,html.papery-reader-document.papery-reader-typography body.papery-reader-body{background:${settings.pageColor}!important;color:#302d27!important;font-family:${stack}!important;font-size:${settings.fontSize}px!important;line-height:${settings.lineHeight}!important;font-synthesis:none!important;scrollbar-width:none!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body{box-sizing:border-box!important;margin:0!important;padding:0!important;max-width:none!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body *{font-family:inherit!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body>:is(main,article,section,div),html.papery-reader-document.papery-reader-typography body.papery-reader-body>:is(main,article,section,div)>:is(main,article,section,div){box-sizing:border-box!important;max-width:none!important;margin-inline:0!important;padding-inline:0!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body p{font-size:1em!important;line-height:${settings.lineHeight}!important;margin-bottom:${settings.paragraphSpacing}px!important;text-align:justify!important}
    html.papery-reader-document.papery-reader-typography body.papery-reader-body :is(img,svg,video){max-width:100%!important;height:auto!important}
    html.papery-reader-document.papery-reader-typography ::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}`;
  doc.documentElement.style.setProperty("font-family",stack,"important");
  doc.body?.style.setProperty("font-family",stack,"important");
  // CSS `body *{font-family:inherit!important}` already propagates font to all descendants.
  // `document.fonts.ready` can wait for layout. EPUB.js runs content hooks before
  // the iframe is attached, so awaiting it here deadlocks the first render.
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
  const chapterPattern = /^\s*((?:正文\s*)?第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[集卷部篇章节回幕]|chapter\s+\d+|序章|序言|前言|楔子|引子|后记|尾声|番外)(?:\s|[.、:：-]|$)/i;
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
  const nodesRef=useRef(new Map<number,HTMLElement>()),offsetRef=useRef(0),pageRef=useRef(0);
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
  const effectiveSpread=settings.flow==="scrolled"?"single":settings.spread,step=effectiveSpread==="double"?2:1;
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
  const pageForOffset=useCallback((offset:number)=>{const element=elementForOffset(offset),container=host.current;if(!element||!container)return 0;if(settings.flow==="scrolled")return 0;const paragraph=paragraphForOffset(offset),range=rangeAtOffset(element,Math.max(0,offset-(paragraph?.start||0))),rect=range.getBoundingClientRect(),bounds=container.getBoundingClientRect(),base=Math.floor(pageRef.current/step)*step,naturalLeft=rect.left-bounds.left+base*columnStride;return Math.max(0,Math.round((naturalLeft-horizontalPadding)/Math.max(1,columnStride)))},[elementForOffset,settings.flow,paragraphForOffset,rangeAtOffset,step,columnStride,horizontalPadding]);
  const visibleOffset=useCallback(()=>{const element=host.current;if(!element)return undefined;const bounds=element.getBoundingClientRect(),x=bounds.left+Math.min(element.clientWidth-8,Math.max(8,horizontalPadding+8));for(const ratio of [.03,.1,.2,.35,.5]){const probe=document.elementFromPoint(x,bounds.top+Math.max(8,verticalPadding)+Math.max(4,(element.clientHeight-verticalPadding*2)*ratio))?.closest<HTMLElement>("[data-txt-start]");if(probe)return Number(probe.dataset.txtStart)}return undefined},[horizontalPadding,verticalPadding]);
  const chapterForOffset=useCallback((offset:number)=>{let current=parsed.chapters[0];for(const chapter of parsed.chapters){if(chapter.offset<=offset)current=chapter;else break}return current},[parsed.chapters]);
  const reportLocation=useCallback((explicitOffset?:number)=>{if(reflowing.current)return;const active=sections[sectionIndex]||sections[0],fallback=(active?.start||0)+Math.round((pageRef.current/Math.max(1,sectionPages-1))*Math.max(0,(active?.end||0)-(active?.start||0))),offset=Math.min(parsed.normalized.length,Math.max(0,explicitOffset??fallback));offsetRef.current=offset;const chapter=chapterForOffset(offset),logicalPage=Math.min(logicalTotal,Math.floor(offset/1800)+1);onLocation({locator:JSON.stringify({type:"txt",offset}),progress:offset/Math.max(1,parsed.normalized.length)*100,page:logicalPage,totalPages:logicalTotal,chapterTitle:chapter.title,chapterIndex:chapter.index,chapterCount:parsed.chapters.length})},[sections,sectionIndex,sectionPages,parsed.normalized.length,parsed.chapters.length,logicalTotal,chapterForOffset,onLocation]);

  useLayoutEffect(()=>{const container=host.current,article=content.current,anchorSection=sectionForOffset(offsetRef.current);if(!text||!container||!article||anchorSection<renderStart||anchorSection>=renderEnd)return;reflowing.current=true;nodesRef.current=new Map(Array.from(article.querySelectorAll<HTMLElement>("[data-txt-start]")).map(element=>[Number(element.dataset.txtStart),element]));const anchor=Math.min(rangeEnd-1,Math.max(rangeStart,offsetRef.current));let nextTotal=1,target=0;if(settings.flow==="paginated"){nextTotal=Math.max(1,Math.round((article.scrollWidth+columnGap)/Math.max(1,columnStride)));target=Math.min(nextTotal-1,pageForOffset(anchor))}setSectionPages(nextTotal);pageRef.current=target;setPage(target);requestAnimationFrame(()=>{if(settings.flow==="scrolled"){const cue=jumpRequest.current?.cue?article.querySelector<HTMLElement>("[data-search-cue]"):null,targetElement=cue||elementForOffset(anchor);if(targetElement){const bounds=container.getBoundingClientRect(),targetBounds=targetElement.getBoundingClientRect(),top=container.scrollTop+targetBounds.top-bounds.top-container.clientHeight*.3;container.scrollTo({top:Math.max(0,top)})}}jumpRequest.current=null;reflowing.current=false;setLayoutEpoch(value=>value+1)})},[text,txtMarkup,jumpEpoch,sectionIndex,renderStart,renderEnd,rangeStart,rangeEnd,settings.flow,settings.fontFamily,settings.fontSize,settings.lineHeight,settings.paragraphSpacing,settings.horizontalMargin,settings.verticalMargin,settings.spread,viewport.width,viewport.height,columnGap,columnStride,verticalPadding,sectionForOffset,pageForOffset,elementForOffset]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>reportLocation(visibleOffset()));return()=>cancelAnimationFrame(frame)},[page,layoutEpoch,reportLocation,visibleOffset]);

  const goTo=useCallback((locator:string)=>{const target=parseLocator<PortableTextAnchor>(locator)||{},offset=resolveTextOffset(parsed.normalized,target),cue=Boolean(target.search||target.anchor);offsetRef.current=offset;jumpRequest.current={offset,cue};reportLocation(offset);if(cue){const quote=target.quote||parsed.normalized.slice(offset,target.end??offset+1),end=Math.min(parsed.normalized.length,offset+Math.max(1,quote.length));setSearchTarget({start:offset,end,nonce:Date.now()});if(searchTimer.current!==null)window.clearTimeout(searchTimer.current);searchTimer.current=window.setTimeout(()=>{searchTimer.current=null;setSearchTarget(null)},6500)}const targetSection=sectionForOffset(offset);if(targetSection!==sectionIndex)setSectionIndex(targetSection);else setJumpEpoch(value=>value+1)},[parsed.normalized,reportLocation,sectionForOffset,sectionIndex]);
  const next=useCallback(()=>{if(settings.flow==="scrolled"){host.current?.scrollBy({top:viewport.height*.88,behavior:"smooth"});return}if(pageRef.current+step<sectionPages){const target=pageRef.current+step;pageRef.current=target;setPage(target)}else if(sectionIndex<sections.length-1){offsetRef.current=sections[sectionIndex+1].start;setSectionIndex(sectionIndex+1)}},[settings.flow,viewport.height,step,sectionPages,sectionIndex,sections]);
  const prev=useCallback(()=>{if(settings.flow==="scrolled"){host.current?.scrollBy({top:-viewport.height*.88,behavior:"smooth"});return}if(pageRef.current-step>=0){const target=pageRef.current-step;pageRef.current=target;setPage(target)}else if(sectionIndex>0){offsetRef.current=Math.max(sections[sectionIndex-1].start,sections[sectionIndex-1].end-1);setSectionIndex(sectionIndex-1)}},[settings.flow,viewport.height,step,sectionIndex,sections]);
  const search=useCallback(async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim().toLocaleLowerCase();if(!needle)return[];const haystack=parsed.normalized.toLocaleLowerCase(),results:ReaderSearchResult[]=[];let cursor=0;while(results.length<100){const offset=haystack.indexOf(needle,cursor);if(offset<0)break;const end=offset+needle.length,chapter=chapterForOffset(offset),logicalPage=Math.floor(offset/1800)+1,anchor=textAnchorContext(parsed.normalized,offset,end);results.push({id:`txt-search-${offset}`,label:`${chapter.title} · 位置 ${logicalPage}`,excerpt:parsed.normalized.slice(Math.max(0,offset-30),Math.min(parsed.normalized.length,end+48)).replace(/\s+/g," "),locator:JSON.stringify({type:"txt",offset,end,search:true,...anchor}),page:logicalPage});cursor=offset+Math.max(1,needle.length)}return results},[parsed.normalized,chapterForOffset]);
  useEffect(()=>{onApi({next,prev,goTo,search});return()=>onApi(null)},[next,prev,goTo,search,onApi]);

  const select=()=>{const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),startEl=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest<HTMLElement>("[data-txt-start]"),endEl=(range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement)?.closest<HTMLElement>("[data-txt-start]");if(!startEl||!endEl)return;const within=(root:HTMLElement,node:Node,offset:number)=>{const probe=document.createRange();probe.selectNodeContents(root);try{probe.setEnd(node,offset)}catch{return 0}return probe.toString().length};const rawStart=Number(startEl.dataset.txtStart)+within(startEl,range.startContainer,range.startOffset),rawEnd=Number(endEl.dataset.txtStart)+within(endEl,range.endContainer,range.endOffset),start=Math.min(rawStart,rawEnd),end=Math.max(rawStart,rawEnd),rect=range.getBoundingClientRect(),anchor=textAnchorContext(parsed.normalized,start,end);onSelection({quote:selection.toString().trim(),locator:JSON.stringify({type:"txt",start,end,...anchor}),rect:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}});selection.removeAllRanges()};
  if(loading)return <div className="readerLoading"><span/><p>正在读取 TXT…</p></div>;
  if(error)return <div className="readerError"><strong>TXT 打开失败</strong><p>{error}</p></div>;
  const base=effectiveSpread==="double"?Math.floor(page/2)*2:page;
  const contentStyle=settings.flow==="paginated"?{fontFamily:fontStack(settings.fontFamily),fontSize:settings.fontSize,lineHeight:settings.lineHeight,width:usableWidth,height:usableHeight,marginTop:verticalPadding,marginLeft:horizontalPadding,columnWidth:usableWidth,columnGap,transform:`translateX(${-base*columnStride}px)`,"--paragraph-spacing":`${settings.paragraphSpacing}px`}:{fontFamily:fontStack(settings.fontFamily),fontSize:settings.fontSize,lineHeight:settings.lineHeight,padding:`${verticalPadding}px ${horizontalPadding}px`,"--paragraph-spacing":`${settings.paragraphSpacing}px`};
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
function epubTheme(settings:ReaderSettings){
  return {
    html:{background:`${settings.pageColor} !important`,"scrollbar-width":"none !important",overflow:settings.flow==="paginated"?"hidden !important":"visible !important"},
    body:{background:`${settings.pageColor} !important`,color:"#302d27 !important",padding:"0 !important",margin:"0 !important","box-sizing":"border-box !important","max-width":"none !important","font-family":`${epubFontStack(settings.fontFamily)} !important`,overflow:settings.flow==="paginated"?"hidden !important":"visible !important"},
    "body *":{"font-family":"inherit !important"},
    "::-webkit-scrollbar":{display:"none !important"},
    p:{"font-size":`${settings.fontSize}px !important`,"line-height":`${settings.lineHeight} !important`,"margin-bottom":`${settings.paragraphSpacing}px !important`,"text-align":"justify !important"},
    img:{"max-width":"100% !important","height":"auto !important"}
  };
}
function epubSettingsKey(settings:ReaderSettings){return [settings.fontFamily,settings.fontSize,settings.lineHeight,settings.paragraphSpacing,settings.pageColor,settings.horizontalMargin,settings.verticalMargin,settings.spread].join("|")}

function EpubReader(props:Props){
  return props.settings.flow==="paginated"?<FoliateEpubReader {...props}/>:<EpubScrollReader {...props}/>;
}

function foliateStyles(settings:ReaderSettings){
  return `
    @font-face{font-family:"Papery LXGW WenKai";font-style:normal;font-weight:100 900;font-display:optional;src:url("${epubFontUrl}") format("woff2")}
    :root{--theme-bg-color:${settings.pageColor};background:${settings.pageColor}!important;color:#302d27!important;scrollbar-width:none!important}
    html,body{background:${settings.pageColor}!important;color:#302d27!important;scrollbar-width:none!important}
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

function applyFoliateLayout(view:any,host:HTMLElement|null,settings:ReaderSettings,updateStyles=true){
  if(!view||!host)return;
  const width=Math.max(320,host.clientWidth),double=settings.spread==="double";
  const gapPercent=double?6:0;
  const maxInline=double?Math.max(280,Math.floor(width*(100-gapPercent)/200)):width;
  const attributes={gap:`${gapPercent}%`,edge:"0px","max-column-count":double?"2":"1","max-inline-size":`${maxInline}px`};
  for(const [name,value] of Object.entries(attributes))if(view.renderer.getAttribute(name)!==value)view.renderer.setAttribute(name,value);
  if(updateStyles)view.renderer.setStyles(foliateStyles(settings));
}

function FoliateEpubReader({source,bookId,settings,initialLocation,annotations,onApi,onLocation,onToc,onSelection,onEdgeCue}:Props){
  const host=useRef<HTMLDivElement>(null),viewRef=useRef<any>(null),annotationsRef=useRef(annotations),settingsRef=useRef(settings);
  const callbacksRef=useRef({onLocation,onToc,onSelection,onEdgeCue});
  const currentLocator=useRef(initialLocation),tocRef=useRef<TocItem[]>([]),searchCueTimer=useRef<number|null>(null);
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading"),[error,setError]=useState("");
  useEffect(()=>{annotationsRef.current=annotations},[annotations]);
  useEffect(()=>{settingsRef.current=settings},[settings]);
  useEffect(()=>{callbacksRef.current={onLocation,onToc,onSelection,onEdgeCue}},[onLocation,onToc,onSelection,onEdgeCue]);

  useEffect(()=>{
    let cancelled=false,view:any;
    let activeDocumentCleanup:(()=>void)|null=null;
    const warmedSections=new Map<number,Promise<unknown>>();
    (async()=>{
      const [{Overlayer},buffer]=await Promise.all([import("foliate-js/overlayer.js"),readSource(source)]);
      // 字体加载不阻塞初始化流程，避免 fetch 挂起导致 EPUB 永远转圈
      if(settingsRef.current.fontFamily==="lxgw")loadEpubFontBuffer().catch(()=>undefined);
      await import("foliate-js/view.js");
      if(cancelled||!host.current)return;
      view=document.createElement("foliate-view") as any;
      view.className="foliateView";
      host.current.append(view);viewRef.current=view;
      if(settingsRef.current.fontFamily==="lxgw")preloadEpubFont();
      await view.open(new File([buffer],`${bookId}.epub`,{type:"application/epub+zip"}));
      if(cancelled)return;

      view.book.transformTarget?.addEventListener("data",(event:any)=>{
        try{
        const detail=event.detail;if(!/(?:xhtml|html|svg)/i.test(detail.type||""))return;
        const s=settingsRef.current;
        detail.data=Promise.resolve(detail.data).then((value:string)=>{
          if(typeof value!=="string")return value;
          return value
          .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"")
          .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi,"")
          .replace(/\b(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi,"$1=$2#$2")
          .replace(/(<\/head\s*>)/i,`<style data-papery-font>@font-face{font-family:"Papery LXGW WenKai";font-style:normal;font-weight:100 900;font-display:optional;src:url("${epubFontUrl}") format("woff2")}html,body{font-family:${epubFontStack(s.fontFamily)}!important;font-size:${s.fontSize}px!important;line-height:${s.lineHeight}!important;color:#302d27!important;background:${s.pageColor}!important}body *{font-family:inherit!important}</style>$1`)});
        }catch(e){console.warn("[Papery] transformTarget error",e)}
      });

      const renderer=view.renderer;
      renderer.setAttribute("flow","paginated");
      renderer.setAttribute("margin","0px");
      renderer.setAttribute("max-block-size","9999px");
      applyFoliateLayout(view,host.current,settingsRef.current);

      const rawToc=flattenToc(view.book.toc||[]);
      const fractions=view.getSectionFractions?.()||[];
      const toc=rawToc.map(item=>{const target=foliateLocator(item.locator);let page=1;try{const resolved=view.resolveNavigation(target);page=Math.max(1,(resolved?.index||0)+1);if(fractions[resolved?.index]!=null)page=Math.max(1,Math.floor(fractions[resolved.index]*100)+1)}catch{}return{...item,page}});
      tocRef.current=toc;callbacksRef.current.onToc(toc);
      void saveSetting(`analysis:${bookId}`,{totalPages:Math.max(1,view.book.sections?.length||1),analyzedAt:Date.now(),pagination:"foliate-locations"});

      const pulseHighlight=(rects:any[],options:any)=>{const element=Overlayer.highlight(rects,{...options,padding:2}),outline=Overlayer.outline(rects,{color:"#ef8c2f",width:2,padding:3,radius:3});element.append(outline);element.style.opacity=".82";element.style.mixBlendMode="multiply";requestAnimationFrame(()=>element.animate?.([{opacity:.42,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"},{opacity:1,filter:"drop-shadow(0 0 5px rgba(240,145,43,.58))"},{opacity:.42,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"}],{duration:900,iterations:6,easing:"ease-in-out"}));return element};
      const drawAnnotation=(event:any)=>{const {draw,annotation,doc}=event.detail;const writingMode=doc?.defaultView?.getComputedStyle(doc.documentElement).writingMode,options={color:annotation.color||"#f1a052",writingMode};draw(String(annotation.id||"").startsWith("papery-cue-")?pulseHighlight:annotation.style==="underline"?Overlayer.underline:Overlayer.highlight,options)};
      const addVisibleAnnotations=(index:number)=>{for(const annotation of annotationsRef.current){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type!=="epub"||!loc.cfi||annotation.style==="bookmark")continue;try{if(view.resolveNavigation(loc.cfi)?.index===index)void view.addAnnotation({value:loc.cfi,style:annotation.style,color:annotation.color,id:annotation.id})}catch{}}};
      const warmAround=(index:number)=>{for(const nextIndex of [index-1,index+1]){const section=view.book.sections?.[nextIndex];if(!section||warmedSections.has(nextIndex))continue;const pending=Promise.resolve(section.load()).catch(()=>undefined);warmedSections.set(nextIndex,pending)}if(warmedSections.size>8){const farthest=[...warmedSections.keys()].sort((a,b)=>Math.abs(b-index)-Math.abs(a-index))[0];if(Math.abs(farthest-index)>2){view.book.sections?.[farthest]?.unload?.();warmedSections.delete(farthest)}}};
      const onOverlay=(event:any)=>queueMicrotask(()=>addVisibleAnnotations(event.detail.index));
      const onRelocate=(event:any)=>{const detail=event.detail||{},cfi=detail.cfi;if(!cfi)return;const resolvedIndex=view.resolveNavigation(cfi)?.index;if(Number.isFinite(resolvedIndex))warmAround(resolvedIndex);const fraction=Number.isFinite(detail.fraction)?detail.fraction:0,locator=JSON.stringify({type:"epub",cfi,fraction});currentLocator.current=locator;const total=Math.max(1,detail.location?.total||view.book.sections?.length||1),page=Math.min(total,Math.max(1,(detail.location?.current||0)+1));const chapterTitle=detail.tocItem?.label||"正文";let chapterIndex=tocRef.current.findIndex(item=>item.label===chapterTitle);if(chapterIndex<0)chapterIndex=0;callbacksRef.current.onLocation({locator,progress:Math.max(0,Math.min(100,fraction*100)),page,totalPages:total,chapterTitle,chapterIndex,chapterCount:Math.max(1,tocRef.current.length)})};
      const onLoad=(event:any)=>{
        activeDocumentCleanup?.();
        const {doc,index}=event.detail;let wheelLocked=false,selectionGuard=0;
        void applyEpubDocumentFont(doc,settingsRef.current);
        const spread=settingsRef.current.spread;const prevZone=spread==="double"?0.25:1/3;const nextZone=spread==="double"?0.75:1/3;
        const wheel=(wheelEvent:WheelEvent)=>{if(Math.abs(wheelEvent.deltaY)<14||wheelLocked)return;wheelEvent.preventDefault();wheelLocked=true;void (wheelEvent.deltaY>0?view.next():view.prev()).finally(()=>window.setTimeout(()=>wheelLocked=false,150))};
        const pointerRatio=(event:MouseEvent)=>{const hostBounds=host.current?.getBoundingClientRect();return hostBounds?(event.clientX-hostBounds.left)/Math.max(1,hostBounds.width):event.clientX/Math.max(1,doc.defaultView?.innerWidth||1)};
        const click=(event:MouseEvent)=>{if(event.defaultPrevented||Date.now()<selectionGuard||doc.getSelection()?.toString()||(event.target as Element|null)?.closest?.("a,button,input,select,textarea"))return;const ratio=pointerRatio(event);if(ratio<prevZone)void view.prev();else if(ratio>=nextZone)void view.next()};
        const move=(event:MouseEvent)=>{const ratio=pointerRatio(event);callbacksRef.current.onEdgeCue?.(ratio<prevZone?"left":ratio>=nextZone?"right":null)};
        const leave=()=>callbacksRef.current.onEdgeCue?.(null);
        const select=()=>{window.setTimeout(()=>{const selection=doc.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return;const range=selection.getRangeAt(0),quote=selection.toString().trim();if(!quote)return;selectionGuard=Date.now()+450;const cfi=view.getCFI(index,range),rect=range.getBoundingClientRect(),bounds=host.current?.getBoundingClientRect(),anchor=rangeAnchorContext(range);callbacksRef.current.onSelection({quote,locator:JSON.stringify({type:"epub",cfi,sectionIndex:index,...anchor,quote}),rect:{x:(bounds?.left||0)+rect.left,y:(bounds?.top||0)+rect.top,width:rect.width,height:rect.height}});selection.removeAllRanges()},0)};
        doc.addEventListener("wheel",wheel,{passive:false});doc.addEventListener("click",click);doc.addEventListener("mousemove",move);doc.addEventListener("mouseleave",leave);doc.addEventListener("mouseup",select);
        activeDocumentCleanup=()=>{doc.removeEventListener("wheel",wheel);doc.removeEventListener("click",click);doc.removeEventListener("mousemove",move);doc.removeEventListener("mouseleave",leave);doc.removeEventListener("mouseup",select)};
        addVisibleAnnotations(index);
      };
      view.addEventListener("draw-annotation",drawAnnotation);view.addEventListener("create-overlay",onOverlay);view.addEventListener("relocate",onRelocate);view.addEventListener("load",onLoad);

      const target=foliateLocator(currentLocator.current);
      await view.init({lastLocation:target,showTextStart:true});
      if(cancelled)return;
      setStatus("ready");
      const findQuote=async(quote:string,preferredIndex?:number,prefix?:string,suffix?:string)=>{const candidates:{cfi:string;index:number;score:number}[]=[];for await(const item of view.search({query:quote})){if(item==="done")break;for(const match of item?.subitems||[]){if(!match?.cfi)continue;let index=-1;try{index=view.resolveNavigation(match.cfi)?.index??-1}catch{}const pre=String(match.excerpt?.pre||""),post=String(match.excerpt?.post||"");candidates.push({cfi:match.cfi,index,score:(index===preferredIndex?1000000:0)+(prefix?matchingPrefix(prefix,pre)*1000:0)+(suffix?matchingSuffix(suffix,post)*1000:0)})}}view.clearSearch();return candidates.sort((a,b)=>b.score-a.score)[0]?.cfi||null};
      const showCue=async(cfi:string,annotation?:ReaderAnnotation)=>{await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));await view.addAnnotation({value:cfi,style:"highlight",color:"#ffad33",id:"papery-cue-target"});if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);searchCueTimer.current=window.setTimeout(()=>{searchCueTimer.current=null;void view.deleteAnnotation({value:cfi});if(annotation&&annotation.style!=="bookmark")void view.addAnnotation({value:cfi,style:annotation.style,color:annotation.color,id:annotation.id})},6500)};
      const goTo=async(locator:string)=>{const parsed=parseLocator<{cfi?:string;href?:string;fraction?:number;search?:boolean;anchor?:boolean;annotationId?:string;quote?:string;prefix?:string;suffix?:string;sectionIndex?:number}>(locator),fallback=foliateLocator(locator);if(fallback==null)return;const annotation=annotationsRef.current.find(item=>item.id===parsed?.annotationId||item.locator===locator||(parsed?.cfi&&parseLocator<{cfi?:string}>(item.locator)?.cfi===parsed.cfi));let cfi=parsed?.cfi;if(parsed?.anchor&&parsed.quote){let preferred=parsed.sectionIndex;try{preferred??=parsed.cfi?view.resolveNavigation(parsed.cfi)?.index:undefined}catch{}cfi=await findQuote(parsed.quote,preferred,parsed.prefix,parsed.suffix)||cfi}const target=cfi||fallback,resolved=await view.goTo(target);if(!resolved)return;if((parsed?.search||parsed?.anchor)&&cfi)await showCue(cfi,annotation);else if(annotation&&annotation.style!=="bookmark"&&cfi){await new Promise(resolve=>requestAnimationFrame(()=>resolve(undefined)));await view.addAnnotation({value:cfi,style:annotation.style,color:annotation.color,id:annotation.id})}};
      const search=async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim();if(!needle)return[];const results:ReaderSearchResult[]=[];for await(const item of view.search({query:needle})){if(item==="done"||!item?.subitems)continue;for(const match of item.subitems){if(results.length>=100)break;let sectionIndex=0;try{sectionIndex=view.resolveNavigation(match.cfi)?.index??0}catch{}const excerpt=match.excerpt?.pre+match.excerpt?.match+match.excerpt?.post||String(match.excerpt||"").replace(/\s+/g," ");results.push({id:`foliate-search-${results.length}`,label:item.label||"正文",excerpt,locator:JSON.stringify({type:"epub",cfi:match.cfi,quote:needle,prefix:String(match.excerpt?.pre||"").slice(-48),suffix:String(match.excerpt?.post||"").slice(0,48),sectionIndex,search:true}),page:Math.max(1,sectionIndex+1)})}if(results.length>=100)break}return results};
      onApi({next:()=>void view.next(),prev:()=>void view.prev(),goTo:(locator:string)=>void goTo(locator),search});
    })().catch(reason=>{if(!cancelled){setError(reason instanceof Error?reason.message:"EPUB 分页器初始化失败");setStatus("error")}});
    return()=>{cancelled=true;onApi(null);callbacksRef.current.onEdgeCue?.(null);activeDocumentCleanup?.();if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);try{for(const index of warmedSections.keys())view?.book?.sections?.[index]?.unload?.();view?.close?.();view?.book?.destroy?.();view?.remove?.()}catch{}if(viewRef.current===view)viewRef.current=null};
  },[source,bookId,onApi]);

  useEffect(()=>{const view=viewRef.current,element=host.current;if(!view||!element||status!=="ready")return;applyFoliateLayout(view,element,settings);const doc=view.renderer.getContents?.()[0]?.doc as Document|undefined;if(doc)void applyEpubDocumentFont(doc,settings);let frame=0,lastWidth=element.clientWidth;const observer=new ResizeObserver(()=>{const width=element.clientWidth;if(Math.abs(width-lastWidth)<1)return;lastWidth=width;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>applyFoliateLayout(view,element,settings,false))});observer.observe(element);return()=>{cancelAnimationFrame(frame);observer.disconnect()}},[settings,status]);
  useEffect(()=>{const view=viewRef.current;if(!view||status!=="ready")return;const previous=(view.__paperyAnnotations||[]) as ReaderAnnotation[];for(const annotation of previous){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type==="epub"&&loc.cfi)void view.deleteAnnotation({value:loc.cfi})}view.__paperyAnnotations=annotations;const contents=view.renderer.getContents?.()||[];for(const content of contents){const idx=content.index;if(typeof idx!=="number")continue;setTimeout(()=>{for(const annotation of annotations){const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type!=="epub"||!loc.cfi||annotation.style==="bookmark")continue;try{if(view.resolveNavigation(loc.cfi)?.index===idx)void view.addAnnotation({value:loc.cfi,style:annotation.style,color:annotation.color,id:annotation.id})}catch{}}},200)}},[annotations,status]);

  const {horizontal:rawHorizontal,vertical}=epubMargins(settings),horizontal=rawHorizontal;
  return <div className={`epubHost foliateHost flow-paginated spread-${settings.spread} texture-${settings.paperTexture}`} style={{background:settings.pageColor}}>
    <div ref={host} className="foliateRendition" style={{left:`${horizontal}%`,right:`${horizontal}%`,top:`${vertical}%`,bottom:`${vertical}%`}}/>
    {status==="loading"&&<div className="readerLoading epubLoading"><span/><p>正在打开 EPUB…</p></div>}
    {status==="error"&&<div className="readerError"><strong>EPUB 打开失败</strong><p>{error}</p></div>}
  </div>;
}

function rangeForDocumentQuote(doc:Document,quote:string,prefix?:string,suffix?:string){
  const root=doc.body;if(!root||!quote)return null;
  const nodes:Text[]=[],starts:number[]=[];let raw="";
  const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null;
  while((node=walker.nextNode())){const value=node.textContent||"";if(!value)continue;starts.push(raw.length);nodes.push(node as Text);raw+=value}
  const findCandidates=(haystack:string,needle:string)=>{const result:number[]=[];let cursor=0;while(result.length<300){const found=haystack.indexOf(needle,cursor);if(found<0)break;result.push(found);cursor=found+Math.max(1,needle.length)}return result};
  let candidates=findCandidates(raw,quote);if(!candidates.length)candidates=findCandidates(raw.toLocaleLowerCase(),quote.toLocaleLowerCase());
  if(!candidates.length)return null;
  const expected=candidates.reduce((best,candidate)=>{const pre=prefix?matchingPrefix(prefix,raw.slice(Math.max(0,candidate-prefix.length),candidate)):0,post=suffix?matchingSuffix(suffix,raw.slice(candidate+quote.length,candidate+quote.length+suffix.length)):0,score=(pre+post)*1000;return score>best.score?{candidate,score}:best},{candidate:candidates[0],score:-1}).candidate;
  const point=(offset:number)=>{let low=0,high=starts.length-1,index=0;while(low<=high){const middle=(low+high)>>1;if(starts[middle]<=offset){index=middle;low=middle+1}else high=middle-1}return{node:nodes[index],offset:Math.max(0,Math.min(nodes[index]?.data.length||0,offset-starts[index]))}};
  const start=point(expected),end=point(expected+quote.length);if(!start.node||!end.node)return null;const range=doc.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);return range;
}

function pulseEpubJsAnnotation(annotation:any){
  const animate=(mark:any)=>mark?.element?.animate?.([{opacity:.3,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"},{opacity:1,filter:"drop-shadow(0 0 5px rgba(240,145,43,.62))"},{opacity:.3,filter:"drop-shadow(0 0 0 rgba(240,145,43,0))"}],{duration:900,iterations:6,easing:"ease-in-out"});
  requestAnimationFrame(()=>animate(annotation?.mark));window.setTimeout(()=>animate(annotation?.mark),120);
}

function EpubScrollReader({source,bookId,settings,initialLocation,annotations,onApi,onLocation,onToc,onSelection,onEdgeCue}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const renditionRef=useRef<any>(null);
  const bookRef=useRef<any>(null);
  const settingsRef=useRef(settings);
  const appliedSettingsKey=useRef("");
  useEffect(()=>{settingsRef.current=settings},[settings]);
  const currentLocator=useRef(initialLocation),searchCueTimer=useRef<number|null>(null),activeCueRef=useRef<{cfi:string;annotation?:ReaderAnnotation}|null>(null),annotationsRef=useRef(annotations);
  useEffect(()=>{annotationsRef.current=annotations},[annotations]);
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [error,setError]=useState("");

  useEffect(()=>{
    let book:any,rendition:any,cancelled=false,removeScrollTracking:(()=>void)|null=null,reportScrollPosition:(()=>void)|null=null;
    (async()=>{
      const [epubModule,buffer]=await Promise.all([import("epubjs"),readSource(source),settingsRef.current.fontFamily==="lxgw"?loadEpubFontBuffer():Promise.resolve(null)]);
      if(cancelled||!host.current)return;
      if(settingsRef.current.fontFamily==="lxgw")preloadEpubFont();
      const createBook=(epubModule as any).default||epubModule;
      book=createBook(buffer);bookRef.current=book;
      await book.ready;
      let waitForFirstEpubFont=true;
      book.spine.hooks.content.register((doc:Document)=>{
        // 尽早同步注入 style 元素，在 FontFace 异步加载前就让 font-family 规则生效
        const earlyStack=epubFontStack(settingsRef.current.fontFamily);
        if(!doc.getElementById("papery-early-font")){
          const earlyStyle=doc.createElement("style");
          earlyStyle.id="papery-early-font";
          earlyStyle.textContent=`@font-face{font-family:"Papery LXGW WenKai";font-style:normal;font-weight:100 900;font-display:swap;src:url("${epubFontUrl}") format("woff2")}html,body{font-family:${earlyStack}!important}body *{font-family:inherit!important}`;
          (doc.head||doc.documentElement).prepend(earlyStyle);
        }
        const pending=applyEpubDocumentFont(doc,settingsRef.current);if(waitForFirstEpubFont){waitForFirstEpubFont=false;return pending}void pending
      });
      const navigation=await book.loaded.navigation;
      const spineTotal=Math.max(1,book.spine.spineItems.length);
      const toc=flattenToc(navigation.toc).map(item=>{const href=parseLocator<{href:string}>(item.locator)?.href||"",section=book.spine.get(href.split("#")[0]);return{...item,page:Math.max(1,(section?.index||0)+1)}});onToc(toc);
      void saveSetting(`analysis:${bookId}`,{totalPages:spineTotal,analyzedAt:Date.now()});
      const initialSettings=settingsRef.current;
      appliedSettingsKey.current=epubSettingsKey(initialSettings);
      const gap=initialSettings.flow==="paginated"&&initialSettings.spread==="double"?28:0;
      rendition=book.renderTo(host.current,{width:"100%",height:"100%",gap:initialSettings.flow==="paginated"?gap:0,flow:initialSettings.flow==="scrolled"?"scrolled-doc":"paginated",spread:initialSettings.spread==="double"?"always":"none",manager:initialSettings.flow==="scrolled"?"continuous":"default",offset:Math.max(1200,(host.current.clientHeight||700)*2)});
      renditionRef.current=rendition;
      if(initialSettings.flow==="scrolled"&&rendition.manager){
        rendition.manager.settings.offset=Math.max(1200,(host.current.clientHeight||700)*2);
        // ContinuousViewManager normally destroys off-screen iframes in `update`
        // and recreates them at chapter boundaries. Keeping the appended views
        // alive trades a small amount of memory for stable, pop-free scrolling.
        rendition.manager.trim=()=>Promise.resolve();
        rendition.manager.update=()=>Promise.resolve();
      }
      rendition.themes.register("papery",epubTheme(initialSettings));
      rendition.themes.select("papery");
      const publishLocation=(cfi:string,locationIndex:number,sectionFraction:number)=>{
        if(!cfi)return;const index=Math.max(0,Math.min(spineTotal-1,locationIndex)),fraction=Math.max(0,Math.min(1,sectionFraction));
        currentLocator.current=JSON.stringify({type:"epub",cfi,sectionIndex:index});
        let chapterIndex=0;for(let tocIndex=0;tocIndex<toc.length;tocIndex++){const href=parseLocator<{href:string}>(toc[tocIndex].locator)?.href?.split("#")[0],tocSection=href?book.spine.get(href)?.index:undefined;if(typeof tocSection==="number"&&tocSection<=index)chapterIndex=tocIndex}
        onLocation({locator:currentLocator.current,progress:((index+fraction)/spineTotal)*100,page:index+1,totalPages:spineTotal,chapterTitle:toc[chapterIndex]?.label||"正文",chapterIndex,chapterCount:Math.max(1,toc.length)});
      };
      let trackingScroll=false;
      rendition.on("relocated",(location:any)=>{
        if(trackingScroll)return;const cfi=location.start.cfi,locationIndex=Math.max(0,book.spine.get(location.start.href)?.index||0),displayed=location.start.displayed||{page:1,total:1},sectionFraction=Math.max(0,Math.min(1,((displayed.page||1)-1)/Math.max(1,displayed.total||1)));publishLocation(cfi,locationIndex,sectionFraction);
      });
      rendition.on("selected",(cfiRange:string,contents:any)=>{
        const range=contents.range(cfiRange),rect=range.getBoundingClientRect(),anchor=rangeAnchorContext(range),sectionIndex=book.spine.get(cfiRange)?.index;
        onSelection({quote:range.toString().trim(),locator:JSON.stringify({type:"epub",cfi:cfiRange,sectionIndex,...anchor}),rect:{x:rect.left,y:rect.top,width:rect.width,height:rect.height}});
        contents.window.getSelection()?.removeAllRanges();
      });
      rendition.on("rendered",(_section:any,contents:any)=>{
        const doc=contents.document;let wheelLock=false;
        doc.addEventListener("wheel",(event:WheelEvent)=>{if(settingsRef.current.flow!=="paginated"||wheelLock||Math.abs(event.deltaY)<15)return;event.preventDefault();wheelLock=true;const move=event.deltaY>0?rendition.next():rendition.prev();Promise.resolve(move).finally(()=>setTimeout(()=>wheelLock=false,180));},{passive:false});
        let startX=0;doc.addEventListener("touchstart",(event:TouchEvent)=>startX=event.touches[0]?.clientX||0,{passive:true});
        doc.addEventListener("touchend",(event:TouchEvent)=>{const delta=(event.changedTouches[0]?.clientX||0)-startX;if(Math.abs(delta)>55){if(delta<0)rendition.next();else rendition.prev();}},{passive:true});
        const pointerRatio=(event:MouseEvent)=>{const frame=(contents.window.frameElement as HTMLElement|null)?.getBoundingClientRect(),bounds=host.current?.getBoundingClientRect();return frame&&bounds?(frame.left+event.clientX-bounds.left)/Math.max(1,bounds.width):event.clientX/Math.max(1,contents.window.innerWidth)};
        const prevZone=settingsRef.current.spread==="double"?0.25:1/3;const nextZone=settingsRef.current.spread==="double"?0.75:1/3;
        doc.addEventListener("click",(event:MouseEvent)=>{if(contents.window.getSelection()?.toString())return;const ratio=pointerRatio(event);if(ratio<prevZone)rendition.prev();else if(ratio>=nextZone)rendition.next();});
        doc.addEventListener("mousemove",(event:MouseEvent)=>{const ratio=pointerRatio(event);onEdgeCue?.(ratio<prevZone?"left":ratio>=nextZone?"right":null)});
        doc.addEventListener("mouseleave",()=>onEdgeCue?.(null));
      });
      const saved=parseLocator<{cfi?:string;href?:string}>(currentLocator.current);
      await rendition.display(saved?.cfi||saved?.href||undefined);
      if(cancelled)return;
      const scrollHost=host.current,container=scrollHost?.querySelector<HTMLElement>(".epub-container");
      if(container&&scrollHost){
        trackingScroll=true;let reportTimer:number|null=null,resizeFrame=0;
        const updateEndSpace=()=>{const element=host.current;if(element)container.style.paddingBottom=`${Math.round(element.clientHeight*.42)}px`};
        reportScrollPosition=()=>{
          const element=host.current;if(!element)return;const bounds=element.getBoundingClientRect(),probeY=bounds.top+Math.min(bounds.height*.3,240),contentsList=(rendition.getContents?.()||[]) as any[];
          let active:any=null,best=Number.NEGATIVE_INFINITY;
          for(const contents of contentsList){const frame=contents.window?.frameElement as HTMLElement|null;if(!frame)continue;const rect=frame.getBoundingClientRect(),overlap=Math.max(0,Math.min(rect.bottom,bounds.bottom)-Math.max(rect.top,bounds.top)),contains=probeY>=rect.top&&probeY<=rect.bottom,score=(contains?1_000_000:0)+overlap-Math.abs((rect.top+rect.bottom)/2-probeY);if(score>best){best=score;active={contents,frame,rect}}}
          if(!active)return;const view=active.frame.closest?.(".epub-view") as HTMLElement|null,index=Number(view?.getAttribute("ref"));if(!Number.isFinite(index))return;
          const doc=active.contents.document as Document,viewWindow=doc.defaultView;if(!viewWindow)return;const localY=Math.max(2,Math.min(viewWindow.innerHeight-2,probeY-active.rect.top));let range:Range|null=null;
          for(const ratio of [.18,.32,.5,.7]){const localX=Math.max(2,Math.min(viewWindow.innerWidth-2,viewWindow.innerWidth*ratio)),position=(doc as any).caretPositionFromPoint?.(localX,localY);if(position?.offsetNode){range=doc.createRange();range.setStart(position.offsetNode,position.offset);range.collapse(true)}else range=(doc as any).caretRangeFromPoint?.(localX,localY)||null;if(range)break}
          let cfi="";try{if(range)cfi=active.contents.cfiFromRange(range)}catch{}if(!cfi){const parsed=parseLocator<{cfi?:string}>(currentLocator.current);cfi=parsed?.cfi||""}if(!cfi)return;
          const viewTop=view?.offsetTop||0,viewHeight=Math.max(1,view?.offsetHeight||active.rect.height),fraction=(container.scrollTop+bounds.height*.3-viewTop)/viewHeight;publishLocation(cfi,index,fraction);
        };
        const scheduleReport=()=>{if(reportTimer!==null)window.clearTimeout(reportTimer);reportTimer=window.setTimeout(()=>{reportTimer=null;reportScrollPosition?.()},70)};
        const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{updateEndSpace();scheduleReport()})});observer.observe(scrollHost);container.addEventListener("scroll",scheduleReport,{passive:true});updateEndSpace();requestAnimationFrame(()=>reportScrollPosition?.());
        removeScrollTracking=()=>{trackingScroll=false;if(reportTimer!==null)window.clearTimeout(reportTimer);cancelAnimationFrame(resizeFrame);observer.disconnect();container.removeEventListener("scroll",scheduleReport)};
      }
      setStatus("ready");
      const findQuote=async(quote:string,preferredIndex?:number,prefix?:string,suffix?:string)=>{const items=[...book.spine.spineItems].sort((a:any,b:any)=>a.index===preferredIndex?-1:b.index===preferredIndex?1:a.index-b.index);for(const section of items){try{await section.load(book.load.bind(book));const doc=section.document as Document,range=rangeForDocumentQuote(doc,quote,prefix,suffix);if(range)return section.cfiFromRange(range)}catch{}finally{try{section.unload()}catch{}}await new Promise(resolve=>window.setTimeout(resolve,0))}return null};
      const restoreAnnotation=(cfi:string,annotation?:ReaderAnnotation)=>{if(!annotation||annotation.style==="bookmark")return;if(annotation.style==="underline")rendition.annotations.underline(cfi,{id:annotation.id},undefined,"papery-underline",{stroke:annotation.color,"stroke-opacity":".85"});else rendition.annotations.highlight(cfi,{id:annotation.id},undefined,"papery-highlight",{fill:annotation.color,"fill-opacity":".35","mix-blend-mode":"multiply"})};
      const showCue=(cfi:string,annotation?:ReaderAnnotation)=>{const previous=activeCueRef.current;if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);if(previous)try{rendition.annotations.remove(previous.cfi,"highlight");restoreAnnotation(previous.cfi,previous.annotation)}catch{}activeCueRef.current={cfi,annotation};try{rendition.annotations.remove(cfi,"highlight");const cue=rendition.annotations.highlight(cfi,{search:true},undefined,"papery-search-cue",{fill:"#ffad33","fill-opacity":".82","mix-blend-mode":"multiply"});pulseEpubJsAnnotation(cue)}catch{}searchCueTimer.current=window.setTimeout(()=>{searchCueTimer.current=null;activeCueRef.current=null;try{rendition.annotations.remove(cfi,"highlight");restoreAnnotation(cfi,annotation)}catch{}},6500)};
      const alignRenderedTarget=async(destination:string,cfi:string|undefined,sectionIndex:number|undefined)=>{
        await rendition.display(destination);
        await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
        if(!container||!scrollHost)return;
        const contentsList=(rendition.getContents?.()||[]) as any[];
        const href=destination.startsWith("epubcfi(")?"":destination,fragment=href.includes("#")?decodeURIComponent(href.split("#").slice(1).join("#")):"";
        const targetContents=contentsList.find(contents=>{const frame=contents.window?.frameElement as HTMLElement|null,view=frame?.closest?.(".epub-view") as HTMLElement|null;return Number(view?.getAttribute("ref"))===sectionIndex})||contentsList[0];
        const frame=targetContents?.window?.frameElement as HTMLElement|null;if(!frame)return;
        let localTop=0;
        try{if(cfi)localTop=targetContents.range(cfi)?.getBoundingClientRect?.().top||0;else if(fragment)localTop=targetContents.document?.getElementById(fragment)?.getBoundingClientRect?.().top||0}catch{}
        const bounds=scrollHost.getBoundingClientRect(),frameBounds=frame.getBoundingClientRect(),absoluteTop=frameBounds.top+localTop;
        container.scrollTo({top:Math.max(0,container.scrollTop+absoluteTop-bounds.top-scrollHost.clientHeight*.28),behavior:"auto"});
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        reportScrollPosition?.();
      };
      const goTo=async(locator:string)=>{const target=parseLocator<{cfi?:string;href?:string;search?:boolean;anchor?:boolean;annotationId?:string;quote?:string;prefix?:string;suffix?:string;sectionIndex?:number}>(locator);if(!target)return;const annotation=annotationsRef.current.find(item=>item.id===target.annotationId||(target.cfi&&parseLocator<{cfi?:string}>(item.locator)?.cfi===target.cfi));let cfi=target.cfi;if(target.anchor&&target.quote){const preferred=target.sectionIndex??book.spine.get(target.cfi)?.index;cfi=await findQuote(target.quote,preferred,target.prefix,target.suffix)||cfi}const destination=cfi||target.href;if(!destination)return;const sectionIndex=target.sectionIndex??book.spine.get(destination)?.index;await alignRenderedTarget(destination,cfi,sectionIndex);if(!cfi)return;if(target.search||target.anchor)showCue(cfi,annotation);else restoreAnnotation(cfi,annotation)};
      const search=async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim().toLocaleLowerCase();if(!needle)return[];const results:ReaderSearchResult[]=[];for(const section of book.spine.spineItems){if(results.length>=100)break;try{await section.load(book.load.bind(book));const doc=section.document as Document;if(!doc?.body)continue;const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let node:Node|null;while((node=walker.nextNode())&&results.length<100){const value=node.textContent||"",lower=value.toLocaleLowerCase();let cursor=0;while(results.length<100){const found=lower.indexOf(needle,cursor);if(found<0)break;const end=found+query.trim().length,range=doc.createRange();range.setStart(node,found);range.setEnd(node,end);const cfi=section.cfiFromRange(range),anchor=textAnchorContext(value,found,end);results.push({id:`epub-search-${section.index}-${found}-${results.length}`,label:toc.find(item=>(parseLocator<{href:string}>(item.locator)?.href||"").split("#")[0]===String(section.href).split("#")[0])?.label||`第 ${section.index+1} 节`,excerpt:value.slice(Math.max(0,found-30),Math.min(value.length,end+48)).replace(/\s+/g," "),locator:JSON.stringify({type:"epub",cfi,sectionIndex:section.index,search:true,...anchor})});cursor=found+Math.max(1,needle.length)}}}catch{}finally{try{section.unload()}catch{}}await new Promise(resolve=>window.setTimeout(resolve,0))}return results};
      onApi({next:()=>rendition.next(),prev:()=>rendition.prev(),goTo:(locator:string)=>void goTo(locator),search});
    })().catch(reason=>{if(!cancelled){setError(reason instanceof Error?reason.message:"EPUB 解析失败");setStatus("error")}});
    return()=>{cancelled=true;onApi(null);removeScrollTracking?.();renditionRef.current=null;bookRef.current=null;activeCueRef.current=null;if(searchCueTimer.current!==null)window.clearTimeout(searchCueTimer.current);try{rendition?.destroy();book?.destroy();}catch{}};
  },[source,bookId,settings.flow,onApi,onLocation,onToc,onSelection,onEdgeCue]);

  useEffect(()=>{const rendition=renditionRef.current,element=host.current,key=epubSettingsKey(settings);if(!rendition||!element||status!=="ready"||appliedSettingsKey.current===key)return;appliedSettingsKey.current=key;let cancelled=false;const frame=requestAnimationFrame(()=>{void (async()=>{const contents=(rendition.getContents?.()||[]) as any[];await Promise.all(contents.map(item=>applyEpubDocumentFont(item.document,settings)));if(cancelled)return;rendition.themes.register("papery",epubTheme(settings));rendition.themes.select("papery");for(const item of contents)item.expand?.();try{rendition.spread("none");rendition.resize(element.clientWidth,element.clientHeight)}catch{}})()});return()=>{cancelled=true;cancelAnimationFrame(frame)}},[settings,status]);

  useEffect(()=>{
    const rendition=renditionRef.current;if(!rendition||status!=="ready")return;
    const applyAll=()=>{const contents=(rendition.getContents?.()||[]) as any[];annotations.forEach(annotation=>{const loc=parseLocator<{type:string;cfi?:string}>(annotation.locator);if(loc?.type!=="epub"||!loc.cfi||annotation.style==="bookmark"||activeCueRef.current?.cfi===loc.cfi)return;try{rendition.annotations.remove(loc.cfi,"highlight");rendition.annotations.remove(loc.cfi,"underline");if(annotation.style==="underline")rendition.annotations.underline(loc.cfi,{id:annotation.id},undefined,"papery-underline",{stroke:annotation.color,"stroke-opacity":".85"});else rendition.annotations.highlight(loc.cfi,{id:annotation.id},undefined,"papery-highlight",{fill:annotation.color,"fill-opacity":".35","mix-blend-mode":"multiply"});}catch{}})};
    applyAll();
    const timer=window.setTimeout(applyAll,300);
    return()=>clearTimeout(timer);
  },[annotations,status]);

  const {horizontal:rawH,vertical}=epubMargins(settings),horizontal=rawH;
  return <div className={`epubHost flow-${settings.flow} spread-${settings.spread} texture-${settings.paperTexture}`} style={{background:settings.pageColor}}>
    <div ref={host} className="epubRendition" style={{left:`${horizontal}%`,right:`${horizontal}%`,top:`${vertical}%`,bottom:`${vertical}%`}}/>
    {status==="loading"&&<div className="readerLoading epubLoading"><span/><p>正在打开 EPUB…</p></div>}
    {status==="error"&&<div className="readerError"><strong>EPUB 打开失败</strong><p>{error}</p></div>}
  </div>;
}

type PdfRect={x:number;y:number;width:number;height:number};
type PdfLocator={type:"pdf";page:number;rects?:PdfRect[]};

function PdfPage({pdf,pageNumber,annotations,onSelection,onRendered,scaleHint,zoom,pageColor}:any){
  const canvas=useRef<HTMLCanvasElement>(null);
  const textLayer=useRef<HTMLDivElement>(null);
  const wrap=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:600,height:800});
  useEffect(()=>{
    let task:any,cancelled=false;
    (async()=>{
      const page=await pdf.getPage(pageNumber);if(cancelled)return;
      const base=page.getViewport({scale:1});
      const cssScale=Math.min(4,Math.max(.35,(scaleHint/base.width)*zoom));
      const cssViewport=page.getViewport({scale:cssScale});
      const renderViewport=page.getViewport({scale:cssScale*Math.min(1.5,window.devicePixelRatio||1)});
      const element=canvas.current!;
      element.width=Math.floor(renderViewport.width);element.height=Math.floor(renderViewport.height);
      element.style.width=`${cssViewport.width}px`;element.style.height=`${cssViewport.height}px`;
      setSize({width:cssViewport.width,height:cssViewport.height});
      task=page.render({canvasContext:element.getContext("2d")!,viewport:renderViewport});
      await task.promise;
      const pdfjs=await loadPdfJs();if(cancelled||!textLayer.current)return;
      textLayer.current.replaceChildren();
      textLayer.current.style.setProperty("--scale-factor",String(cssScale));
      const layer=new pdfjs.TextLayer({textContentSource:await page.getTextContent(),container:textLayer.current,viewport:cssViewport});
      await layer.render();
      if(!cancelled)onRendered?.(pageNumber);
    })();
    return()=>{cancelled=true;task?.cancel?.()};
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
  const restoring=useRef(true);
  const [initialPage]=useState(()=>parseLocator<PdfLocator>(initialLocation)?.page||1);
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
  const handlePageRendered=useCallback((rendered:number)=>{if(rendered===initialPage)setFirstPageReady(true)},[initialPage]);
  useEffect(()=>{const element=host.current;if(!element||!pdf)return;const update=()=>{setHostWidth(Math.max(320,element.clientWidth));setHostHeight(Math.max(320,element.clientHeight));setLayoutReady(true)};const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect()},[pdf]);
  useEffect(()=>{let doc:any,cancelled=false,timer=0;(async()=>{const [pdfjs,buffer]=await Promise.all([loadPdfJs(),readSource(source)]);pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.min.mjs";doc=await pdfjs.getDocument({data:buffer.slice(0)}).promise;if(cancelled)return;setPdf(doc);void saveSetting(`analysis:${bookId}`,{totalPages:doc.numPages,analyzedAt:Date.now()});const first=await doc.getPage(1),viewport=first.getViewport({scale:1});setPageRatio(viewport.height/viewport.width);timer=window.setTimeout(()=>setRenderRadius(1),160);const outline=await doc.getOutline();const result:TocItem[]=[];const walk=async(items:any[],level=0)=>{for(const item of items||[]){let pageNumber=1;try{const dest=typeof item.dest==="string"?await doc.getDestination(item.dest):item.dest;if(dest?.[0])pageNumber=await doc.getPageIndex(dest[0])+1}catch{}result.push({id:`pdf-${result.length}`,label:item.title||`第 ${pageNumber} 页`,level,page:pageNumber,locator:JSON.stringify({type:"pdf",page:pageNumber})});await walk(item.items||[],level+1)}};await walk(outline||[]);if(!result.length){for(let value=1;value<=doc.numPages;value++)result.push({id:`pdf-${value}`,label:`第 ${value} 页`,level:0,page:value,locator:JSON.stringify({type:"pdf",page:value})})}setToc(result);onToc(result)})().catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"PDF 解析失败")});return()=>{cancelled=true;clearTimeout(timer);doc?.destroy?.()}},[source,bookId,onToc]);
  const widthHint=Math.max(260,Math.min(1200,hostWidth));
  const pageHint=Math.max(240,Math.min(widthHint,hostHeight/pageRatio));
  const scaleHint=fitMode==="page"?pageHint:widthHint;
  const slotHeight=scaleHint*zoom*pageRatio+24;
  const pageWidth=scaleHint*zoom;
  const trackWidth=pageWidth>hostWidth?pageWidth+32:hostWidth;
  useLayoutEffect(()=>{if(!pdf||!layoutReady||!restoring.current)return;const frame=requestAnimationFrame(()=>{const element=host.current;if(!element)return;element.scrollTop=Math.max(0,(initialPage-1)*slotHeight);element.scrollLeft=Math.max(0,(trackWidth-element.clientWidth)/2);requestAnimationFrame(()=>{restoring.current=false;setPage(initialPage)})});return()=>cancelAnimationFrame(frame)},[pdf,layoutReady,initialPage,slotHeight,trackWidth]);
  const scrollToPage=useCallback((target:number,behavior:ScrollBehavior="smooth")=>{const bounded=Math.min(pdf?.numPages||target,Math.max(1,target));setPage(bounded);requestAnimationFrame(()=>host.current?.scrollTo({top:(bounded-1)*slotHeight,behavior}))},[pdf,slotHeight]);
  const goTo=useCallback((locator:string)=>{const target=parseLocator<PdfLocator>(locator);if(target)scrollToPage(target.page)},[scrollToPage]);
  const next=useCallback(()=>scrollToPage(pageRef.current+1),[scrollToPage]);
  const prev=useCallback(()=>scrollToPage(pageRef.current-1),[scrollToPage]);
  const search=useCallback(async(query:string):Promise<ReaderSearchResult[]>=>{const needle=query.trim().toLocaleLowerCase();if(!pdf||!needle)return[];const results:ReaderSearchResult[]=[];for(let start=1;start<=pdf.numPages&&results.length<100;start+=6){const numbers=Array.from({length:Math.min(6,pdf.numPages-start+1)},(_,index)=>start+index);const texts=await Promise.all(numbers.map(async pageNumber=>{const cached=textCache.current.get(pageNumber);if(cached!==undefined)return cached;const pdfPage=await pdf.getPage(pageNumber),content=await pdfPage.getTextContent();const value=content.items.map((item:any)=>item.str||"").join(" ");textCache.current.set(pageNumber,value);return value}));texts.forEach((value,index)=>{const lower=value.toLocaleLowerCase();let cursor=0;while(results.length<100){const found=lower.indexOf(needle,cursor);if(found<0)break;const pageNumber=numbers[index];results.push({id:`pdf-search-${pageNumber}-${found}`,label:`第 ${pageNumber} 页`,excerpt:value.slice(Math.max(0,found-34),Math.min(value.length,found+needle.length+52)).replace(/\s+/g," "),locator:JSON.stringify({type:"pdf",page:pageNumber}),page:pageNumber});cursor=found+Math.max(1,needle.length)}})}return results},[pdf]);
  useEffect(()=>{onApi({next,prev,goTo,search});return()=>onApi(null)},[next,prev,goTo,search,onApi]);
  useEffect(()=>{if(!pdf)return;let chapterIndex=0;toc.forEach((item,index)=>{const loc=parseLocator<PdfLocator>(item.locator);if((loc?.page||1)<=page)chapterIndex=index});onLocation({locator:JSON.stringify({type:"pdf",page}),progress:page/pdf.numPages*100,page,totalPages:pdf.numPages,chapterTitle:toc[chapterIndex]?.label||`第 ${page} 页`,chapterIndex,chapterCount:toc.length})},[pdf,page,toc,onLocation]);
  if(error)return <div className="readerError"><strong>PDF 打开失败</strong><p>{error}</p></div>;
  if(!pdf)return <div className="readerLoading"><span/><p>正在解析 PDF…</p></div>;
  const first=Math.max(1,page-renderRadius),last=Math.min(pdf.numPages,page+renderRadius),pages=Array.from({length:last-first+1},(_,index)=>first+index);
  const preserveView=(nextWidth:number,nextSlotHeight:number)=>{const element=host.current;if(!element)return;const horizontal=(element.scrollLeft+element.clientWidth/2)/Math.max(1,trackWidth),within=(element.scrollTop-(pageRef.current-1)*slotHeight)/Math.max(1,slotHeight);requestAnimationFrame(()=>requestAnimationFrame(()=>{const current=host.current;if(!current)return;current.scrollLeft=Math.max(0,horizontal*Math.max(current.clientWidth,nextWidth+32)-current.clientWidth/2);current.scrollTop=Math.max(0,(pageRef.current-1)*nextSlotHeight+within*nextSlotHeight)}))};
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
    onScroll={event=>{if(restoring.current)return;setPage(Math.min(pdf.numPages,Math.max(1,Math.round(event.currentTarget.scrollTop/slotHeight)+1)))}}
    onWheel={event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();changeZoom(zoom-event.deltaY*.002)}}}
    onTouchStart={event=>{if(event.touches.length===2)pinch.current=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY)}}
    onTouchMove={event=>{if(event.touches.length!==2||!pinch.current)return;const distance=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);if(Math.abs(distance-pinch.current)>12){changeZoom(zoom+(distance>pinch.current ? .1 : -.1));pinch.current=distance}}}
    onTouchEnd={event=>{if(pinch.current){event.stopPropagation();pinch.current=0}}}
    onPointerDown={event=>{if(event.button!==0||pageWidth<=hostWidth||((event.target as HTMLElement).closest(".pdfTextLayer span")))return;drag.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,top:event.currentTarget.scrollTop,moved:false};event.currentTarget.setPointerCapture(event.pointerId);setPanning(true)}}
    onPointerMove={event=>{const start=drag.current;if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>4)start.moved=true;event.currentTarget.scrollLeft=start.left-dx;event.currentTarget.scrollTop=start.top-dy}}
    onPointerUp={event=>{if(!drag.current)return;event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;setPanning(false)}}
    onPointerCancel={()=>{drag.current=null;setPanning(false)}} style={{background:settings.pageColor}}>
    <div className="pdfVirtualTrack" style={{width:trackWidth}}>
      <div style={{height:(first-1)*slotHeight}}/>
      {pages.map(pageNumber=><div className="pdfSlot" style={{height:slotHeight}} key={pageNumber}><PdfPage pdf={pdf} pageNumber={pageNumber} annotations={annotations} onSelection={onSelection} onRendered={handlePageRendered} scaleHint={scaleHint} zoom={zoom} pageColor={settings.pageColor}/></div>)}
      <div style={{height:Math.max(0,pdf.numPages-last)*slotHeight}}/>
    </div>
    {!firstPageReady&&<div className="readerLoading pdfLoadingOverlay"><span/><p>正在呈现第 {initialPage} 页…</p></div>}
  </div></div>;
}
