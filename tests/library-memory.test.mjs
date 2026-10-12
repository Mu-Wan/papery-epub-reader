import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { indexedDB, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
globalThis.indexedDB=indexedDB;globalThis.IDBKeyRange=IDBKeyRange;
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.FileReader=class{readAsArrayBuffer(blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onload?.()})}readAsDataURL(blob){void blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;this.onload?.()})}};
const legacy=await new Promise((resolve,reject)=>{const r=indexedDB.open("papery-library",3);r.onupgradeneeded=()=>{for(const name of ["books","settings","categories","sessions"])r.result.createObjectStore(name,{keyPath:name==="settings"?"key":name==="categories"?"name":"id"});r.result.createObjectStore("annotations",{keyPath:"id"}).createIndex("bookId","bookId")};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const bytes=new Uint8Array(128*1024);bytes.fill(45);
await new Promise(resolve=>{const tx=legacy.transaction("books","readwrite");for(let index=0;index<15;index++)tx.objectStore("books").put({id:`legacy-${index}`,title:`书${index}`,author:"作者",format:"EPUB",category:"原分类",progress:index,updatedAt:10,fileBytes:bytes.buffer,fileMime:"application/epub+zip"});tx.oncomplete=resolve});legacy.close();
const bundled=await build({entryPoints:["app/lib/local-library.ts"],bundle:true,format:"esm",platform:"browser",write:false});
const library=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

test("Typography changes save globally while chapter rules, PDF mode and desktop spread remain scoped",async()=>{
 await library.saveSetting("reader-defaults",{fontSize:20,spread:"double",horizontalMargin:9,verticalMargin:6});
 const value={fontFamily:"sans",fontSize:26,lineHeight:1.8,paragraphSpacing:12,horizontalMargin:7,verticalMargin:5,pageColor:"#FCFBFA",paperTexture:"plain",flow:"paginated",spread:"single",pdfMode:"text",txtChapterRule:{mode:"simple",name:"本书",chapter:"第*章"}};
 await library.saveReaderSettings("shared-qa",value,{format:"TXT",mobile:true});const profile=await library.loadSetting("reader-defaults"),book=await library.loadSetting("reader:shared-qa");
 assert.equal(profile.fontSize,26);assert.equal(profile.spread,"double");assert.equal(profile.txtChapterRule,undefined);assert.equal(profile.pdfMode,undefined);assert.equal(book.txtChapterRule.name,"本书");assert.equal(book.pdfMode,"text");
 await library.saveReaderSettings("pdf-qa",{...value,pdfMode:"original",horizontalMargin:120,verticalMargin:60},{format:"PDF",mobile:false});const next=await library.loadSetting("reader-defaults");assert.equal(next.horizontalMargin,7);assert.equal(next.verticalMargin,5);
});

test("Out-of-order page writes and later metadata edits preserve the newest precise locator",async()=>{
 await library.saveBookProgress("legacy-2",80,"chapter-50-middle",1000);
 await library.saveBookProgress("legacy-2",1,"stale-first-chapter",900);
 await library.updateLocalBook("legacy-2",{title:"新标题"});
 const book=await library.loadLocalBook("legacy-2");assert.equal(book.currentLocation,"chapter-50-middle");assert.equal(book.progress,80);assert.equal(book.progressUpdatedAt,1000);assert.equal(book.title,"新标题");
});
test("Version 3 migration retains 15 files and builds a byte-free startup index",async()=>{
 const summaries=await library.loadLocalBookSummaries();assert.equal(summaries.length,15);
 for(const summary of summaries){assert.equal(summary.blob,undefined);assert.equal(summary.fileBytes,undefined);assert.equal(summary.fileMime,undefined);}
 const book=await library.loadLocalBook("legacy-14");assert.equal(book.progress,14);assert.deepEqual(new Uint8Array(await book.blob.arrayBuffer()),bytes);
});
test("Startup, metadata edits, category changes and page turns never read complete book files",async()=>{
 const originalGet=IDBObjectStore.prototype.get,originalAll=IDBObjectStore.prototype.getAll,originalCursor=IDBObjectStore.prototype.openCursor;
 IDBObjectStore.prototype.get=function(...args){assert.notEqual(this.name,"books","metadata operation read file bytes");return originalGet.apply(this,args)};
 IDBObjectStore.prototype.getAll=function(...args){assert.notEqual(this.name,"books","startup loaded whole library");return originalAll.apply(this,args)};
 IDBObjectStore.prototype.openCursor=function(...args){assert.notEqual(this.name,"books","category edit traversed file bytes");return originalCursor.apply(this,args)};
 try{await library.loadLocalBookSummaries();await library.saveBookProgress("legacy-0",73,"anchor");await library.updateLocalBook("legacy-0",{title:"新标题"});await library.renameCategory("原分类","新分类");}
 finally{IDBObjectStore.prototype.get=originalGet;IDBObjectStore.prototype.getAll=originalAll;IDBObjectStore.prototype.openCursor=originalCursor;}
 const book=await library.loadLocalBook("legacy-0");assert.equal(book.title,"新标题");assert.equal(book.progress,73);assert.equal(book.currentLocation,"anchor");assert.equal(book.category,"新分类");assert.deepEqual(new Uint8Array(await book.blob.arrayBuffer()),bytes);
});
test("Backup and transactional restore keep metadata/file pairs and exclude connection secrets",async()=>{
 await library.saveSetting("reader-defaults",{fontSize:24,flow:"scrolled"});await library.saveSetting("sync:webdav-config",{password:"SECRET"});
 const backup=await library.exportLibraryBackup(),data=JSON.parse(await backup.text());assert.ok(!(await backup.text()).includes("SECRET"));assert.ok(data.settings.some(s=>s.key==="reader-defaults"));
 const bad=structuredClone(data);bad.books[0].title=42;await assert.rejects(library.importLibraryBackup(new Blob([JSON.stringify(bad)])),/信息无效/);assert.equal((await library.loadLocalBookSummaries()).length,15);
 const book=data.books.find(b=>b.id==="legacy-0");book.title="同步标题";book.updatedAt=Date.now()+1000;await library.importLibraryBackup(new Blob([JSON.stringify(data)]));
 assert.equal((await library.loadLocalBookSummaries()).find(b=>b.id==="legacy-0").title,"同步标题");assert.deepEqual(new Uint8Array(await(await library.loadLocalBook("legacy-0")).blob.arrayBuffer()),bytes);
 assert.equal((await library.loadSetting("sync:webdav-config")).password,"SECRET");
});
test("Missing sync files abort before applying records, and deletion removes index as well as bytes",async()=>{
 const records=await library.exportLibraryRecords();const badBlobs=new Map(records.blobs);badBlobs.delete("legacy-0");
 await assert.rejects(library.importLibraryRecords(records.snapshot,badBlobs),/缺失/);assert.equal((await library.loadLocalBookSummaries()).length,15);
 await library.deleteLocalBook("legacy-1");assert.equal(await library.loadLocalBook("legacy-1"),null);assert.ok(!(await library.loadLocalBookSummaries()).some(b=>b.id==="legacy-1"));
});
test("400-book library keeps oversized covers and file bodies out of startup/sync metadata",async()=>{
 const cover="data:image/jpeg;base64,"+"A".repeat(120_000);
 for(let index=14;index<400;index++)await library.saveLocalBook({id:`stress-${index}`,title:`压力书${index}`,author:"测试作者",format:"TXT",category:"压力测试",progress:0,updatedAt:20,coverDataUrl:cover,blob:new Blob([bytes])});
 const originalAll=IDBObjectStore.prototype.getAll,originalGet=IDBObjectStore.prototype.get;
 IDBObjectStore.prototype.getAll=function(...args){assert.notEqual(this.name,"books");return originalAll.apply(this,args)};
 IDBObjectStore.prototype.get=function(...args){assert.notEqual(this.name,"books");return originalGet.apply(this,args)};
 try{
  const headers=await library.loadLocalBookSummaries();assert.equal(headers.length,400);assert.ok(headers.filter(b=>b.hasCover).every(b=>!b.coverDataUrl));
  const records=await library.exportLibraryRecords({lazyFiles:true});assert.equal(records.snapshot.books.length,400);assert.equal(records.blobs.size,0);assert.ok(JSON.stringify(records.snapshot).length<300_000);
  records.snapshot.books[0].title="同步期间的新标题";records.snapshot.books[0].updatedAt=Date.now()+5000;
  await library.importLibraryRecords(records.snapshot,records.blobs);
  assert.equal((await library.loadLocalBookSummaries())[0].title,"同步期间的新标题");
 }finally{IDBObjectStore.prototype.getAll=originalAll;IDBObjectStore.prototype.get=originalGet}
 assert.equal((await library.loadLocalBook("stress-399")).blob.size,bytes.byteLength);
});
test("Staged sync files commit atomically and a missing staged body rolls back metadata",async()=>{
 const records=await library.exportLibraryRecords({lazyFiles:true});const incoming={...records.snapshot,books:[{...records.snapshot.books[0],id:"incoming",title:"云端新书",updatedAt:Date.now()+10_000}]};
 const id=await library.stageSyncFile(new Blob(["正文完整"])),files=new Map();files.stagedIds=new Map([["incoming",id]]);
 await library.importLibraryRecords(incoming,files);assert.equal(await(await library.loadLocalBook("incoming")).blob.text(),"正文完整");
 const broken={...incoming,books:[{...incoming.books[0],title:"不应保存",updatedAt:Date.now()+20_000}]};files.stagedIds.set("incoming","missing");
 await assert.rejects(library.importLibraryRecords(broken,files),/临时文件缺失/);assert.equal((await library.loadLocalBook("incoming")).title,"云端新书");
 await library.discardStagedSyncFiles([id]);await assert.rejects(library.readStagedSyncFile(id),/缺失/);
});
test("ZIP backup restores a 400-book library one file at a time and rejects an incomplete archive",async()=>{
 const privateFiles=new Map(),handle=name=>({kind:"file",getFile:async()=>new File([privateFiles.get(name)],name),createWritable:async()=>{const chunks=[];return new WritableStream({write:chunk=>chunks.push(chunk),close:()=>privateFiles.set(name,new Blob(chunks))})}});
 const directory={getDirectoryHandle:async()=>directory,getFileHandle:async(name)=>handle(name),removeEntry:async name=>{privateFiles.delete(name)},async *entries(){for(const name of privateFiles.keys())yield [name,handle(name)]}};
 Object.defineProperty(globalThis.navigator,"storage",{configurable:true,value:{getDirectory:async()=>directory}});
 const bundled=await build({entryPoints:["app/lib/library-archive.ts"],bundle:true,format:"esm",platform:"browser",write:false});
 const archive=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
 const backup=await archive.exportLibraryArchive();assert.equal(backup.type,"application/zip");
 const picked=new File([backup],"library.zip",{type:"application/zip"});
 picked.arrayBuffer=()=>{throw new Error("Picked archive must not become one full ArrayBuffer")};
 await library.deleteLocalBook("stress-399");await archive.importLibraryArchive(picked);assert.equal((await library.loadLocalBookSummaries()).length,400);assert.equal((await library.loadLocalBook("stress-398")).blob.size,bytes.byteLength);
 const {ZipWriter,BlobWriter,TextReader}=await import("@zip.js/zip.js"),writer=new ZipWriter(new BlobWriter());
 const records=await library.exportLibraryRecords({lazyFiles:true});const bad={...records.snapshot,books:[{...records.snapshot.books[0],backupFile:"books/book-000000.bin",backupMime:"text/plain"}]};
 await writer.add("papery.json",new TextReader(JSON.stringify(bad)),{level:0,useWebWorkers:false});
 await assert.rejects(archive.importLibraryArchive(await writer.close()),/文件缺失/);assert.equal((await library.loadLocalBookSummaries()).length,400);
 await assert.rejects(archive.importLibraryArchive(new File(["invalid"],"broken.zip")),/备份恢复失败，原数据已保留/);
 const db=await new Promise(resolve=>{const r=indexedDB.open("papery-library");r.onsuccess=()=>resolve(r.result)});
 const remaining=await new Promise(resolve=>{const r=db.transaction("sync-files").objectStore("sync-files").count();r.onsuccess=()=>resolve(r.result)});db.close();assert.equal(remaining,0);assert.equal(privateFiles.size,0);
});
