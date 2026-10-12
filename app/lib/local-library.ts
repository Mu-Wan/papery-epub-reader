import type { AppPreferences, BookFormat, ReaderAnnotation, ReaderSettings } from "./reader-types";
import { portableSetting, validateSnapshot, syncRecordOrder, type SyncRecord, type SyncSnapshot } from "./sync-merge";
import { cleanAuthor } from "./book-metadata";
import { readBlobBytes } from "./blob-bytes";
import { readBookFile, type BookFiles } from "./book-files";

export type LocalBookRecord = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  category: string;
  progress: number;
  currentLocation?: string;
  progressUpdatedAt?: number;
  coverDataUrl?: string | null;
  hasCover?: boolean;
  blob: Blob;
  updatedAt: number;
  importedAt?: number;
  publicationYear?: number;
  lastReadAt?: number;
  metadataVersion?: number;
  metadataEdited?: boolean;
  fileName?: string;
};

const DB_NAME = "papery-library";
const DB_VERSION = 5;
const BOOKS = "books";
const BOOK_INDEX = "book-index";
const ANNOTATIONS = "annotations";
const SETTINGS = "settings";
const CATEGORIES = "categories";
const SESSIONS = "sessions";
const SYNC_FILES = "sync-files";

export type LocalReadingSession = { id:string;book_id:string;started_at:number;duration_seconds:number;words_read:number;updatedAt?:number };

