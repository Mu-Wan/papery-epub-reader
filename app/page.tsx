"use client";
import { readingPercent } from "./lib/reading-progress";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-assign-module-variable */

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlignJustify, AppWindow, BarChart3, BookOpen, Camera,
  CircleHelp, Columns2, Download, FileText, FolderOpen,
  Library, Maximize2, Minus, MoreHorizontal,
  PenLine, Plus, Search, Settings2, Trash2, Upload, X,
} from "./components/PaperyIcons";
import { useDialogFocus } from "./components/use-dialog-focus";
import dynamic from "next/dynamic";
import { LibraryView, type LibraryBook } from "./components/LibraryView";
import { BookMetadataDialog } from "./components/BookMetadataDialog";
import { bookMatchesSearch, defaultShelfView, normalizeShelfView, readingRecency, recentLibraryBooks, type ShelfView } from "./lib/library-groups";
import { BOOK_METADATA_VERSION, cleanAuthor } from "./lib/book-metadata";
import { SelectionGroup } from "./components/SelectionGroup";
import { PaperColorPicker } from "./components/PaperColorPicker";
import { CategoryList } from "./components/CategoryList";
import { orderedCategories } from "./lib/category-order";
import { useBookDrop, useBlankSwipe } from "./components/use-library-gestures";
import { ReaderStatus } from "./components/ReaderStatus";
import { ReaderToolbar } from "./components/ReaderToolbar";
import { AnnotationComposer } from "./components/AnnotationComposer";
import { ThemeSettings } from "./components/ThemeSettings";
import { useAppTheme } from "./components/use-app-theme";
import { themedReaderSettings } from "./lib/app-theme";
import { readBlobBytes } from "./lib/blob-bytes";
import { driveConnected, syncGoogleDrive, type DriveConfig } from "./lib/drive-sync";
import { warmReaderFormat, releaseReaderSource } from "./lib/reader-source";
import { DocumentReader } from "./components/DocumentReader";
import type {
  AppPreferences, ReaderAnnotation, ReaderApi, ReaderLocation, ReaderSearchResult, ReaderSelection, ReaderSettings, TocItem,
} from "./lib/reader-types";
import { defaultAppPreferences, defaultReaderSettings } from "./lib/reader-types";
import { ReadingSessionClock } from "./lib/reading-session";
import { installMobileInsets, installVolumePaging, isLowMemoryDevice } from "./lib/mobile-runtime";
import { sameReaderLocation } from "./lib/reading-scheduler";
import { readerPapers } from "./lib/reader-paper";
import { extractBookCover, readBookMetadata } from "./lib/book-cover";
import {
  createLocalId, deleteCategory, renameCategory, deleteLocalAnnotation, deleteLocalBook, exportLibraryBackup, importLibraryBackup, loadCategories, loadLocalAnnotations,
  loadLocalBooks, loadLocalSessions, loadSetting, loadSettings, saveAppPreferences, saveBookProgress, saveCategory,
  saveLocalAnnotation, saveLocalBook, saveLocalSession, saveReaderSettings, saveSetting, updateLocalBook,
} from "./lib/local-library";
import { getCurrentWindow } from '@tauri-apps/api/window';

const moduleLoading = () => <div className="moduleLoading" role="status" aria-live="polite">正在打开…</div>;
const HelpPanel = dynamic(() => import("./components/HelpPanel").then(module => module.HelpPanel), { ssr: false, loading: moduleLoading });
const NotesView = dynamic(() => import("./components/NotesView").then(module => module.NotesView), { ssr: false, loading: moduleLoading });
const ReadingDashboard = dynamic(() => import("./components/ReadingDashboard").then(module => module.ReadingDashboard), { ssr: false, loading: moduleLoading });
let syncPanelModule:Promise<typeof import("./components/SyncPanel")>|undefined;
const loadSyncPanel=()=>syncPanelModule??=(import("./components/SyncPanel").catch(error=>{syncPanelModule=undefined;throw error}));
const SyncPanel = dynamic(() => loadSyncPanel().then(module => module.SyncPanel), { ssr: false, loading: moduleLoading });


type View = "书库" | "阅读" | "笔记" | "数据";

// Tauri 窗口控制 - 仅在 Tauri 环境中生效
let _tauriWindow: ReturnType<typeof getCurrentWindow> | null = null;
try {
  if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
    _tauriWindow = getCurrentWindow();
  }
} catch (e) {
  // Not in Tauri environment
}

function tauriMinimize() {
  try { _tauriWindow?.minimize(); } catch (e) { console.warn('Tauri minimize failed:', e); }
}
function tauriToggleMaximize() {
  try { _tauriWindow?.toggleMaximize(); } catch (e) { console.warn('Tauri toggleMaximize failed:', e); }
}
function tauriClose() {
  try { _tauriWindow?.close(); } catch (e) { console.warn('Tauri close failed:', e); }
}
type Book = LibraryBook;
type ReadingSession={id:string;book_id:string;started_at:number;duration_seconds:number;words_read:number};

/** Detect mobile platform (Android/iOS) for responsive behavior differences */
const isMobile=typeof window!=="undefined"&&/android|iphone|ipad|ipod/i.test(navigator.userAgent);
const subscribeViewport=(notify:()=>void)=>{const query=window.matchMedia("(max-width:820px)");query.addEventListener("change",notify);return()=>query.removeEventListener("change",notify)};
const narrowViewport=()=>window.matchMedia("(max-width:820px)").matches;
const serverViewport=()=>false;
const desktopRuntime=()=>!isMobile&&("__TAURI_INTERNALS__" in window||"__TAURI__" in window);
const mobileRuntime=()=>isMobile;
let lowMemoryRuntimeValue:boolean|undefined;
const lowMemoryRuntime=()=>isMobile&&(lowMemoryRuntimeValue??=isLowMemoryDevice());
const subscribeRuntime=()=>()=>{};

const coverColors=["peach","dark","cream","mint","blue"];

function Brand(){return <div className="brand"><img className="brandLogo" src="/brand/papery-128.png" alt="" width={36} height={36}/><span>Papery</span></div>}
function UiButton({children,className="",onClick,disabled=false}:{children:React.ReactNode;className?:string;onClick?:()=>void;disabled?:boolean}){return <button disabled={disabled} className={`uiButton ${className}`} onClick={onClick}>{children}</button>}
function normalizeReaderSettings(format:Book["type"],value:ReaderSettings){const merged={...defaultReaderSettings,...value};if(isMobile)merged.spread="single";if(format!=="PDF"){if(merged.horizontalMargin>30)merged.horizontalMargin=Math.min(30,Math.round(merged.horizontalMargin/9));if(merged.horizontalMargin<2)merged.horizontalMargin=2;if(merged.verticalMargin>18)merged.verticalMargin=Math.min(18,Math.round(merged.verticalMargin/8))}return merged}
function stableAnnotationLocator(annotation:ReaderAnnotation){if(annotation.style==="bookmark")return annotation.locator;try{const locator=JSON.parse(annotation.locator) as Record<string,unknown>;if(locator.type!=="txt"&&locator.type!=="epub")return annotation.locator;return JSON.stringify({...locator,quote:typeof locator.quote==="string"?locator.quote:annotation.quote,anchor:true,annotationId:annotation.id})}catch{return annotation.locator}}

