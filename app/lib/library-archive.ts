import { exportLibraryRecords, importLibraryRecords, validateLibrarySnapshot, stageSyncFile, discardStagedSyncFiles } from "./local-library";
import { readBookFile, type BookFiles } from "./book-files";

/** ZIP backups keep original file bodies separate from the small metadata document. */
export async function exportLibraryArchive(){
  const {BlobReader,BlobWriter,TextReader,ZipWriter}=await import("@zip.js/zip.js");
  const records=await exportLibraryRecords({lazyFiles:true,includeCovers:true}),writer=new ZipWriter(new BlobWriter("application/zip")),books=[];
  try{
    for(let index=0;index<records.snapshot.books.length;index++){
      const book=records.snapshot.books[index],blob=await readBookFile(records.blobs,String(book.id));
      if(!blob?.size)throw new Error("备份书籍文件缺失，原数据已保留");
      const backupFile=`books/book-${String(index).padStart(6,"0")}.bin`;
      await writer.add(backupFile,new BlobReader(blob),{level:0});books.push({...book,backupFile,backupMime:blob.type});
    }
    await writer.add("papery.json",new TextReader(JSON.stringify({...records.snapshot,books})),{level:0});
    return await writer.close();
  }catch(error){await writer.close().catch(()=>{});throw error}
}
export async function importLibraryArchive(file:Blob){
  const {BlobReader,BlobWriter,TextWriter,ZipReader}=await import("@zip.js/zip.js");
  const staged:string[]=[];
  let reader:InstanceType<typeof ZipReader>|undefined;
  let removeLocalCopy:(()=>Promise<void>)|undefined;
  try{
    // Snapshot document-provider Files to private storage with bounded streaming
    // before ZIP range reads. Android WebView cannot reliably clone these Files.
    if(typeof File!=="undefined"&&file instanceof File&&typeof navigator!=="undefined"&&navigator.storage?.getDirectory){
      const directory=await (await navigator.storage.getDirectory()).getDirectoryHandle("papery-backup-cache",{create:true});
      const entries=directory as FileSystemDirectoryHandle&{entries:()=>AsyncIterableIterator<[string,FileSystemHandle]>};
      for await(const [name,entry] of entries.entries()){
        if(entry.kind!=="file"||!/^backup-\d+-[\w-]+\.zip$/.test(name))continue;
        const previous=await (entry as FileSystemFileHandle).getFile();
        if(previous.lastModified<Date.now()-24*60*60*1000)await directory.removeEntry(name).catch(()=>{});
      }
      const name=`backup-${Date.now()}-${crypto.randomUUID()}.zip`,handle=await directory.getFileHandle(name,{create:true});
      removeLocalCopy=()=>directory.removeEntry(name);
      await file.stream().pipeTo(await handle.createWritable());
      const local=await handle.getFile();
      if(local.size!==file.size)throw new Error("备份暂存失败，原数据已保留");
      file=local;
    }
    reader=new ZipReader(new BlobReader(file));
    const entries=await reader.getEntries(),metadata=entries.find(item=>item.filename==="papery.json");
    if(!metadata||metadata.directory||metadata.uncompressedSize>32*1024*1024)throw new Error("备份目录缺失或过大，原数据已保留");
    const snapshot=JSON.parse(await metadata.getData(new TextWriter(),{checkSignature:true}));validateLibrarySnapshot(snapshot);
    const files:BookFiles=new Map();files.stagedIds=new Map();
    for(const book of snapshot.books){
      if(typeof book.backupFile!=="string"||!/^books\/book-\d{6}\.bin$/.test(book.backupFile)||typeof book.backupMime!=="string"||book.backupMime.length>200)throw new Error("备份文件信息无效，原数据已保留");
      const entry=entries.find(item=>item.filename===book.backupFile);if(!entry||entry.directory||!entry.uncompressedSize)throw new Error("备份书籍文件缺失，原数据已保留");
      const blob=await entry.getData(new BlobWriter(book.backupMime),{checkSignature:true});
      if(blob.size!==entry.uncompressedSize)throw new Error("备份文件校验失败，原数据已保留");
      const id=await stageSyncFile(blob);staged.push(id);files.stagedIds.set(String(book.id),id);
      delete book.backupFile;delete book.backupMime;
    }
    await importLibraryRecords(snapshot,files);
  }catch(error){
    if(error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message))throw error;
    throw new Error("备份恢复失败，原数据已保留。请确认文件完整且本地空间充足。",{cause:error});
  }finally{try{await reader?.close()}finally{try{await discardStagedSyncFiles(staged)}finally{await removeLocalCopy?.().catch(()=>{})}}}
}
