import type { AppPreferences, BookFormat, ReaderAnnotation, ReaderSettings } from "./reader-types";
import { validateSnapshot } from "./sync-merge";

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
};

const DB_NAME = "papery-library";
const DB_VERSION = 3;
const BOOKS = "books";
const ANNOTATIONS = "annotations";
const SETTINGS = "settings";
const CATEGORIES = "categories";
const SESSIONS = "sessions";

export type LocalReadingSession = { id:string;book_id:string;started_at:number;duration_seconds:number;words_read:number };

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

export const saveCategory = (name: string) => put(CATEGORIES, { name, createdAt: Date.now() });
export async function deleteCategory(name: string) {
  const db = await getLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CATEGORIES,SETTINGS], "readwrite");
    tx.objectStore(CATEGORIES).delete(name);
    tx.objectStore(SETTINGS).put({key:`deleted:categories:${name}`,value:Date.now()});
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export const loadCategories = async () => (await getAll<{ name: string }>(CATEGORIES)).map(item => item.name);
export const saveLocalSession = (session: LocalReadingSession) => put(SESSIONS, session);
export const loadLocalSessions = () => getAll<LocalReadingSession>(SESSIONS);

function blobToDataUrl(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
function dataUrlToBlob(value:string){const [header,data]=value.split(",",2);const mime=/data:([^;]+)/.exec(header)?.[1]||"application/octet-stream";const binary=atob(data);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return new Blob([bytes],{type:mime})}

export async function exportLibraryBackup(){
  const [books,annotations,settings,categories,sessions]=await Promise.all([loadLocalBooks(),loadLocalAnnotations(),getAll<{key:string;value:unknown}>(SETTINGS),getAll<{name:string;createdAt?:number}>(CATEGORIES),loadLocalSessions()]);
  const encodedBooks=await Promise.all(books.map(async({blob,...book})=>({...book,blob:await blobToDataUrl(blob)})));
  const tombstones=Object.fromEntries(settings.filter(item=>item.key.startsWith("deleted:")).map(item=>[item.key.slice(8),item.value]));
  return new Blob([JSON.stringify({format:"papery-backup",version:1,exportedAt:new Date().toISOString(),books:encodedBooks,annotations,settings:settings.filter(item=>!item.key.startsWith("sync:")),categories,sessions,tombstones})],{type:"application/json"});
}

export async function importLibraryBackup(file:File,mode:"merge"|"replace"="merge"){
  const data=JSON.parse(await file.text());validateSnapshot(data);
  // Decode before opening the transaction, so malformed data cannot partially restore.
  const decodedBooks=data.books.map(book=>({...book,blob:dataUrlToBlob(String(book.blob))}));
  const retainedSyncSettings=mode==="replace"?(await getAll<{key:string;value:unknown}>(SETTINGS)).filter(item=>item.key.startsWith("sync:")):[];
  const db=await getLibrary();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS],"readwrite");
    if(mode==="replace")for(const name of [BOOKS,ANNOTATIONS,SETTINGS,CATEGORIES,SESSIONS])tx.objectStore(name).clear();
    for(const book of decodedBooks)tx.objectStore(BOOKS).put(book);
    for(const item of data.annotations||[])tx.objectStore(ANNOTATIONS).put(item);
    for(const item of data.settings||[])if(typeof item.key==="string"&&!item.key.startsWith("sync:"))tx.objectStore(SETTINGS).put(item);
    for(const item of data.categories||[])tx.objectStore(CATEGORIES).put(item);
    for(const item of data.sessions||[])tx.objectStore(SESSIONS).put(item);
    for(const item of retainedSyncSettings)tx.objectStore(SETTINGS).put(item);
    for(const [key,time] of Object.entries(data.tombstones||{})){
      tx.objectStore(SETTINGS).put({key:`deleted:${key}`,value:time});
      const colon=key.indexOf(":"),collection=key.slice(0,colon),id=key.slice(colon+1);
      if([BOOKS,ANNOTATIONS,CATEGORIES].includes(collection)){
        const store=tx.objectStore(collection),request=store.get(id);
        request.onsuccess=()=>{const record=request.result;if(record&&Number(record.updatedAt||record.createdAt||0)<=time)store.delete(id)};
      }
    }
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("恢复未完成，原数据已保留"));
  });
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