export default function Home(){
  const [view,setView]=useState<View>("书库");
  const [books,setBooks]=useState<Book[]>([]);
  const [selectedBook,setSelectedBook]=useState<Book|null>(null);
  const [lastReadId,setLastReadId]=useState<string|null>(null);
  const [shelfView,setShelfView]=useState<ShelfView>(defaultShelfView);
  const [editBookTarget,setEditBookTarget]=useState<Book|null>(null);
  const [annotations,setAnnotations]=useState<ReaderAnnotation[]>([]);
  const [categories,setCategories]=useState<string[]>(["未分类"]);
  const [editCategoryTarget,setEditCategoryTarget]=useState<string|null>(null);
  const [sessions,setSessions]=useState<ReadingSession[]>([]);
  const [search,setSearch]=useState("");const [category,setCategory]=useState("全部");
  const [sidebarOpen,setSidebarOpen]=useState(false);const [immersive,setImmersive]=useState(true);const [readingUi,setReadingUi]=useState(true);
  const mobileDevice=useSyncExternalStore(subscribeRuntime,mobileRuntime,serverViewport);
  const narrowLayout=useSyncExternalStore(subscribeViewport,narrowViewport,serverViewport)||mobileDevice;const desktopWindow=useSyncExternalStore(subscribeRuntime,desktopRuntime,serverViewport);
  const navigationRoot=useDialogFocus<HTMLElement>(()=>setSidebarOpen(false),narrowLayout&&sidebarOpen);
  const [importOpen,setImportOpen]=useState(false);const [categoryOpen,setCategoryOpen]=useState(false);const [bookMenu,setBookMenu]=useState<string|null>(null);
  const [deleteBookTarget,setDeleteBookTarget]=useState<Book|null>(null);
  const [deleteNoteTarget,setDeleteNoteTarget]=useState<ReaderAnnotation|null>(null);
  const [deleteCategoryTarget,setDeleteCategoryTarget]=useState<string|null>(null);
  const [readerSettingsOpen,setReaderSettingsOpen]=useState(false);const [appSettingsOpen,setAppSettingsOpen]=useState(false);const [tocOpen,setTocOpen]=useState(false);const [bookSearchOpen,setBookSearchOpen]=useState(false);
  const [navigationTab,setNavigationTab]=useState<"toc"|"marks">("toc");
  const [profileOpen,setProfileOpen]=useState(false);const [edgeCue,setEdgeCue]=useState<"left"|"right"|null>(null);
  const [preferencesReady,setPreferencesReady]=useState(false);const persistedPreferences=useRef("");
  const [readerSettings,setReaderSettings]=useState<ReaderSettings>(defaultReaderSettings);const [appPreferences,setAppPreferences]=useState<AppPreferences>(defaultAppPreferences);
  const [readerSettingsBookId,setReaderSettingsBookId]=useState<string|null>(null);
  const persistedReaderSettings=useRef({bookId:"",json:""});
  const [readerApi,setReaderApi]=useState<ReaderApi|null>(null);const [location,setLocation]=useState<ReaderLocation>({locator:"",progress:0,page:1,totalPages:1,chapterTitle:"正文",chapterIndex:0,chapterCount:1});const [toc,setToc]=useState<TocItem[]>([]);
  const [readerInitialLocation,setReaderInitialLocation]=useState<string|undefined>();
  const [selection,setSelection]=useState<ReaderSelection|null>(null);const [editingNote,setEditingNote]=useState<ReaderAnnotation|null>(null);const [toast,setToast]=useState("");
  const [syncOpen,setSyncOpen]=useState(false),[syncLabel,setSyncLabel]=useState("仅保存在本机"),[helpOpen,setHelpOpen]=useState(false);
  const touchStart=useRef({x:0,y:0});const sessionClock=useRef(new ReadingSessionClock());const pendingLocator=useRef<string|null>(null);const selectionGuard=useRef(0);const progressTimer=useRef<number|null>(null);const pendingProgress=useRef<{bookId:string;location:ReaderLocation}|null>(null);const booksRef=useRef<Book[]>([]);
  const ownedSources=useRef(new Set<string>());
  const bookSource=useCallback((blob:Blob)=>{const source=URL.createObjectURL(blob);ownedSources.current.add(source);return source},[]);
  useEffect(()=>{const owned=ownedSources.current;return()=>{for(const source of owned)releaseReaderSource(source);owned.clear()}},[]);
  const theme=useAppTheme(appPreferences);
  const effectiveReaderSettings=useMemo(()=>themedReaderSettings(isMobile&&readerSettings.spread!=="single"?{...readerSettings,spread:"single" as const}:readerSettings,theme.dark),[readerSettings,theme.dark]);
  const renderedReaderSettings=useDeferredValue(effectiveReaderSettings);
  const selectedBookId=selectedBook?.id,selectedBookType=selectedBook?.type;

  useEffect(()=>installMobileInsets(),[]);
  const lowMemory=useSyncExternalStore(subscribeRuntime,lowMemoryRuntime,serverViewport);
  useEffect(()=>{if(profileOpen)void loadSyncPanel().catch(()=>{})},[profileOpen]);

  const notify=useCallback((message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),1800)},[]);

  useEffect(()=>{const query=window.matchMedia("(max-width:820px)");const update=()=>{if(!query.matches)setSidebarOpen(false)};query.addEventListener("change",update);return()=>query.removeEventListener("change",update)},[]);

  useEffect(()=>{const ignoreBenignResizeLoop=(event:ErrorEvent)=>{if(/^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/.test(event.message)){event.preventDefault();event.stopImmediatePropagation()}};window.addEventListener("error",ignoreBenignResizeLoop,true);return()=>window.removeEventListener("error",ignoreBenignResizeLoop,true)},[]);

  // Mobile back navigation: use History API so Android back gesture returns to previous view
  useEffect(()=>{if(!isMobile)return;const handlePop=()=>{setView(current=>{if(current==="阅读")return"书库";if(current==="笔记"||current==="数据")return"书库";return current})};window.addEventListener("popstate",handlePop);return()=>window.removeEventListener("popstate",handlePop)},[]);
  const pushHistory=useCallback(()=>{if(isMobile)window.history.pushState({view:true},"")},[]);

  useEffect(()=>{(async()=>{
    const settled=await Promise.allSettled([loadLocalBooks(),loadLocalAnnotations(),loadCategories(),loadSetting<AppPreferences>("app"),loadLocalSessions()]);
    const localBooks=settled[0].status==="fulfilled"?settled[0].value:[],localAnnotations=settled[1].status==="fulfilled"?settled[1].value:[],localCategories=settled[2].status==="fulfilled"?settled[2].value:[],prefs=settled[3].status==="fulfilled"?settled[3].value:null,localSessions=settled[4].status==="fulfilled"?settled[4].value:[];
    const cachedCovers=await loadSettings<string>(localBooks.map(record=>`cover:${record.id}`)).catch(()=>new Map<string,string|null>());for(const record of localBooks){const cached=cachedCovers.get(`cover:${record.id}`);if(cached)record.coverDataUrl=cached;}
    const restored:Book[]=localBooks.map((record,index)=>{let progress=record.progress,currentLocation=record.currentLocation,lastReadAt=record.lastReadAt;
      // Merge localStorage fallback: localStorage is written synchronously on every
      // page-turn so it is always >= IDB freshness. Prefer it when progress >= IDB.
      try{const ls=localStorage.getItem(`papery-progress-${record.id}`);if(ls){const cached=JSON.parse(ls) as {p:number;l:string;t:number};if(cached.t>=record.updatedAt&&cached.l){progress=cached.p;currentLocation=cached.l}if(cached.l&&Number.isFinite(cached.t))lastReadAt=Math.max(lastReadAt||0,cached.t)}const opened=Number(localStorage.getItem(`papery-opened-${record.id}`));if(Number.isFinite(opened)&&opened>0)lastReadAt=Math.max(lastReadAt||0,opened)}catch{}
      return{id:record.id,title:record.title,author:record.author,progress,type:record.format,color:coverColors[index%coverColors.length],category:record.category,last:"本地保存",source:bookSource(record.blob),blob:record.blob,coverDataUrl:record.coverDataUrl,currentLocation,importedAt:record.importedAt,publicationYear:record.publicationYear,lastReadAt,fileName:record.fileName}});
    const available:Book[]=restored;const nextPreferences={...defaultAppPreferences,...prefs,profileName:prefs?.profileName?.trim()||defaultAppPreferences.profileName,avatarDataUrl:!prefs?.avatarDataUrl||prefs.avatarDataUrl==="/brand/default-avatar.svg"?defaultAppPreferences.avatarDataUrl:prefs.avatarDataUrl};setBooks(available);setAnnotations(localAnnotations);setSessions(localSessions);setCategories(orderedCategories([...localCategories,...restored.map(book=>book.category)],await loadSetting<string[]>("category-order").catch(()=>null)||[]));persistedPreferences.current=JSON.stringify(nextPreferences);setAppPreferences(nextPreferences);setPreferencesReady(true);
    // Restore last-read book: try IDB setting first, fall back to localStorage
    let restoredLastId=await loadSetting<string>("last-read-book-id").catch(()=>null);
    try{restoredLastId=localStorage.getItem("papery-last-book")||restoredLastId}catch{}
    setLastReadId(restoredLastId);setShelfView(normalizeShelfView(await loadSetting<ShelfView>("library-view").catch(()=>null)));
    const restoredRecent=recentLibraryBooks(available,readingRecency(available,localSessions,restoredLastId));
    const lastReadBook=available.find(b=>b.id===restoredLastId)||restoredRecent[0]||available[0];
    setSelectedBook(lastReadBook||null);
    void (async()=>{for(const record of localBooks){
      const needsMetadata=!record.metadataEdited&&(record.metadataVersion||0)<BOOK_METADATA_VERSION;
      const needsCover=!record.coverDataUrl&&record.format!=="TXT";
      if(!needsMetadata&&!needsCover)continue;
      const patch:{author?:string;publicationYear?:number;coverDataUrl?:string|null;metadataVersion?:number}={};
      if(needsMetadata){try{const metadata=await readBookMetadata(record.blob,record.format,record.fileName);if(!cleanAuthor(record.author)&&metadata.author)patch.author=metadata.author;if(!record.publicationYear&&metadata.publicationYear)patch.publicationYear=metadata.publicationYear;if(metadata.coverDataUrl)patch.coverDataUrl=metadata.coverDataUrl;patch.metadataVersion=BOOK_METADATA_VERSION}catch{}}
      if(needsCover&&!patch.coverDataUrl)patch.coverDataUrl=await extractBookCover(record.blob,record.format).catch(()=>null);
      if(patch.coverDataUrl)await saveSetting(`cover:${record.id}`,patch.coverDataUrl);
      const saved=await updateLocalBook(record.id,patch,true).catch(()=>null);if(!saved)continue;
      const apply=(book:Book)=>({...book,author:saved.author,publicationYear:saved.publicationYear,coverDataUrl:saved.coverDataUrl||book.coverDataUrl});
      setBooks(current=>current.map(book=>book.id===record.id?apply(book):book));setSelectedBook(current=>current?.id===record.id?apply(current):current);
    }})();
    if(lastReadBook&&nextPreferences.startPage==="last-read"){setView("阅读");setReaderInitialLocation(lastReadBook.currentLocation||undefined);}
  })();},[]);

  useEffect(()=>{if(!selectedBookId||!selectedBookType)return;let active=true;loadSetting<ReaderSettings>(`reader:${selectedBookId}`).then(value=>{if(!active)return;const next=normalizeReaderSettings(selectedBookType,{...defaultReaderSettings,...value});persistedReaderSettings.current={bookId:selectedBookId,json:JSON.stringify(next)};setReaderSettings(next);setReaderSettingsBookId(selectedBookId)}).catch(()=>notify("排版设置读取失败，请重新打开书籍"));return()=>{active=false}},[selectedBookId,selectedBookType,notify]);
  const flushReaderSettings=useCallback(async()=>{if(!selectedBookId||readerSettingsBookId!==selectedBookId)return;const json=JSON.stringify(readerSettings);if(persistedReaderSettings.current.bookId===selectedBookId&&persistedReaderSettings.current.json===json)return;await saveReaderSettings(selectedBookId,readerSettings);persistedReaderSettings.current={bookId:selectedBookId,json}},[selectedBookId,readerSettingsBookId,readerSettings]);
  useEffect(()=>{const timer=window.setTimeout(()=>{void flushReaderSettings().catch(()=>notify("排版设置保存失败，请稍后重试"))},400);return()=>clearTimeout(timer)},[flushReaderSettings,notify]);
  useEffect(()=>{if(preferencesReady&&persistedPreferences.current!==JSON.stringify(appPreferences)){persistedPreferences.current=JSON.stringify(appPreferences);void saveAppPreferences(appPreferences)}},[appPreferences,preferencesReady]);
  useEffect(()=>{booksRef.current=books},[books]);
  useEffect(()=>{
    if(view!=="书库"||!selectedBookType)return;
    const timer=window.setTimeout(()=>{if(!document.hidden)warmReaderFormat(selectedBookType)},250);
    return()=>window.clearTimeout(timer);
  },[view,selectedBookType]);
  const prepareReader=useCallback((book:Book)=>warmReaderFormat(book.type),[]);

  const flushProgress=useCallback(()=>{const pending=pendingProgress.current;if(!pending)return Promise.resolve();pendingProgress.current=null;const rounded=pending.location.progress;setBooks(current=>{let changed=false;const next=current.map(item=>{if(item.id!==pending.bookId||item.progress===rounded&&item.currentLocation===pending.location.locator&&item.last==="刚刚")return item;changed=true;return {...item,progress:rounded,currentLocation:pending.location.locator,last:"刚刚"}});return changed?next:current});setSelectedBook(current=>current&&current.id===pending.bookId&&(current.progress!==rounded||current.currentLocation!==pending.location.locator||current.last!=="刚刚")?{...current,progress:rounded,currentLocation:pending.location.locator,last:"刚刚"}:current);
    // CRITICAL: synchronous localStorage write survives window close (IndexedDB
    // async transactions may be aborted when Tauri's WebView is destroyed)
    try{localStorage.setItem(`papery-progress-${pending.bookId}`,JSON.stringify({p:pending.location.progress,l:pending.location.locator,t:Date.now()}));localStorage.setItem("papery-last-book",pending.bookId)}catch{}
     return saveBookProgress(pending.bookId,pending.location.progress,pending.location.locator).catch(e=>console.warn("[Papery] IDB save failed:",e))},[]);
  const persistReadingSession=useCallback((session:ReturnType<ReadingSessionClock["checkpoint"]>)=>{if(!session)return;setSessions(current=>{const existing=current.find(item=>item.id===session.id);return existing?current.map(item=>item.id===session.id?session:item):[session,...current]});void saveLocalSession(session).catch(()=>console.warn("[Papery] Reading session pending recovery"))},[]);
  const pauseReadingSession=useCallback(()=>persistReadingSession(sessionClock.current.pause(Date.now())),[persistReadingSession]);
  // Tauri programmatic close: flush progress BEFORE the WebView is destroyed.
  // In Tauri v2, registering onCloseRequested PREVENTS the default close, so we
  // must explicitly call destroy() to actually close the window.
  useEffect(()=>{if(!_tauriWindow)return;let unlisten:(()=>void)|null=null;_tauriWindow.onCloseRequested(()=>{pauseReadingSession();flushProgress();try{_tauriWindow?.destroy()}catch{}}).then(fn=>{unlisten=fn}).catch(()=>{});return()=>{unlisten?.()}},[flushProgress,pauseReadingSession]);
  const readingBlocked=profileOpen||appSettingsOpen||helpOpen||sidebarOpen||tocOpen||readerSettingsOpen||bookSearchOpen||!!selection||!!editingNote||!!deleteNoteTarget||importOpen||categoryOpen||!!deleteBookTarget||!!deleteCategoryTarget||!!editCategoryTarget;
  const readerReady=Boolean(readerApi);
  useEffect(()=>{
    const clock=sessionClock.current;
    const resume=()=>{if(view==="阅读"&&selectedBookId&&readerReady&&!readingBlocked&&!document.hidden)clock.start(selectedBookId,createLocalId(),Date.now())};
    const pause=()=>{pauseReadingSession();void flushProgress()};
    const visibility=()=>{if(document.hidden)pause();else resume()};
    resume();
    const timer=window.setInterval(()=>{persistReadingSession(clock.checkpoint(Date.now()));void flushProgress()},5000);
    document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",pause);window.addEventListener("beforeunload",pause);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",pause);window.removeEventListener("beforeunload",pause);pause()};
  },[view,selectedBookId,readerReady,readingBlocked,flushProgress,persistReadingSession,pauseReadingSession]);
  useEffect(()=>installVolumePaging(isMobile&&view==="阅读"&&readerReady&&!readingBlocked,direction=>readerApi?.[direction]()),[view,readerReady,readerApi,readingBlocked]);
  const idbThrottle=useRef(0);
  const lastReportedLocation=useRef<{bookId:string|null;location:ReaderLocation}|null>(null);
  const journalBook=useRef<string|null>(null);
  const handleLocation=useCallback((next:ReaderLocation)=>{const previous=lastReportedLocation.current;if(previous&&previous.bookId===(selectedBookId||null)&&sameReaderLocation(previous.location,next))return;lastReportedLocation.current={bookId:selectedBookId||null,location:next};setLocation(next);if(!selectedBookId)return;pendingProgress.current={bookId:selectedBookId,location:next};
    // Immediate synchronous localStorage write on every location change so that
    // even an abrupt window kill loses at most one page-turn of progress.
    try{localStorage.setItem(`papery-progress-${selectedBookId}`,JSON.stringify({p:next.progress,l:next.locator,t:Date.now()}));if(journalBook.current!==selectedBookId){localStorage.setItem("papery-last-book",selectedBookId);journalBook.current=selectedBookId}}catch{}
    // Throttled direct IDB write (every 2s) as a second persistence layer
    const now=Date.now();if(now-idbThrottle.current>2000){idbThrottle.current=now;saveBookProgress(selectedBookId,next.progress,next.locator).catch(()=>{})}
    if(progressTimer.current)window.clearTimeout(progressTimer.current);progressTimer.current=window.setTimeout(()=>{progressTimer.current=null;flushProgress()},650)},[selectedBookId,flushProgress]);
  useEffect(()=>()=>{if(progressTimer.current)window.clearTimeout(progressTimer.current);flushProgress()},[selectedBookId,flushProgress]);
  useEffect(()=>{const onVisibility=()=>{if(document.hidden)flushProgress()};const onUnload=()=>flushProgress();const onBlur=()=>flushProgress();document.addEventListener("visibilitychange",onVisibility);window.addEventListener("beforeunload",onUnload);window.addEventListener("blur",onBlur);return()=>{document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("beforeunload",onUnload);window.removeEventListener("blur",onBlur)}},[flushProgress]);
  const toggleReadingUi=useCallback(()=>setReadingUi(value=>!value),[]);
  const handleToc=useCallback((items:TocItem[])=>setToc(items),[]);const handleSelection=useCallback((value:ReaderSelection)=>{if(value.quote){selectionGuard.current=Date.now()+500;setSelection(value)}},[]);
  const tocGo=useCallback((locator:string)=>{readerApi?.goTo(locator);setTocOpen(false)},[readerApi]);
  const bookSearchGo=useCallback((locator:string)=>{readerApi?.goTo(locator);setBookSearchOpen(false)},[readerApi]);
  const closeToc=useCallback(()=>setTocOpen(false),[]);const closeBookSearch=useCallback(()=>setBookSearchOpen(false),[]);
  useEffect(()=>{if(readerApi&&pendingLocator.current){readerApi.goTo(pendingLocator.current);pendingLocator.current=null}},[readerApi]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(view!=="阅读"||event.defaultPrevented||profileOpen||document.querySelector('[role="dialog"][aria-modal="true"]'))return;if((event.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable=true]")||tocOpen||readerSettingsOpen||bookSearchOpen||selection||editingNote||deleteNoteTarget)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"){event.preventDefault();setBookSearchOpen(true);return}if(["ArrowRight","PageDown"].includes(event.key)||event.key===" "&&!event.shiftKey){event.preventDefault();readerApi?.next()}if(["ArrowLeft","PageUp"].includes(event.key)||event.key===" "&&event.shiftKey){event.preventDefault();readerApi?.prev()}if(event.key==="Escape")setReadingUi(value=>!value);if(event.key.toLowerCase()==="t")setTocOpen(value=>!value)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[view,readerApi,tocOpen,readerSettingsOpen,bookSearchOpen,selection,editingNote,deleteNoteTarget,profileOpen]);
  useEffect(()=>{if(!bookMenu)return;const dismiss=(event:PointerEvent)=>{if(!(event.target as HTMLElement).closest("[data-book-menu-root]"))setBookMenu(null)},escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setBookMenu(null)};document.addEventListener("pointerdown",dismiss);window.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",dismiss);window.removeEventListener("keydown",escape)}},[bookMenu]);

  const enterReader=useCallback((book:Book,locator?:string)=>{warmReaderFormat(book.type);flushProgress();let startingLocation=locator||book.currentLocation;if(!locator){try{const ls=localStorage.getItem(`papery-progress-${book.id}`);if(ls){const cached=JSON.parse(ls) as {p:number;l:string;t:number};startingLocation=cached.l||undefined}}catch{}}if(view==="阅读"&&selectedBook?.id===book.id){if(startingLocation)readerApi?.goTo(startingLocation);return;}const now=Date.now();setLastReadId(book.id);setBooks(current=>current.map(item=>item.id===book.id?{...item,lastReadAt:now}:item));void updateLocalBook(book.id,{lastReadAt:now}).catch(()=>{});setReaderApi(null);lastReportedLocation.current=null;pendingLocator.current=locator||null;setReaderInitialLocation(startingLocation);setLocation({locator:startingLocation||"",progress:book.progress,page:1,totalPages:1,chapterTitle:"正在定位…",chapterIndex:0,chapterCount:1});setSelectedBook({...book,lastReadAt:now});pushHistory();setView("阅读");setReadingUi(true);setSidebarOpen(false);void saveSetting("last-read-book-id",book.id).catch(()=>{});try{localStorage.setItem("papery-last-book",book.id);localStorage.setItem(`papery-opened-${book.id}`,String(now))}catch{}},[flushProgress,view,selectedBook?.id,readerApi,pushHistory]);
  const reloadSyncedLibrary=useCallback(async()=>{
    const [records,notes,cats,readingSessions]=await Promise.all([loadLocalBooks(),loadLocalAnnotations(),loadCategories(),loadLocalSessions()]);
    const next:Book[]=records.map((record,index)=>({id:record.id,title:record.title,author:record.author,progress:record.progress,type:record.format,color:coverColors[index%coverColors.length],category:record.category,last:"已同步",source:booksRef.current.find(book=>book.id===record.id)?.source||bookSource(record.blob),blob:record.blob,coverDataUrl:record.coverDataUrl,currentLocation:record.currentLocation,importedAt:record.importedAt,publicationYear:record.publicationYear,lastReadAt:record.lastReadAt,fileName:record.fileName}));
    const retained=new Set(next.map(book=>book.source));for(const old of booksRef.current){if(!retained.has(old.source)){releaseReaderSource(old.source);ownedSources.current.delete(old.source)}}
    setBooks(next);setAnnotations(notes);setCategories(orderedCategories(cats,await loadSetting<string[]>("category-order").catch(()=>null)||[]));setSessions(readingSessions);setSelectedBook(current=>next.find(book=>book.id===current?.id)||next[0]||null);setSyncLabel("已同步 · "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
  },[]);
  useEffect(()=>{if(view!=="书库"||syncOpen)return;const timer=window.setInterval(()=>{void loadSetting<DriveConfig>("sync:drive-config").then(config=>{if(!config?.autoSync||document.hidden||!navigator.onLine)return;if(!driveConnected()){setSyncLabel("Google 授权已过期，请重新连接");return;}void syncGoogleDrive(setSyncLabel).then(reloadSyncedLibrary).catch(error=>setSyncLabel(error instanceof Error?error.message:"同步失败，数据保留在本机"));})},60000);return()=>clearInterval(timer)},[view,syncOpen,reloadSyncedLibrary]);
  const exportData=async()=>{try{await flushProgress();await flushReaderSettings();const blob=await exportLibraryBackup();const fileName=`papery-backup-${new Date().toISOString().slice(0,10)}.json`;if("__TAURI_INTERNALS__" in window){try{const {save}=await import("@tauri-apps/plugin-dialog");const {writeTextFile}=await import("@tauri-apps/plugin-fs");const path=await save({defaultPath:fileName,filters:[{name:"JSON 备份",extensions:["json"]}]});if(!path)return;await writeTextFile(path,await blob.text());notify(`备份已导出至 ${path}`)}catch(e){notify("导出失败："+(e instanceof Error?e.message:"未知错误"))}}else{const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=fileName;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);notify("完整数据备份已导出")}}catch(error){notify("导出失败："+(error instanceof Error?error.message:"未知错误"))}};
  const importData=async(file:File)=>{try{await flushProgress();await flushReaderSettings();await importLibraryBackup(file);notify("数据已合并恢复，正在重新载入");window.setTimeout(()=>window.location.reload(),700)}catch(error){notify(error instanceof Error?error.message:"备份加载失败")}};
  const filteredBooks=useMemo(()=>books.filter(book=>(search.trim()||category==="全部"||book.category===category)&&bookMatchesSearch(book,search)),[books,category,search]);
  const changeShelfView=(next:ShelfView)=>{setShelfView(next);void saveSetting("library-view",next).catch(()=>notify("分组偏好保存失败，请重试"))};
  const saveBookMetadata=async(values:{title:string;author:string;publicationYear?:number})=>{if(!editBookTarget)return;const saved=await updateLocalBook(editBookTarget.id,{...values,metadataEdited:true,metadataVersion:BOOK_METADATA_VERSION});if(!saved)throw new Error("书籍已删除");setBooks(current=>current.map(book=>book.id===saved.id?{...book,...values}:book));setSelectedBook(current=>current?.id===saved.id?{...current,...values}:current);notify("书籍信息已保存")};
  const categoryBookCounts=useMemo(()=>{const m:Record<string,number>=Object.create(null);for(const b of books){m[b.category]=(m[b.category]||0)+1}return m},[books]);

  const importFiles=async(files:File[])=>{let imported=0;const failed:string[]=[];
    for(const file of files){const extension=file.name.split(".").pop()?.toUpperCase();if(!extension||!["TXT","EPUB","PDF"].includes(extension)){failed.push(`${file.name} 格式不支持`);continue}
      try{const bytes=await readBlobBytes(file);if(!bytes.byteLength)throw new Error("文件为空，请选择原文件");const storedBlob=new Blob([bytes],{type:file.type});const id=createLocalId();let title=file.name.replace(/\.[^.]+$/,""),author="未知作者",metadataVersion=0;let metadataCover:string|null|undefined,publicationYear:number|undefined;
        try{const metadata=await readBookMetadata(storedBlob,extension,file.name);title=metadata.title||title;author=metadata.author||author;publicationYear=metadata.publicationYear;metadataCover=metadata.coverDataUrl;metadataVersion=BOOK_METADATA_VERSION;
          if(metadata.totalPages)await saveSetting(`analysis:${id}`,{totalPages:metadata.totalPages,analyzedAt:Date.now()});else if(extension==="TXT")await saveSetting(`analysis:${id}`,{fileSize:file.size,analyzedAt:Date.now()});
        }catch{}
        const coverDataUrl=metadataCover===undefined?await extractBookCover(storedBlob,extension).catch(()=>null):metadataCover;await saveSetting(`cover:${id}`,coverDataUrl);const importedAt=Date.now();
        const book:Book={id,title,author,coverDataUrl,publicationYear,importedAt,fileName:file.name,progress:0,type:extension as Book["type"],color:coverColors[books.length%coverColors.length],category:"未分类",last:"刚刚",source:bookSource(storedBlob),blob:storedBlob};
        await saveLocalBook({id,title,author,format:book.type,category:book.category,progress:0,coverDataUrl,publicationYear,importedAt,fileName:file.name,metadataVersion,blob:storedBlob,updatedAt:importedAt});setBooks(current=>[book,...current]);imported++;
      }catch(error){failed.push(`${file.name}：${error instanceof Error?error.message:"保存失败"}`)}
    }if(!imported)throw new Error(failed.join("；")||"未选择可导入的书籍");setImportOpen(false);notify(`已导入 ${imported} 本书${failed.length?`，${failed.length} 本未导入`:""}`)
  };

  const moveBook=async(book:Book,nextCategory:string)=>{await updateLocalBook(book.id,{category:nextCategory});setBooks(current=>current.map(item=>item.id===book.id?{...item,category:nextCategory}:item));setSelectedBook(current=>current?.id===book.id?{...current,category:nextCategory}:current);setBookMenu(null)};
  const removeBook=async()=>{const target=deleteBookTarget;if(!target)return;const remaining=books.filter(item=>item.id!==target.id);setBooks(remaining);setAnnotations(current=>current.filter(item=>item.bookId!==target.id));if(selectedBook?.id===target.id){setSelectedBook(remaining[0]||null);if(view==="阅读")setView("书库")}setBookMenu(null);setDeleteBookTarget(null);releaseReaderSource(target.source);ownedSources.current.delete(target.source);await deleteLocalBook(target.id);notify("书籍及其本地记录已删除")};
  const addCategory=async(name:string)=>{const cleaned=name.trim();if(!cleaned||categories.includes(cleaned))throw new Error("已有同名分类，请换一个名称");await saveCategory(cleaned);setCategories(current=>orderedCategories([...current,cleaned]));setCategoryOpen(false);notify("分类已创建")};
  const editCategory=async(name:string)=>{const old=editCategoryTarget,cleaned=name.trim();if(!old)return;if(cleaned!==old&&categories.includes(cleaned))throw new Error("已有同名分类，请换一个名称");await renameCategory(old,cleaned);setBooks(current=>current.map(book=>book.category===old?{...book,category:cleaned}:book));setSelectedBook(current=>current?.category===old?{...current,category:cleaned}:current);setCategories(current=>current.map(item=>item===old?cleaned:item));if(category===old)setCategory(cleaned);setEditCategoryTarget(null);notify("分类名称已更新")};
  const removeCategory=async(name:string)=>{if(name==="未分类")return;try{await deleteCategory(name);setBooks(current=>current.map(item=>item.category===name?{...item,category:"未分类"}:item));setSelectedBook(current=>current?.category===name?{...current,category:"未分类"}:current);setCategories(current=>current.filter(c=>c!==name));if(category===name)setCategory("全部");setDeleteCategoryTarget(null);notify("分类已删除，书籍归入未分类")}catch(error){notify(error instanceof Error?error.message:"分类删除失败")}};
  useEffect(()=>{if(preferencesReady)void saveSetting("category-order",categories).catch(()=>{})},[categories,preferencesReady]);
  const bookDrop=useBookDrop(importFiles,notify);
  useBlankSwipe(mobileDevice&&!sidebarOpen,()=>setSidebarOpen(true));
  const toggleBookmark=async()=>{if(!selectedBook)return;if(isCurrentPageBookmarked){const target=readerAnnotations.find(item=>item.style==="bookmark"&&item.locator===location.locator);if(target){setAnnotations(current=>current.filter(item=>item.id!==target.id));await deleteLocalAnnotation(target.id);notify("书签已移除")}}else{saveAnnotation("bookmark","","#f2a257")}};
  const handleAnnotation=useCallback((annotation:ReaderAnnotation)=>{selectionGuard.current=Date.now()+500;setSelection(null);setEditingNote(annotation)},[]);
  const saveAnnotation=useCallback(async(style:"highlight"|"underline"|"bookmark",note:string,color:string)=>{const annotationBookId=editingNote?.bookId||selectedBook?.id;if(!annotationBookId)return;const source=editingNote?{quote:editingNote.quote,locator:editingNote.locator}:style==="bookmark"?{quote:location.chapterTitle,locator:location.locator}:selection;if(!source)return;const now=Date.now();const annotation:ReaderAnnotation={id:editingNote?.id||createLocalId(),bookId:annotationBookId,style,quote:source.quote,note,locator:source.locator,color,chapterTitle:editingNote?.chapterTitle||location.chapterTitle,progress:editingNote?.progress??location.progress,createdAt:editingNote?.createdAt||editingNote?.updatedAt||now,updatedAt:now};setAnnotations(current=>[annotation,...current.filter(item=>item.id!==annotation.id)]);await saveLocalAnnotation(annotation);setSelection(null);setEditingNote(null);notify(style==="bookmark"?"书签已保存":"标注与笔记已保存")},[editingNote,selectedBook?.id,location,selection,notify]);
  const deleteAnnotation=async(id:string)=>{try{await deleteLocalAnnotation(id);setAnnotations(current=>current.filter(item=>item.id!==id));setEditingNote(current=>current?.id===id?null:current);setSelection(null);setDeleteNoteTarget(null);notify("笔记已删除")}catch{notify("删除未完成，请重试")}};
  const openAnnotation=(annotation:ReaderAnnotation)=>{const book=books.find(item=>item.id===annotation.bookId);if(book)enterReader(book,stableAnnotationLocator(annotation))};

  // Foliate refreshes overlays when this array identity changes; preserve it across page turns.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const readerAnnotations=useMemo(()=>annotations.filter(item=>item.bookId===selectedBookId),[annotations,selectedBookId]);
  const changeUserTab=useCallback((active:boolean)=>setSyncOpen(active),[]);
  const isCurrentPageBookmarked=Boolean(location.locator)&&readerAnnotations.some(item=>item.style==="bookmark"&&item.locator===location.locator);
  const recency=useMemo(()=>readingRecency(books,sessions,lastReadId),[books,sessions,lastReadId]);
  const recentBooks=useMemo(()=>recentLibraryBooks(books,recency),[books,recency]);
  const appTheme=theme.dark?"dark":"light";

  return <main data-compact-layout={narrowLayout?"true":undefined} data-mobile={mobileDevice?"true":undefined} data-low-memory={lowMemory?"true":undefined} data-ready={preferencesReady} data-native-window={desktopWindow?"true":undefined} aria-busy={!preferencesReady} className={`appShell app-${appTheme} density-${appPreferences.density}`} style={theme.tokens as React.CSSProperties}>
    {bookDrop&&<div className="bookDropOverlay" role="status"><BookOpen size={32}/><strong>{bookDrop}</strong><span>TXT · EPUB · PDF</span></div>}<header className="titleBar"><div className="mobileBrand"><Brand/></div><div className="dragRegion" data-tauri-drag-region/><div className="windowActions"><button aria-label="最小化" onClick={tauriMinimize}><Minus size={14}/></button><button aria-label="最大化" onClick={tauriToggleMaximize}><Maximize2 size={13}/></button><button className="closeWindow" aria-label="关闭" onClick={tauriClose}><X size={15}/></button></div></header>
    <div className={`workspace ${view==="阅读"&&immersive?"readerMode":""}`}>
      <aside ref={navigationRoot} className={`sidebar ${sidebarOpen?"open":""}`} role={narrowLayout&&sidebarOpen?"dialog":undefined} aria-label="主导航" aria-modal={narrowLayout&&sidebarOpen?true:undefined} aria-hidden={narrowLayout&&!sidebarOpen?true:undefined} inert={narrowLayout&&!sidebarOpen}><div className="sidebarTop"><Brand/><button className="mobileClose" aria-label="关闭导航" onClick={()=>setSidebarOpen(false)}><X size={20}/></button></div>
        <nav aria-label="主导航"><SelectionGroup className="navList">{[["书库",Library],["阅读",BookOpen],["笔记",PenLine],["数据",BarChart3]].map(([label,Icon])=><button key={String(label)} aria-current={view===label?"page":undefined} disabled={!preferencesReady} className={view===label?"active":""} onClick={()=>{if(label==="阅读"){if(selectedBook)enterReader(selectedBook);else setImportOpen(true)}else setView(label as View);setSidebarOpen(false)}}><Icon size={19}/><span>{String(label)}</span>{label==="阅读"&&selectedBook&&<i>{readingPercent(selectedBook.progress)}%</i>}</button>)}</SelectionGroup></nav>
        <section className="sidebarShelf" aria-label="我的分类"><p>我的分类</p><CategoryList names={categories} selected={category} counts={categoryBookCounts} onSelect={name=>{setCategory(name);setView("书库");setSidebarOpen(false)}} onEdit={setEditCategoryTarget} onDelete={setDeleteCategoryTarget}/><button className="addCategory" onClick={()=>setCategoryOpen(true)}><span><Plus size={14}/>新建分类</span></button></section>
        <div className="sidebarBottom"><button onClick={()=>setHelpOpen(true)}><CircleHelp size={18}/><span>帮助与快捷键</span></button><button onClick={()=>setAppSettingsOpen(true)}><Settings2 size={18}/><span>主题设置</span></button><button className="syncState" aria-label="用户资料与同步" onClick={()=>setProfileOpen(true)}><span className="avatar" style={appPreferences.avatarDataUrl?{backgroundImage:`url(${appPreferences.avatarDataUrl})`}:undefined}>{!appPreferences.avatarDataUrl&&(appPreferences.profileName.trim()[0]||"P")}</span><span className="profileSummary"><strong>{appPreferences.profileName||defaultAppPreferences.profileName}</strong><small><i/>{syncLabel}</small></span><MoreHorizontal size={18}/></button></div>
      </aside>
      {sidebarOpen&&<button className="scrim" aria-label="关闭导航" tabIndex={-1} onClick={()=>setSidebarOpen(false)}/>}<section className="mainPanel" inert={narrowLayout&&sidebarOpen}>
        {view==="书库"&&<LibraryView loading={!preferencesReady} books={filteredBooks} allBooks={books} recentBooks={recentBooks} selectedBook={selectedBook} search={search} setSearch={setSearch} category={category} categories={categories} setCategory={setCategory} onImport={()=>setImportOpen(true)} onRead={enterReader} onReadIntent={prepareReader} onMenu={()=>setSidebarOpen(true)} bookMenu={bookMenu} setBookMenu={setBookMenu} onMove={moveBook} onDelete={setDeleteBookTarget} shelfView={shelfView} onShelfView={changeShelfView} recency={recency} onEdit={book=>{setBookMenu(null);setEditBookTarget(book)}}/>}
        {view==="阅读"&&selectedBook&&<div data-reading-ui={readingUi?"visible":"hidden"} className={`readerPage texture-${renderedReaderSettings.paperTexture} ${isDarkPage(renderedReaderSettings.pageColor)?"readerDark":""}`} style={{backgroundColor:renderedReaderSettings.pageColor,color:isDarkPage(renderedReaderSettings.pageColor)?"#d6d3cb":undefined}} onTouchStart={e=>{if(e.touches.length===1)touchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={e=>{if((selectedBook.type!=="TXT"&&!(selectedBook.type==="PDF"&&renderedReaderSettings.pdfMode==="text"))||selectionGuard.current>Date.now())return;const dx=e.changedTouches[0].clientX-touchStart.current.x,dy=e.changedTouches[0].clientY-touchStart.current.y;if(renderedReaderSettings.flow==="paginated"&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5){selectionGuard.current=Date.now()+500;if(dx<0)readerApi?.next();else readerApi?.prev()}}}>
          <ReaderToolbar title={selectedBook.title} visible={readingUi} format={selectedBook.type} pdfMode={renderedReaderSettings.pdfMode||"original"} bookmarked={isCurrentPageBookmarked} onBack={()=>setView("书库")} onNavigation={()=>{if(isMobile)setSidebarOpen(true);else setImmersive(value=>!value)}} onHide={()=>setReadingUi(false)} onSearch={()=>setBookSearchOpen(true)} onToc={()=>{setNavigationTab("toc");setTocOpen(true)}} onNotes={()=>{setNavigationTab("marks");setTocOpen(true)}} onBookmark={toggleBookmark} onSettings={()=>setReaderSettingsOpen(true)} onPdfMode={pdfMode=>setReaderSettings(current=>({...current,pdfMode}))}/>
          <div className="readingStage" onPointerMove={event=>{if(isMobile||renderedReaderSettings.flow!=="paginated")return;const rect=event.currentTarget.getBoundingClientRect(),ratio=(event.clientX-rect.left)/rect.width;setEdgeCue(ratio<.25?"left":ratio>=.75?"right":null)}} onPointerLeave={()=>setEdgeCue(null)} onClick={event=>{if(selectionGuard.current>Date.now()||window.getSelection()?.toString())return;const target=event.target as HTMLElement;if(target.closest("button,.tocPanel,.settingsPanel,.annotationComposer,.bookSearchPanel"))return;const rect=event.currentTarget.getBoundingClientRect(),ratio=(event.clientX-rect.left)/rect.width;if(renderedReaderSettings.flow==="paginated"){if(ratio<.25)readerApi?.prev();else if(ratio>=.75)readerApi?.next();else setReadingUi(value=>!value)}else if(ratio>.3&&ratio<.7)setReadingUi(value=>!value)}}><DocumentReader key={selectedBook.id} source={selectedBook.source} sourceBlob={selectedBook.blob} format={selectedBook.type} bookId={selectedBook.id} settings={renderedReaderSettings} initialLocation={readerInitialLocation} annotations={readerAnnotations} onApi={setReaderApi} onLocation={handleLocation} onToc={handleToc} onSelection={handleSelection} onAnnotation={handleAnnotation} onEdgeCue={setEdgeCue} onToggleUi={toggleReadingUi}/></div>

          <div className={`readerBottom ${immersive||!readingUi?"quiet":"visible"}`}><span className="readerChapter" title={`${location.chapterTitle} · 章节 ${location.chapterIndex+1}/${Math.max(1,location.chapterCount)}`}>{location.chapterTitle || "正文"}</span><span className="readerPosition" aria-busy={location.paginationPending||undefined} aria-label={location.paginationPending?"正在计算实际页数":`${selectedBook.type==="EPUB"?"阅读位置":"页码"} ${location.page} / ${location.totalPages}`} title={location.paginationPending?"正在按当前排版计算实际页数":selectedBook.type==="EPUB"?"按正文长度计算的阅读位置":"当前页 / 总页数"}>{location.pagePending?"…":location.page} / {location.paginationPending?"…":location.totalPages}</span><ReaderStatus/></div>
        </div>}
        {view==="笔记"&&<NotesView annotations={annotations} books={books} onMenu={()=>setSidebarOpen(true)} onOpen={openAnnotation} onEdit={setEditingNote} onDelete={setDeleteNoteTarget}/>}
        {view==="数据"&&<ReadingDashboard books={books} sessions={sessions} onMenu={()=>setSidebarOpen(true)} onRead={book=>{const full=books.find(item=>item.id===book.id);if(full)enterReader(full)}}/>}
      </section>
    </div>
    {helpOpen&&<HelpPanel onClose={()=>setHelpOpen(false)}/>}
    {editBookTarget&&<BookMetadataDialog key={editBookTarget.id} book={editBookTarget} onSave={saveBookMetadata} onClose={()=>setEditBookTarget(null)}/>}
    {tocOpen&&<TocPanel toc={toc} location={location} annotations={readerAnnotations} initialTab={navigationTab} onClose={closeToc} onGo={tocGo} onEdit={handleAnnotation} onDelete={setDeleteNoteTarget}/>}
    {bookSearchOpen&&readerApi&&<BookSearchPanel api={readerApi} onClose={closeBookSearch} onGo={bookSearchGo}/>}
    {readerSettingsOpen&&<ReaderSettingsPanel format={selectedBook?.type||"TXT"} value={readerSettings} onChange={setReaderSettings} onClose={()=>setReaderSettingsOpen(false)}/>}
    {appSettingsOpen&&<AppSettingsPanel value={appPreferences} onChange={setAppPreferences} onExport={exportData} onImport={importData} onClose={()=>setAppSettingsOpen(false)}/>}
    {profileOpen&&<ProfilePanel value={appPreferences} onChange={setAppPreferences} onSyncTabChange={changeUserTab} onSyncUpdated={()=>void reloadSyncedLibrary()} onClose={()=>{setProfileOpen(false);setSyncOpen(false)}}/>}
    {selection&&<AnnotationComposer selection={selection} onClose={()=>setSelection(null)} onSave={(style,note,color)=>saveAnnotation(style,note,color)}/>}
    {editingNote&&<AnnotationComposer key={editingNote.id} selection={{quote:editingNote.quote,locator:editingNote.locator}} initial={editingNote} onDelete={()=>setDeleteNoteTarget(editingNote)} onClose={()=>setEditingNote(null)} onSave={(style,note,color)=>saveAnnotation(editingNote.style==="bookmark"?"bookmark":style,note,color)}/>}
    {editCategoryTarget&&<TextModal title="编辑分类" initialValue={editCategoryTarget} placeholder="分类名称" onClose={()=>setEditCategoryTarget(null)} onConfirm={editCategory}/>}
    {categoryOpen&&<TextModal title="新建分类" placeholder="例如：专业资料" onClose={()=>setCategoryOpen(false)} onConfirm={addCategory}/>}
    {deleteBookTarget&&<ConfirmModal title="删除这本书？" detail={`《${deleteBookTarget.title}》的原文件、阅读进度与相关笔记都会一并删除。`} confirm="删除书籍" onClose={()=>setDeleteBookTarget(null)} onConfirm={removeBook}/>}
    {deleteNoteTarget&&<ConfirmModal title="删除这条笔记？" detail={`“${deleteNoteTarget.quote.length>40?deleteNoteTarget.quote.slice(0,40)+"…":deleteNoteTarget.quote}”的标注与笔记将被永久删除。`} confirm="删除笔记" onClose={()=>setDeleteNoteTarget(null)} onConfirm={()=>deleteAnnotation(deleteNoteTarget.id)}/>}
    {deleteCategoryTarget&&<ConfirmModal title={`删除分类"${deleteCategoryTarget}"？`} detail={`该分类下的书籍将归入"未分类"，分类本身会被删除。`} confirm="删除分类" onClose={()=>setDeleteCategoryTarget(null)} onConfirm={()=>removeCategory(deleteCategoryTarget)}/>}
    {importOpen&&<ImportModal onClose={()=>setImportOpen(false)} onFiles={importFiles}/>} {toast&&<div role="status" className={`toast ${/失败|无法|错误|不支持|无效|未找到/.test(toast)?"error":""}`}><span>{/失败|无法|错误|不支持|无效|未找到/.test(toast)?"!":"✓"}</span>{toast}</div>}
  </main>
}

function isDarkPage(hex:string){const c=hex.replace("#","");if(c.length<6)return false;const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return(r*299+g*587+b*114)/1000<100}
const TocPanel=memo(function TocPanel({toc,location,annotations,initialTab,onClose,onGo,onEdit,onDelete}:{toc:TocItem[];location:ReaderLocation;annotations:ReaderAnnotation[];initialTab:"toc"|"marks";onClose:()=>void;onGo:(v:string)=>void;onEdit:(a:ReaderAnnotation)=>void;onDelete:(a:ReaderAnnotation)=>void}){
  const dialog=useDialogFocus<HTMLElement>(onClose);const [tab,setTab]=useState(initialTab);const activeRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(tab==="toc"&&activeRef.current){const timer=window.setTimeout(()=>activeRef.current?.scrollIntoView({block:"center",behavior:"smooth"}),80);return()=>clearTimeout(timer)}},[tab,location.chapterIndex]);
  return <><button className="modalScrim" aria-label="关闭阅读导航" onClick={onClose}/><aside ref={dialog} className="tocPanel" role="dialog" aria-modal="true" aria-label="阅读导航"><div className="panelHeader"><div><h2>目录与笔记</h2></div><button aria-label="关闭阅读导航" onClick={onClose}><X size={20}/></button></div><SelectionGroup className="panelTabs"><button aria-pressed={tab==="toc"} className={tab==="toc"?"active":""} onClick={()=>setTab("toc")}>目录</button><button aria-pressed={tab==="marks"} className={tab==="marks"?"active":""} onClick={()=>setTab("marks")}>笔记与标记 {annotations.length}</button></SelectionGroup><div className="tocList">{tab==="toc"?toc.map((item,index)=><button key={item.id} ref={index===location.chapterIndex?activeRef:undefined} className={index===location.chapterIndex?"active":""} style={{paddingLeft:16+item.level*15}} onClick={()=>onGo(item.locator)}><span>{item.label}</span>{item.page&&<em>第 {item.page} 页</em>}</button>):annotations.length?annotations.map(item=><article className="readerNoteRow" key={item.id}><button className="readerNoteJump" onClick={()=>onGo(stableAnnotationLocator(item))}><small>{item.style==="bookmark"?"书签":item.style==="underline"?"下划线":"高亮"} · {Math.round(item.progress)}%</small><strong>{item.style==="bookmark"?item.chapterTitle:item.quote}</strong>{item.note&&<span>{item.note}</span>}</button><footer><span>{item.chapterTitle}</span>{item.style!=="bookmark"&&<button aria-label="编辑笔记" onClick={()=>onEdit(item)}><PenLine size={16}/></button>}<button className="danger" aria-label="删除笔记" onClick={()=>onDelete(item)}><Trash2 size={16}/></button></footer></article>):<div className="emptyReaderNotes"><PenLine size={25}/><strong>还没有标记</strong><span>选中文字，留下第一条笔记。</span></div>}</div></aside></>;
});

