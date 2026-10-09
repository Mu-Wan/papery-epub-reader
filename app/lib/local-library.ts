import type { AppPreferences, BookFormat, ReaderAnnotation, ReaderSettings } from "./reader-types";
import { portableSetting, validateSnapshot, type SyncRecord } from "./sync-merge";
import { cleanAuthor } from "./book-metadata";

export type LocalBookRecord = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  category: string;
  progress: number;
  currentLocation?: string;
  coverDataUrl?: string | null;
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
const DB_VERSION = 3;
const BOOKS = "books";
const ANNOTATIONS = "annotations";
const SETTINGS = "settings";
const CATEGORIES = "categories";
const SESSIONS = "sessions";

export type LocalReadingSession = { id:string;book_id:string;started_at:number;duration_seconds:number;words_read:number;updatedAt?:number };

let _dbPromise: Promise<IDBDatabase> | null = null;
function getLibrary(): Promise<IDBDatabase> {
  if (!_dbPromise) {
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(ANNOTATIONS)) {
          const store = db.createObjectStore(ANNOTATIONS, { keyPath: "id" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" });
        if (!db.objectStoreNames.contains(CATEGORIES)) db.createObjectStore(CATEGORIES, { keyPath: "name" });
        if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: "id" });
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

export const saveLocalBook = (record: LocalBookRecord) => put(BOOKS, record);
export const loadLocalBooks = () => getAll<LocalBookRecord>(BOOKS);
/** Merge in a transaction so delayed metadata work cannot overwrite a newer locator. */
export async function updateLocalBook(id: string, changes: Partial<Pick<LocalBookRecord, "title" | "author" | "category" | "coverDataUrl" | "publicationYear" | "lastReadAt" | "metadataVersion" | "metadataEdited">>, onlyMissingMetadata = false) {
  const db = await getLibrary();
  return new Promise<LocalBookRecord | null>((resolve, reject) => {
    let result: LocalBookRecord | null = null;
    const tx = db.transaction(BOOKS, "readwrite"), store = tx.objectStore(BOOKS), request = store.get(id);
    request.onsuccess = () => {
      const current: LocalBookRecord | undefined = request.result;
      if (!current) return;
      const patch = { ...changes };
      if (onlyMissingMetadata) {
        if (current.metadataEdited || cleanAuthor(current.author)) delete patch.author;
        if (current.metadataEdited || current.publicationYear) delete patch.publicationYear;
        if (current.coverDataUrl) delete patch.coverDataUrl;
      }
      result = { ...current, ...patch, updatedAt: Date.now() }; store.put(result);
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
    const tx=db.transaction([BOOKS,ANNOTATIONS,SETTINGS],"readwrite");
    tx.objectStore(BOOKS).delete(id);
    tx.objectStore(SETTINGS).put({key:`deleted:books:${id}`,value:Date.now()});
    const notes=tx.objectStore(ANNOTATIONS).index("bookId").openKeyCursor(IDBKeyRange.only(id));
    notes.onsuccess=()=>{const cursor=notes.result;if(cursor){tx.objectStore(ANNOTATIONS).delete(cursor.primaryKey);cursor.continue()}};
    const settingKeys=tx.objectStore(SETTINGS).openKeyCursor();
    settingKeys.onsuccess=()=>{const cursor=settingKeys.result;if(cursor){const key=String(cursor.primaryKey);if(key===`reader:${id}`||key===`pagination:${id}`||key===`analysis:${id}`)tx.objectStore(SETTINGS).delete(cursor.primaryKey);cursor.continue()}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}

export async function saveBookProgress(id: string, progress: number, currentLocation: string) {
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOOKS, "readwrite");
    const store = tx.objectStore(BOOKS);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, progress, currentLocation, updatedAt: Date.now() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const saveReaderSettings = (bookId: string, value: ReaderSettings) => put(SETTINGS, { key: `reader:${bookId}`, value, updatedAt:Date.now() });
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
    const tx = db.transaction([CATEGORIES,SETTINGS,BOOKS], "readwrite"), categories = tx.objectStore(CATEGORIES), time=Date.now();
    let failure:Error|undefined;
    const update=()=>{
      categories.delete(name);
      if(next)categories.put({name:next,createdAt:time,updatedAt:time});
      tx.objectStore(SETTINGS).put({key:`deleted:categories:${name}`,value:time});
      const request=tx.objectStore(BOOKS).openCursor();
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

export async function exportLibraryBackup(){
  // Recover pending sessions before constructing a portable snapshot.
  await Promise.all(pendingSessions().map(session=>saveLocalSession(session)));
  const db=await getLibrary();
  const [books,annotations,settings,categories,sessions]=await new Promise<[LocalBookRecord[],ReaderAnnotation[],{key:string;value:unknown}[],{name:string}[],LocalReadingSession[]]>((resolve,reject)=>{
    const tx=db.transaction([BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],"readonly"), values:unknown[]=[];
    [BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS].forEach((name,index)=>{const request=tx.objectStore(name).getAll();request.onsuccess=()=>{values[index]=request.result}});
    tx.oncomplete=()=>resolve(values as [LocalBookRecord[],ReaderAnnotation[],{key:string;value:unknown}[],{name:string}[],LocalReadingSession[]]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  const encodedBooks=await Promise.all(books.map(async({blob,...book})=>({...book,coverDataUrl:book.coverDataUrl||settings.find(item=>item.key===`cover:${book.id}`)?.value||null,blob:await blobToDataUrl(blob)})));
  const tombstones=Object.fromEntries(settings.filter(item=>item.key.startsWith("deleted:")).map(item=>[item.key.slice(8),item.value]));
  return new Blob([JSON.stringify({format:"papery-backup",version:1,exportedAt:new Date().toISOString(),books:encodedBooks,annotations,settings:settings.filter(item=>portableSetting(item.key)),categories,sessions,tombstones})],{type:"application/json"});
}

export async function importLibraryBackup(file:File){
  const data=JSON.parse(await file.text());validateSnapshot(data);
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
    if(value.pdfMode!==undefined&&value.pdfMode!=="original"&&value.pdfMode!=="text")throw new Error("备份 PDF 阅读模式无效");
  }
  // Decode before opening the transaction, so malformed data cannot partially restore.
  const decodedBooks=data.books.map(book=>({...book,blob:dataUrlToBlob(String(book.blob))}));
  const db=await getLibrary();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],"readwrite");
    const names=[BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],existing:Record<string,SyncRecord[]>={};let remaining=names.length,failure:unknown;
    const stamp=(record:SyncRecord)=>Number(record.updatedAt||record.createdAt||record.started_at||0);
    const apply=()=>{try{
      const tombstones:Record<string,number>={...data.tombstones};
      for(const item of existing[SETTINGS])if(String(item.key).startsWith("deleted:")){const key=String(item.key).slice(8);tombstones[key]=Math.max(tombstones[key]||0,Number(item.value)||0)}
      const incoming:Record<string,SyncRecord[]>={books:decodedBooks,annotations:data.annotations,settings:data.settings.filter(item=>portableSetting(String(item.key))),categories:data.categories,sessions:data.sessions};
      const liveBooks=new Set(existing[BOOKS].filter(item=>(tombstones[`books:${item.id}`]??-1)<stamp(item)).map(item=>item.id));
      for(const item of incoming.books)if((tombstones[`books:${item.id}`]??-1)<stamp(item))liveBooks.add(item.id);
      for(const name of names){const key=name===SETTINGS?"key":name===CATEGORIES?"name":"id",store=tx.objectStore(name),old=new Map(existing[name].map(item=>[String(item[key]),item]));
        for(const item of incoming[name]){const id=String(item[key]);if((tombstones[`${name}:${id}`]??-1)>=stamp(item)||name===ANNOTATIONS&&!liveBooks.has(String(item.bookId)))continue;const previous=old.get(id);if(!previous||stamp(item)>stamp(previous))store.put(item)}
        if(name!==SETTINGS)for(const item of existing[name])if((tombstones[`${name}:${item[key]}`]??-1)>=stamp(item)||name===ANNOTATIONS&&!liveBooks.has(String(item.bookId)))store.delete(String(item[key]));
      }
      for(const [key,time] of Object.entries(tombstones))tx.objectStore(SETTINGS).put({key:`deleted:${key}`,value:time});
    }catch(error){failure=error;tx.abort()}};
    for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{existing[name]=request.result;if(!--remaining)apply()}};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(failure||tx.error||new Error("恢复未完成，原数据已保留"));
  });
  // Only committed IDB positions may override the local crash-recovery cache.
  for(const book of data.books)try{localStorage.removeItem(`papery-progress-${book.id}`)}catch{}
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