let _dbPromise: Promise<IDBDatabase> | null = null;
function getLibrary(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(BOOK_INDEX)) {
          const index = db.createObjectStore(BOOK_INDEX, { keyPath: "id" });
          const cursor = request.transaction!.objectStore(BOOKS).openCursor();
          cursor.onsuccess = () => { const item = cursor.result; if(item){index.put(bookSummary(item.value));item.continue()} };
        } else if(event.oldVersion<5){
          const cursor=request.transaction!.objectStore(BOOK_INDEX).openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){row.update(bookSummary(row.value));row.continue()}};
        }
        if (!db.objectStoreNames.contains(ANNOTATIONS)) {
          const store = db.createObjectStore(ANNOTATIONS, { keyPath: "id" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" });
        if (!db.objectStoreNames.contains(CATEGORIES)) db.createObjectStore(CATEGORIES, { keyPath: "name" });
        if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(SYNC_FILES)) db.createObjectStore(SYNC_FILES, { keyPath: "id" }).createIndex("createdAt","createdAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return _dbPromise;
}

async function put(storeName: string, value: unknown) {
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getAll<T>(storeName: string) {
  const db = await getLibrary();
  const records = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
  return records;
}

type StoredBook = Omit<LocalBookRecord,"blob"> & { blob?: Blob; fileBytes?: ArrayBuffer; fileMime?: string };
export type LocalBookSummary = Omit<LocalBookRecord,"blob">;
function bookSummary(record: StoredBook): LocalBookSummary {
  const summary={...record};delete summary.blob;delete summary.fileBytes;delete summary.fileMime;
  summary.hasCover=Boolean(record.hasCover||record.coverDataUrl);
  if(summary.coverDataUrl && summary.coverDataUrl.length>=80_000)summary.coverDataUrl=null;
  return summary;
}
function restoreBook(record: StoredBook): LocalBookRecord {
  const {fileBytes,fileMime,...book}=record;
  return {...book,blob:fileBytes instanceof ArrayBuffer ? new Blob([fileBytes],{type:fileMime||""}) : record.blob||new Blob([])};
}
async function storeBook(record: LocalBookRecord): Promise<StoredBook> {
  const {blob,...book}=record;
  return {...book,fileBytes:await readBlobBytes(blob),fileMime:blob.type};
}
// Persist owned bytes rather than a WebView Blob handle backed by a temporary URI.
export async function saveLocalBook(record: LocalBookRecord) {
  const stored=await storeBook(record),db=await getLibrary();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction([BOOKS,BOOK_INDEX],"readwrite");tx.objectStore(BOOKS).put(stored);tx.objectStore(BOOK_INDEX).put(bookSummary(stored));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
export const loadLocalBookSummaries = () => getAll<LocalBookSummary>(BOOK_INDEX);
export async function loadLocalBook(id:string):Promise<LocalBookRecord|null>{
  const db=await getLibrary();return new Promise((resolve,reject)=>{const tx=db.transaction([BOOKS,BOOK_INDEX],"readonly");let file:StoredBook|undefined,summary:LocalBookSummary|undefined;const a=tx.objectStore(BOOKS).get(id),b=tx.objectStore(BOOK_INDEX).get(id);a.onsuccess=()=>{file=a.result};b.onsuccess=()=>{summary=b.result};tx.oncomplete=()=>resolve(file?restoreBook({...file,...summary}):null);tx.onerror=()=>reject(tx.error)});
}
export async function loadLocalBooks(){const records=await exportLibraryRecords();const books:LocalBookRecord[]=[];for(const book of records.snapshot.books)books.push({...book,blob:(await readBookFile(records.blobs,String(book.id)))!} as LocalBookRecord);return books}

export async function cacheBookCover(id:string,coverDataUrl:string|null){
  const db=await getLibrary();await new Promise<void>((resolve,reject)=>{const tx=db.transaction([BOOK_INDEX,SETTINGS],"readwrite");const store=tx.objectStore(BOOK_INDEX),request=store.get(id);request.onsuccess=()=>{if(request.result){store.put({...request.result,coverDataUrl});tx.objectStore(SETTINGS).put({key:`cover:${id}`,value:coverDataUrl})}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
export async function loadStoredCover(id:string):Promise<{coverDataUrl?:string|null;blob:Blob;format:BookFormat}|null>{
  const db=await getLibrary();return new Promise((resolve,reject)=>{const request=db.transaction(BOOKS,"readonly").objectStore(BOOKS).get(id);request.onsuccess=()=>resolve(request.result?restoreBook(request.result):null);request.onerror=()=>reject(request.error)});
}
export async function stageSyncFile(blob:Blob){
  const id=createLocalId();await put(SYNC_FILES,{id,createdAt:Date.now(),fileBytes:await readBlobBytes(blob),fileMime:blob.type});return id;
}
export async function clearExpiredSyncFiles(){
  const db=await getLibrary();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(SYNC_FILES,"readwrite"),store=tx.objectStore(SYNC_FILES),request=store.index("createdAt").openKeyCursor(IDBKeyRange.upperBound(Date.now()-24*60*60*1000));request.onsuccess=()=>{const row=request.result;if(row){store.delete(row.primaryKey);row.continue()}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
export async function readStagedSyncFile(id:string){
  const db=await getLibrary();return new Promise<Blob>((resolve,reject)=>{const request=db.transaction(SYNC_FILES,"readonly").objectStore(SYNC_FILES).get(id);request.onsuccess=()=>request.result?resolve(new Blob([request.result.fileBytes],{type:request.result.fileMime})):reject(new Error("同步临时文件缺失"));request.onerror=()=>reject(request.error)});
}
export async function discardStagedSyncFiles(ids:string[]){
  if(!ids.length)return;const db=await getLibrary();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(SYNC_FILES,"readwrite");for(const id of ids)tx.objectStore(SYNC_FILES).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}

/** Merge in a transaction so delayed metadata work cannot overwrite a newer locator. */
export async function updateLocalBook(id: string, changes: Partial<Pick<LocalBookRecord, "title" | "author" | "category" | "coverDataUrl" | "publicationYear" | "lastReadAt" | "metadataVersion" | "metadataEdited">>, onlyMissingMetadata = false) {
  const db = await getLibrary();
  return new Promise<LocalBookSummary | null>((resolve, reject) => {
    let result: LocalBookSummary | null = null;
    const tx = db.transaction(BOOK_INDEX, "readwrite"), store = tx.objectStore(BOOK_INDEX), request = store.get(id);
    request.onsuccess = () => {
      const current: LocalBookSummary | undefined = request.result;
      if (!current) return;
      const patch = { ...changes };
      if (onlyMissingMetadata) {
        if (current.metadataEdited || cleanAuthor(current.author)) delete patch.author;
        if (current.metadataEdited || current.publicationYear) delete patch.publicationYear;
        if (current.coverDataUrl) delete patch.coverDataUrl;
      }
      const updated = { ...current, ...patch, updatedAt: Date.now() }; store.put(updated); result=updated;
    };
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export const saveLocalAnnotation = (record: ReaderAnnotation) => put(ANNOTATIONS, record);
export const loadLocalAnnotations = () => getAll<ReaderAnnotation>(ANNOTATIONS);

export async function deleteLocalAnnotation(id: string) {
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ANNOTATIONS,SETTINGS], "readwrite");
    tx.objectStore(ANNOTATIONS).delete(id);
    tx.objectStore(SETTINGS).put({key:`deleted:annotations:${id}`,value:Date.now()});
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalBook(id:string){
  const db=await getLibrary();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([BOOKS,BOOK_INDEX,ANNOTATIONS,SETTINGS],"readwrite");
    tx.objectStore(BOOKS).delete(id);
    tx.objectStore(BOOK_INDEX).delete(id);
    tx.objectStore(SETTINGS).put({key:`deleted:books:${id}`,value:Date.now()});
    const notes=tx.objectStore(ANNOTATIONS).index("bookId").openKeyCursor(IDBKeyRange.only(id));
    notes.onsuccess=()=>{const cursor=notes.result;if(cursor){tx.objectStore(ANNOTATIONS).delete(cursor.primaryKey);cursor.continue()}};
    const settingKeys=tx.objectStore(SETTINGS).openKeyCursor();
    settingKeys.onsuccess=()=>{const cursor=settingKeys.result;if(cursor){const key=String(cursor.primaryKey);if(key===`reader:${id}`||key===`pagination:${id}`||key===`analysis:${id}`||key===`pdf-reflow:${id}`||key.startsWith(`pagination:${id}:`))tx.objectStore(SETTINGS).delete(cursor.primaryKey);cursor.continue()}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}

const progressObservations=new Map<string,number>();
export async function saveBookProgress(id: string, progress: number, currentLocation: string, observedAt=Date.now()) {
  if(observedAt<(progressObservations.get(id)||0))return;progressObservations.set(id,observedAt);
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOK_INDEX, "readwrite");
    const store = tx.objectStore(BOOK_INDEX);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result && observedAt >= (progressObservations.get(id)||0)) store.put({ ...request.result, progress, currentLocation, progressUpdatedAt: observedAt, updatedAt: Date.now() });
    };
    tx.oncomplete = () => {try{const key=`papery-progress-${id}`,raw=localStorage.getItem(key),journal=raw&&JSON.parse(raw);if(journal?.t===observedAt&&journal.l===currentLocation)localStorage.setItem(key,JSON.stringify({...journal,pending:false}))}catch{}resolve()};
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveReaderSettings(bookId:string,value:ReaderSettings,shared?:{format:"TXT"|"EPUB"|"PDF";mobile:boolean}) {
 if(!shared)return put(SETTINGS,{key:`reader:${bookId}`,value,updatedAt:Date.now()});
 const db=await getLibrary();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(SETTINGS,"readwrite"),store=tx.objectStore(SETTINGS),now=Date.now();store.put({key:`reader:${bookId}`,value,updatedAt:now});
  const request=store.get("reader-defaults");request.onsuccess=()=>{
   const profile:Partial<ReaderSettings>={...value};delete profile.txtChapterRule;delete profile.pdfMode;
   if(shared.format==="PDF"&&value.pdfMode!=="text"){delete profile.horizontalMargin;delete profile.verticalMargin;}
   if(shared.mobile&&request.result?.value?.spread)profile.spread=request.result.value.spread;
   const previous={...request.result?.value};delete previous.txtChapterRule;delete previous.pdfMode;
   store.put({key:"reader-defaults",value:{...previous,...profile},updatedAt:now});
  };
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export async function saveTxtChapterSettings(bookId:string,value:ReaderSettings){
 const db=await getLibrary();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(SETTINGS,"readwrite"),store=tx.objectStore(SETTINGS),now=Date.now();store.put({key:`reader:${bookId}`,value,updatedAt:now});
  store.put({key:"txt-chapter-default",value:value.txtChapterRule,updatedAt:now});
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export const saveAppPreferences = (value: AppPreferences) => put(SETTINGS, { key: "app", value, updatedAt:Date.now() });
export const saveSetting = <T>(key:string,value:T) => put(SETTINGS,{key,value,updatedAt:Date.now()});

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await getLibrary();
  const result = await new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(SETTINGS, "readonly").objectStore(SETTINGS).get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
  return result;
}

/** Read a group of settings in one readonly transaction, retaining each key's value. */
export async function loadSettings<T>(keys: string[]): Promise<Map<string, T | null>> {
  if (!keys.length) return new Map();
  const db = await getLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS, "readonly"), store = tx.objectStore(SETTINGS);
    const values = new Map<string, T | null>();
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => values.set(key, request.result?.value ?? null);
    }
    tx.oncomplete = () => resolve(values);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("设置读取已中断"));
  });
}

export const saveCategory = (name: string) => put(CATEGORIES, { name, createdAt: Date.now(), updatedAt:Date.now() });
export async function renameCategory(name: string, next: string) { await changeCategory(name, next.trim()); }
export async function deleteCategory(name: string) { await changeCategory(name, null); }
async function changeCategory(name: string, next: string | null) {
  if (name === "未分类" || next === "未分类" || (next !== null && !next)) throw new Error("分类名称无效");
  if (name === next) return;
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CATEGORIES,SETTINGS,BOOK_INDEX], "readwrite"), categories = tx.objectStore(CATEGORIES), time=Date.now();
    let failure:Error|undefined;
    const update=()=>{
      categories.delete(name);
      if(next)categories.put({name:next,createdAt:time,updatedAt:time});
      tx.objectStore(SETTINGS).put({key:`deleted:categories:${name}`,value:time});
      const request=tx.objectStore(BOOK_INDEX).openCursor();
      request.onsuccess=()=>{const cursor=request.result;if(cursor){if(cursor.value.category===name)cursor.update({...cursor.value,category:next||"未分类",updatedAt:time});cursor.continue()}};
    };
    if(next){const request=categories.get(next);request.onsuccess=()=>{if(request.result){failure=new Error("已有同名分类");tx.abort()}else update()}}else update();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(failure||tx.error||new Error("分类修改失败，原数据已保留"));
  });
}
export const loadCategories = async () => (await getAll<{ name: string }>(CATEGORIES)).map(item => item.name);
const SESSION_JOURNAL="papery-pending-sessions";
function pendingSessions():LocalReadingSession[]{
  try{const value=JSON.parse(localStorage.getItem(SESSION_JOURNAL)||"[]");return Array.isArray(value)?value.filter(item=>item&&typeof item.id==="string"&&typeof item.book_id==="string"&&Number.isFinite(item.started_at)&&item.started_at>=0&&Number.isFinite(item.duration_seconds)&&item.duration_seconds>0&&Number.isFinite(item.words_read)):[]}catch{return[]}
}
function writePendingSessions(sessions:LocalReadingSession[]){try{if(sessions.length)localStorage.setItem(SESSION_JOURNAL,JSON.stringify(sessions));else localStorage.removeItem(SESSION_JOURNAL)}catch{}}
export async function saveLocalSession(session:LocalReadingSession){
  // WebView destruction can abort IDB. Journal synchronously before awaiting it.
  const pending=pendingSessions(),previous=pending.find(item=>item.id===session.id);
  const latest=previous&&previous.duration_seconds>session.duration_seconds?previous:session;
  writePendingSessions([...pending.filter(item=>item.id!==session.id),latest]);
  await put(SESSIONS,latest);
  writePendingSessions(pendingSessions().filter(item=>item.id!==latest.id||item.duration_seconds>latest.duration_seconds));
}
export async function loadLocalSessions(){
  const records=await getAll<LocalReadingSession>(SESSIONS),merged=new Map(records.map(item=>[item.id,item]));
  for(const session of pendingSessions()){
    const previous=merged.get(session.id);
    if(!previous||previous.duration_seconds<session.duration_seconds){merged.set(session.id,session);void saveLocalSession(session).catch(()=>{})}
    else writePendingSessions(pendingSessions().filter(item=>item.id!==session.id));
  }
  return [...merged.values()];
}

function blobToDataUrl(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function dataUrlToBlob(value:string){const [header,data]=value.split(",",2);const mime=/data:([^;]+)/.exec(header)?.[1]||"application/octet-stream";const binary=atob(data);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return new Blob([bytes],{type:mime})}

export async function exportLibraryRecords(options:{lazyFiles?:boolean;includeCovers?:boolean}={}){
  await Promise.all(pendingSessions().map(session=>saveLocalSession(session)));
  const db=await getLibrary();
  const [books,annotations,settings,categories,sessions]=await new Promise<[LocalBookSummary[],ReaderAnnotation[],{key:string;value:unknown}[],{name:string}[],LocalReadingSession[]]>((resolve,reject)=>{
    const tx=db.transaction([BOOK_INDEX,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],"readonly"),values:unknown[]=[];
    [BOOK_INDEX,ANNOTATIONS,CATEGORIES,SESSIONS].forEach((name,index)=>{const request=tx.objectStore(name).getAll();request.onsuccess=()=>{values[index===0?0:index===1?1:index+1]=request.result}});
    const settings:{key:string;value:unknown}[]=[];values[2]=settings;
    const cursor=tx.objectStore(SETTINGS).openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){const key=String(row.key);if(portableSetting(key)||key.startsWith("deleted:"))settings.push(row.value);row.continue()}};
    tx.oncomplete=()=>resolve(values as [LocalBookSummary[],ReaderAnnotation[],{key:string;value:unknown}[],{name:string}[],LocalReadingSession[]]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  const blobs:BookFiles=new Map();blobs.localIds=new Set(books.map(book=>book.id));blobs.read=async id=>(await loadLocalBook(id))?.blob;
  if(options.includeCovers){const {loadDisplayCover}=await import("./book-cover-cache");for(const book of books)if(book.hasCover&&!book.coverDataUrl)book.coverDataUrl=await loadDisplayCover(book.id)}
  if(!options.lazyFiles)for(const book of books){const blob=await blobs.read(book.id);if(blob)blobs.set(book.id,blob)}
  const encodedBooks=books.map(book=>({...book,blob:"data:application/octet-stream;base64,"}));
  const tombstones=Object.fromEntries(settings.filter(item=>item.key.startsWith("deleted:")).map(item=>[item.key.slice(8),item.value]));
  return {snapshot:{format:"papery-backup",version:1,exportedAt:new Date().toISOString(),books:encodedBooks,annotations,settings:settings.filter(item=>portableSetting(item.key)),categories,sessions,tombstones} as SyncSnapshot,blobs};
}

export async function exportLibraryBackup(){
  const {snapshot,blobs}=await exportLibraryRecords({lazyFiles:true,includeCovers:true});
  const {books,...metadata}=snapshot,parts:BlobPart[]=[JSON.stringify(metadata).slice(0,-1)+',"books":['];
  for(let i=0;i<books.length;i++){const blob=await readBookFile(blobs,String(books[i].id));if(!blob?.size)throw new Error("备份书籍文件缺失");parts.push(new Blob([(i?",":"")+JSON.stringify({...books[i],blob:await blobToDataUrl(blob)})]));}
  parts.push("]}");return new Blob(parts,{type:"application/json"});
}

export async function importLibraryBackup(file:File){
  const data=JSON.parse(await file.text());validateLibrarySnapshot(data);
  const blobs=new Map<string,Blob>();
  for(const book of data.books)blobs.set(String(book.id),dataUrlToBlob(String(book.blob)));
  await importLibraryRecords(data,blobs);
}

export function validateLibrarySnapshot(data:unknown): asserts data is SyncSnapshot {
  validateSnapshot(data);
  for(const book of data.books){
    if(["title","author","category"].some(key=>typeof book[key]!=="string")||typeof book.progress!=="number"||!Number.isFinite(book.progress)||book.progress<0||book.progress>100)throw new Error("备份书籍信息无效");
    if(book.currentLocation!==undefined&&typeof book.currentLocation!=="string")throw new Error("备份阅读位置无效");
  }
  for(const note of data.annotations)if(["quote","note","locator","color","chapterTitle"].some(key=>typeof note[key]!=="string")||!["highlight","underline","bookmark"].includes(String(note.style))||typeof note.progress!=="number"||!Number.isFinite(note.progress))throw new Error("备份笔记信息无效");
  for(const item of data.settings)if(portableSetting(String(item.key))){
    if(item.key==="category-order")continue;
    if(item.key==="last-read-book-id"){if(typeof item.value!=="string")throw new Error("备份最近阅读记录无效");continue;}
    if(!item.value||typeof item.value!=="object"||Array.isArray(item.value))throw new Error("备份偏好设置无效");
    const value=item.value as Record<string,unknown>;
    for(const key of ["fontSize","lineHeight","paragraphSpacing","verticalMargin","horizontalMargin"])if(value[key]!==undefined&&(typeof value[key]!=="number"||!Number.isFinite(value[key])))throw new Error("备份排版设置无效");
    for(const key of ["profileName","avatarDataUrl","fontFamily","flow","spread","pageColor","pdfMode"])if(value[key]!==undefined&&typeof value[key]!=="string")throw new Error("备份偏好设置无效");
    for(const [field,allowed] of [["fontFamily",["system","lxgw","serif","sans"]],["flow",["paginated","scrolled"]],["spread",["single","double"]],["paperTexture",["plain","paper","soft"]]] as const)if(value[field]!==undefined&&!allowed.includes(value[field] as never))throw new Error("备份排版选项无效");
    if(value.pageColor!==undefined&&(typeof value.pageColor!=="string"||!/^#[0-9a-f]{6}$/i.test(value.pageColor)))throw new Error("备份阅读背景无效");
    if(value.pdfMode!==undefined&&value.pdfMode!=="original"&&value.pdfMode!=="text")throw new Error("备份 PDF 阅读模式无效");
    if(value.followTheme!==undefined&&typeof value.followTheme!=="boolean")throw new Error("备份阅读外观设置无效");
    if(value.appTheme!==undefined&&!["system","light","dark"].includes(String(value.appTheme)))throw new Error("备份日夜外观设置无效");
    if(value.themePreset!==undefined&&!["sea","grove","ember","iris","custom"].includes(String(value.themePreset)))throw new Error("备份主题设置无效");
    if(value.customAccent!==undefined&&(typeof value.customAccent!=="string"||!/^#[0-9a-f]{6}$/i.test(value.customAccent)))throw new Error("备份主题颜色无效");
    if(value.canvasPreset!==undefined&&!["neutral","mist","sage","sand","lilac","custom"].includes(String(value.canvasPreset)))throw new Error("备份界面底色设置无效");
    if(value.customCanvas!==undefined&&(typeof value.customCanvas!=="string"||!/^#[0-9a-f]{6}$/i.test(value.customCanvas)))throw new Error("备份界面底色无效");
  }
}

export async function importLibraryRecords(data:SyncSnapshot,blobs:BookFiles){
  validateLibrarySnapshot(data);
  const localIds=blobs.localIds||new Set<string>(),stagedIds=new Map(blobs.stagedIds),owned:string[]=[];
  const currentIds=new Set((await loadLocalBookSummaries()).map(book=>book.id));
  try{
    // Validate and stage one body at a time. No transaction holds a complete library in JS.
    for(const book of data.books){const id=String(book.id);if(localIds.has(id)&&currentIds.has(id)||stagedIds.has(id))continue;const blob=await readBookFile(blobs,id);if(!blob?.size)throw new Error("同步书籍文件缺失，本地数据已保留");const staged=await stageSyncFile(blob);stagedIds.set(id,staged);owned.push(staged)}
    const db=await getLibrary();
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([BOOKS,BOOK_INDEX,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS,SYNC_FILES],"readwrite");
      const names=[BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],existing:Record<string,SyncRecord[]>={};let remaining=names.length,failure:unknown;
      const stamp=(record:SyncRecord)=>Number(record.updatedAt||record.createdAt||record.started_at||0);
      const apply=()=>{try{
        const pendingFiles:{id:string;summary:LocalBookSummary}[]=[];
        const copyNext=()=>{const next=pendingFiles.shift();if(!next)return;const request=tx.objectStore(SYNC_FILES).get(next.id);request.onsuccess=()=>{if(!request.result){failure=new Error("同步临时文件缺失，原数据已保留");tx.abort();return}const write=tx.objectStore(BOOKS).put({...next.summary,fileBytes:request.result.fileBytes,fileMime:request.result.fileMime});write.onsuccess=copyNext}};
        const tombstones:Record<string,number>={...data.tombstones};
        for(const item of existing[SETTINGS])if(String(item.key).startsWith("deleted:")){const key=String(item.key).slice(8);tombstones[key]=Math.max(tombstones[key]||0,Number(item.value)||0)}
        const incoming:Record<string,SyncRecord[]>={books:data.books,annotations:data.annotations,settings:data.settings.filter(item=>portableSetting(String(item.key))),categories:data.categories,sessions:data.sessions};
        const liveBooks=new Set(existing[BOOKS].filter(item=>(tombstones[`books:${item.id}`]??-1)<stamp(item)).map(item=>item.id));
        for(const item of incoming.books)if((tombstones[`books:${item.id}`]??-1)<stamp(item))liveBooks.add(item.id);
        for(const name of names){const key=name===SETTINGS?"key":name===CATEGORIES?"name":"id",store=tx.objectStore(name===BOOKS?BOOK_INDEX:name),old=new Map(existing[name].map(item=>[String(item[key]),item]));
          for(const item of incoming[name]){const id=String(item[key]);if((tombstones[`${name}:${id}`]??-1)>=stamp(item)||name===ANNOTATIONS&&!liveBooks.has(String(item.bookId)))continue;const previous=old.get(id);if(!previous||stamp(item)>stamp(previous)||stamp(item)===stamp(previous)&&syncRecordOrder(item)>syncRecordOrder(previous)){
            if(name===BOOKS){const clean={...item};delete clean.resource;delete clean.blob;const summary=bookSummary(clean as StoredBook);store.put(summary);
              const staged=stagedIds.get(id);if(staged)pendingFiles.push({id:staged,summary});
              else if(!previous){failure=new Error("同步书籍文件缺失，本地数据已保留");tx.abort();return;}
            }else store.put(item);
          }}
          if(name!==SETTINGS)for(const item of existing[name])if((tombstones[`${name}:${item[key]}`]??-1)>=stamp(item)||name===ANNOTATIONS&&!liveBooks.has(String(item.bookId))){store.delete(String(item[key]));if(name===BOOKS)tx.objectStore(BOOKS).delete(String(item[key]))};
        }
        for(const [key,time] of Object.entries(tombstones))tx.objectStore(SETTINGS).put({key:`deleted:${key}`,value:time});
        copyNext();
      }catch(error){failure=error;tx.abort()}};
      for(const name of names){if(name===SETTINGS){const rows:SyncRecord[]=[];existing[name]=rows;const request=tx.objectStore(SETTINGS).openCursor();request.onsuccess=()=>{const row=request.result;if(row){if(portableSetting(String(row.key))||String(row.key).startsWith("deleted:"))rows.push(row.value);row.continue()}else if(!--remaining)apply()};}
        else {const request=tx.objectStore(name===BOOKS?BOOK_INDEX:name).getAll();request.onsuccess=()=>{existing[name]=request.result;if(!--remaining)apply()}}}
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(failure||tx.error||new Error("恢复未完成，原数据已保留"));tx.onabort=()=>reject(failure||tx.error||new Error("恢复未完成，原数据已保留"));
    });
  }finally{await discardStagedSyncFiles(owned)}
  // Only committed IDB positions may override the local crash-recovery cache.
  const committed=await loadLocalBookSummaries();
  for(const book of committed)try{
    const key=`papery-progress-${book.id}`,raw=localStorage.getItem(key);
    if(raw&&Number(JSON.parse(raw).t)<=(book.progressUpdatedAt??book.updatedAt))localStorage.removeItem(key);
  }catch{}
  const lastRead=await loadSetting<string>("last-read-book-id");
  if(lastRead&&committed.some(book=>book.id===lastRead))try{localStorage.setItem("papery-last-book",lastRead)}catch{}
}

export function getDeviceId() {
  const key = "papery-device-id";
  let id = localStorage.getItem(key);
  if (!id) { id = createLocalId(); localStorage.setItem(key, id); }
  return id;
}

export function createLocalId() {
  return globalThis.crypto?.randomUUID?.() || `papery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