const BookSearchPanel=memo(function BookSearchPanel({api,onClose,onGo}:{api:ReaderApi;onClose:()=>void;onGo:(locator:string)=>void}){
  const dialog=useDialogFocus<HTMLElement>(onClose);const [query,setQuery]=useState("");const [results,setResults]=useState<ReaderSearchResult[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{const value=query.trim();if(!value)return;let cancelled=false;const timer=window.setTimeout(()=>api.search(value).then(items=>{if(!cancelled)setResults(items)}).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:"暂时无法搜索，请重新尝试")}).finally(()=>{if(!cancelled)setLoading(false)}),260);return()=>{cancelled=true;clearTimeout(timer)}},[query,api]);
  return <><button className="modalScrim" aria-label="关闭全文搜索" onClick={onClose}/><aside ref={dialog} className="bookSearchPanel" role="dialog" aria-modal="true" aria-label="全文搜索"><div className="panelHeader"><div><h2>全文搜索</h2></div><button aria-label="关闭全文搜索" onClick={onClose}><X size={20}/></button></div><label className="bookSearchInput"><Search size={18}/><input aria-label="搜索书内文字" autoFocus value={query} onChange={event=>{const value=event.target.value;setQuery(value);setResults([]);setError("");setLoading(Boolean(value.trim()))}} placeholder="搜索书内文字"/><kbd>Ctrl F</kbd></label><div className="bookSearchMeta" role="status">{loading?"正在检索整本书…":error?error:query?`找到 ${results.length}${results.length===100?"+":""} 处结果`:"输入关键词开始搜索"}</div><div className="bookSearchResults" aria-busy={loading}>{loading&&<div className="searchSkeleton" role="status" aria-label="正在搜索"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div>}{results.map(item=><button key={item.id} onClick={()=>onGo(item.locator)}><strong>{item.label}</strong><span>{item.excerpt}</span></button>)}{query&&!loading&&!error&&!results.length&&<div className="bookSearchEmpty">没有找到相关内容</div>}</div></aside></>;
});

function ReaderSettingsPanel({format,value,onChange,onClose}:{format:Book["type"];value:ReaderSettings;onChange:(v:ReaderSettings)=>void;onClose:()=>void}){
  const dialog=useDialogFocus<HTMLElement>(onClose);
  const set=<K extends keyof ReaderSettings>(key:K,next:ReaderSettings[K])=>onChange({...value,[key]:next});
  const textLayout=format!=="PDF"||value.pdfMode==="text";
  const verticalValue=value.verticalMargin>18?Math.min(18,Math.round(value.verticalMargin/8)):value.verticalMargin,horizontalValue=value.horizontalMargin>30?Math.min(30,Math.round(value.horizontalMargin/9)):value.horizontalMargin;
  return <><button className="modalScrim" aria-label="关闭阅读设置" onClick={onClose}/><aside ref={dialog} className="settingsPanel readerSettingsPanel" role="dialog" aria-modal="true" aria-label="排版与阅读">
    <div className="panelHeader"><div><h2>{format==="PDF"?"页面显示":"排版与阅读"}</h2></div><button aria-label="关闭阅读设置" onClick={onClose}><X size={20}/></button></div>
    {format==="PDF"&&<section><label>阅读模式</label><div className="choiceGrid"><button aria-pressed={value.pdfMode!=="text"} className={value.pdfMode!=="text"?"active":""} onClick={()=>set("pdfMode","original")}>原版页面</button><button aria-pressed={value.pdfMode==="text"} className={value.pdfMode==="text"?"active":""} onClick={()=>set("pdfMode","text")}>文字阅读</button></div><p className="settingsHint">文字阅读可调整字体与排版；扫描页请使用原版页面。插图、表格与复杂版式以原版为准。</p></section>}
    {textLayout&&<><section><label>字体</label><div className="fontChoices">{[["lxgw","霞鹜文楷"],["serif","宋体衬线"],["sans","清晰黑体"],["system","跟随系统"]].map(([id,name])=><button key={id} aria-pressed={value.fontFamily===id} className={value.fontFamily===id?"active":""} onClick={()=>set("fontFamily",id as ReaderSettings["fontFamily"])}>{name}</button>)}</div></section>
    <RangeSetting label="字号" value={value.fontSize} min={14} max={32} unit="px" onChange={v=>set("fontSize",v)}/>
    <RangeSetting label="行间距" value={value.lineHeight} min={1.3} max={2.6} step={.1} onChange={v=>set("lineHeight",v)}/>
    <RangeSetting label="段间距" value={value.paragraphSpacing} min={0} max={36} unit="px" onChange={v=>set("paragraphSpacing",v)}/>
    <RangeSetting label="上下边距" value={verticalValue} min={0} max={18} unit="%" onChange={v=>set("verticalMargin",v)}/>
    <RangeSetting label="左右边距" value={horizontalValue} min={2} max={30} unit="%" onChange={v=>set("horizontalMargin",v)}/></>}
    <section><label>日间纸色</label><div className="paperColors">{readerPapers.map(paper=><button key={paper.color} className={value.pageColor===paper.color?"active":""} aria-label={`页面颜色 ${paper.name}`} aria-pressed={value.pageColor===paper.color} onClick={()=>onChange({...value,pageColor:paper.color,followTheme:false})}><i style={{background:paper.color}}/><span>{paper.name}</span></button>)}</div><PaperColorPicker value={value.pageColor} onChange={color=>onChange({...value,pageColor:color,followTheme:false})}/></section>
    <p className="settingsHint">夜间使用深灰纸色；日间恢复所选纸张颜色。</p><section><label>纸张质感</label><div className="paperTextures">{[["plain","纯净"],["paper","纤维纸"],["soft","细纹纸"]].map(([id,name])=><button key={id} aria-pressed={value.paperTexture===id} className={value.paperTexture===id?"active":""} onClick={()=>set("paperTexture",id as ReaderSettings["paperTexture"])}><i className={`paperSample paperSample-${id}`}>阅</i><span>{name}</span></button>)}</div></section>
    {textLayout?<><section><label>翻页方式</label><div className="choiceRows"><button aria-pressed={value.flow==="paginated"} className={value.flow==="paginated"?"active":""} onClick={()=>set("flow","paginated")}><span>横向翻页<small>方向键、滚轮、点击、横向手势</small></span><i/></button><button disabled={value.spread==="double"} aria-pressed={value.flow==="scrolled"} className={value.flow==="scrolled"?"active":""} onClick={()=>set("flow","scrolled")}><span>竖向滚动<small>{value.spread==="double"?"双页模式下不可用":"滚轮与纵向手势"}</small></span><i/></button></div></section>
    {!isMobile&&<section><label>阅读方式</label><div className="choiceGrid"><button aria-pressed={value.spread==="single"} className={value.spread==="single"?"active":""} onClick={()=>set("spread","single")}><FileText size={17}/>单页</button><button aria-pressed={value.spread==="double"} className={`spreadDoubleBtn ${value.spread==="double"?"active":""}`} onClick={()=>onChange({...value,spread:"double",flow:"paginated"})}><Columns2 size={17}/>双页</button></div></section>}</>:<p className="settingsHint">PDF 固定使用单页、竖向连续滚动；缩放请使用阅读页中的独立控件。</p>}
    <UiButton className="dark full readerSettingsDone" onClick={onClose}>完成</UiButton>
  </aside></>;
}
function RangeSetting({label,value,min,max,step=1,unit="",onChange}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void}){const percent=(value-min)/(max-min)*100;return <section><div className="settingLabel"><label>{label}</label><strong>{value}{unit}</strong></div><div className="rangeControl"><div className="rangeTrack" style={{background:`linear-gradient(90deg,var(--accent) ${percent}%,var(--surface-muted) ${percent}%)`}}/><input className="customRange" aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></div></section>}

function AppSettingsPanel({value,onChange,onExport,onImport,onClose}:{value:AppPreferences;onChange:(v:AppPreferences)=>void;onExport:()=>void;onImport:(file:File)=>void;onClose:()=>void}){
  const dialog=useDialogFocus<HTMLElement>(onClose);
  const input=useRef<HTMLInputElement>(null),set=<K extends keyof AppPreferences>(key:K,next:AppPreferences[K])=>onChange({...value,[key]:next});
  return <><button className="modalScrim" aria-label="关闭主题设置" onClick={onClose}/><aside ref={dialog} className="settingsPanel" role="dialog" aria-modal="true" aria-label="主题设置"><div className="panelHeader"><div><h2>主题设置</h2></div><button aria-label="关闭主题设置" onClick={onClose}><X size={20}/></button></div><ThemeSettings value={value} onChange={onChange}/><section><label>界面密度</label><div className="choiceGrid"><button aria-pressed={value.density==="comfortable"} className={value.density==="comfortable"?"active":""} onClick={()=>set("density","comfortable")}><AppWindow size={17}/>舒适</button><button aria-pressed={value.density==="compact"} className={value.density==="compact"?"active":""} onClick={()=>set("density","compact")}><AlignJustify size={17}/>紧凑</button></div></section><section><label>启动页面</label><div className="choiceRows"><button aria-pressed={value.startPage==="library"} className={value.startPage==="library"?"active":""} onClick={()=>set("startPage","library")}><span>打开书库<small>从完整书库开始</small></span><i/></button><button aria-pressed={value.startPage==="last-read"} className={value.startPage==="last-read"?"active":""} onClick={()=>set("startPage","last-read")}><span>继续上次阅读<small>直接回到最后一本书</small></span><i/></button></div></section><section><label>数据备份</label><input ref={input} hidden type="file" accept="application/json,.json" onChange={event=>{const file=event.target.files?.[0];if(file)onImport(file);event.currentTarget.value=""}}/><div className="choiceGrid"><button onClick={onExport}><Download size={17}/>导出全部数据</button><button onClick={()=>input.current?.click()}><Upload size={17}/>加载备份</button></div></section><p className="settingsHint">备份包含书籍原文件、分类、进度、排版、标注、笔记和阅读记录。加载备份采用合并方式，不会先清空现有数据。</p><UiButton className="dark full" onClick={onClose}>完成</UiButton></aside></>;
}

function ProfilePanel({value,onChange,onClose,onSyncUpdated,onSyncTabChange}:{value:AppPreferences;onChange:(v:AppPreferences)=>void;onClose:()=>void;onSyncUpdated:()=>void;onSyncTabChange:(active:boolean)=>void}){
  const [tab,setTab]=useState<"profile"|"sync">("profile"),[syncBusy,setSyncBusy]=useState(false);
  const close=()=>{if(!syncBusy)onClose()};const dialog=useDialogFocus(close);
  useEffect(()=>{onSyncTabChange(tab==="sync");return()=>onSyncTabChange(false)},[tab,onSyncTabChange]);
  const input=useRef<HTMLInputElement>(null);const [name,setName]=useState(value.profileName);const [avatar,setAvatar]=useState(value.avatarDataUrl);
  const chooseAvatar=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas"),size=256;canvas.width=size;canvas.height=size;const context=canvas.getContext("2d");if(!context)return;const side=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-side)/2,sy=(image.naturalHeight-side)/2;context.drawImage(image,sx,sy,side,side,0,0,size,size);setAvatar(canvas.toDataURL("image/jpeg",.86))};image.src=String(reader.result)};reader.readAsDataURL(file)};
   const save=()=>{onChange({...value,profileName:name.trim()||defaultAppPreferences.profileName,avatarDataUrl:avatar||defaultAppPreferences.avatarDataUrl});onClose()};
  return <><button className="modalScrim" aria-label="关闭用户设置" onClick={close}/><div ref={dialog} className="profilePanel userPanel" role="dialog" aria-modal="true" aria-label="用户资料与同步"><div className="panelHeader"><div><h2>用户设置</h2></div><button aria-label="关闭用户设置" disabled={syncBusy} onClick={close}><X size={20}/></button></div><SelectionGroup className="panelTabs" label="用户设置内容"><button className={tab==="profile"?"active":""} aria-pressed={tab==="profile"} disabled={syncBusy} onClick={()=>setTab("profile")}>个人资料</button><button className={tab==="sync"?"active":""} aria-pressed={tab==="sync"} disabled={syncBusy} onClick={()=>setTab("sync")}>云同步</button></SelectionGroup>{tab==="sync"?<SyncPanel embedded onClose={close} onUpdated={onSyncUpdated} onBusyChange={setSyncBusy}/>:<><input ref={input} hidden type="file" accept="image/*" onChange={event=>{chooseAvatar(event.target.files?.[0]);event.currentTarget.value=""}}/><button aria-label="选择个人头像" className="profileAvatarPicker" onClick={()=>input.current?.click()} style={avatar?{backgroundImage:`url(${avatar})`}:undefined}><span>{!avatar&&(name.trim()[0]||"P")}</span><i><Camera size={16}/></i></button><p>头像会自动裁剪为正方形，并随应用数据备份。</p><label className="profileNameField"><span>显示名称</span><input value={name} maxLength={20} onChange={event=>setName(event.target.value)} placeholder="输入显示名称"/></label>{avatar&&<button className="removeAvatar" onClick={()=>setAvatar("")}>移除当前头像</button>}<UiButton className="dark full" onClick={save}>保存个人资料</UiButton></>}</div></>;
}



function TextModal({title,placeholder,initialValue="",onClose,onConfirm}:{title:string;placeholder:string;initialValue?:string;onClose:()=>void;onConfirm:(v:string)=>Promise<void>}){const [value,setValue]=useState(initialValue),[busy,setBusy]=useState(false),[error,setError]=useState("");const close=()=>{if(!busy)onClose()};const dialog=useDialogFocus(close);const submit=async()=>{if(busy||!value.trim())return;setBusy(true);setError("");try{await onConfirm(value)}catch(reason){setError(reason instanceof Error?reason.message:"分类保存失败")}finally{setBusy(false)}};return <><button className="modalScrim" aria-label="关闭分类编辑" onClick={close}/><div ref={dialog} className="smallModal" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}><div className="panelHeader"><h2>{title}</h2><button disabled={busy} aria-label="关闭分类编辑" onClick={close}><X size={19}/></button></div><input aria-label="分类名称" aria-invalid={!!error} aria-describedby={error?"categoryError":undefined} autoFocus maxLength={80} disabled={busy} value={value} onChange={e=>{setValue(e.target.value);setError("")}} placeholder={placeholder} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void submit()}}}/>{error&&<p id="categoryError" role="alert" className="fieldError">{error}</p>}<UiButton disabled={busy||!value.trim()} className="dark full" onClick={()=>void submit()}>{busy?"正在保存…":"保存分类"}</UiButton></div></>}
function ConfirmModal({title,detail,confirm,onClose,onConfirm}:{title:string;detail:string;confirm:string;onClose:()=>void;onConfirm:()=>void}){const dialog=useDialogFocus(onClose);return <><button className="modalScrim" onClick={onClose}/><div ref={dialog} className="confirmModal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="confirmIcon"><Trash2 size={21}/></div><h2 id="confirm-title">{title}</h2><p>{detail}</p><div><button onClick={onClose}>取消</button><button className="danger" onClick={onConfirm}>{confirm}</button></div></div></>}

function ImportModal({onClose,onFiles}:{onClose:()=>void;onFiles:(f:File[])=>Promise<void>|void}){const dialog=useDialogFocus(onClose);const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const run=async(files:File[])=>{if(busy)return;setBusy(true);setError("");try{await onFiles(files)}catch(error){setError(error instanceof Error?error.message:"导入失败，请重新尝试")}finally{setBusy(false)}};return <><button className="modalScrim" aria-label="关闭导入书籍" onClick={onClose}/><div ref={dialog} className="importModal" aria-busy={busy} role="dialog" aria-modal="true" aria-label="导入本地书籍"><div className="panelHeader"><div><h2>导入本地书籍</h2></div><button aria-label="关闭导入书籍" onClick={onClose}><X size={20}/></button></div><input ref={input} hidden multiple type="file" accept=".txt,.epub,.pdf" disabled={busy} onChange={e=>{if(e.target.files)void run(Array.from(e.target.files));e.currentTarget.value=""}}/><button disabled={busy} className="dropZone" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void run(Array.from(e.dataTransfer.files))}}><div><FolderOpen size={27}/></div><strong>{busy?"正在导入书籍…":"选择文件，或拖放到这里"}</strong><span>{busy?"正在读取并保存到本机":"可同时添加多本书"}</span></button>{error&&<p className="formError" role="alert">{error}</p>}<div className="fileTypes"><span><FileText size={17}/>TXT</span><span><BookOpen size={17}/>EPUB</span><span><FileText size={17}/>PDF</span></div><p className="privacyTip">书籍保存在本机，连接 Google Drive 后可跨设备同步。</p></div></>}
