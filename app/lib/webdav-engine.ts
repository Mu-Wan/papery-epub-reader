import type { BookFiles } from "./book-files";
import type { SyncSnapshot } from "./sync-merge";
import type { WebDavClient } from "./webdav-client";

export const DAV_CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_MANIFEST = 32 * 1024 * 1024;
type Resource = { chunks: string[]; size: number; mime: string };
type Records = { snapshot: SyncSnapshot; blobs: BookFiles };
type Dependencies = {
  client: Pick<WebDavClient, "list" | "ensureFolders" | "exists" | "get" | "put" | "remove">;
  readLocal: () => Promise<Records>; applyLocal: (snapshot: SyncSnapshot, blobs: BookFiles) => Promise<void>;
  stage?: (blob:Blob) => Promise<string>; readStaged?: (id:string) => Promise<Blob>;
  merge: (snapshots: SyncSnapshot[]) => SyncSnapshot; validate: (value: unknown) => void; deviceId: string;
};
const key = (resource: Resource) => JSON.stringify(resource);
const readBookFile=async(files:BookFiles,id:string)=>files.get(id)||await files.read?.(id);
const partPath = (hash: string) => `books/part-${hash}.bin`;
async function hash(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境不支持安全同步，请使用桌面版、安卓版或 HTTPS 网页版");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function resourceOf(value: unknown): Resource {
  const resource = value as Resource;
  if (!resource || !Number.isSafeInteger(resource.size) || resource.size <= 0 || !Array.isArray(resource.chunks) || resource.chunks.length !== Math.ceil(resource.size / DAV_CHUNK_SIZE) || resource.chunks.length > 16384 || resource.chunks.some(h => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h)) || typeof resource.mime !== "string" || resource.mime.length > 200 || /[\r\n]/.test(resource.mime)) throw new Error("云端书籍文件信息无效，本地数据已保留");
  return resource;
}
type Available = {read:()=>Promise<Blob>; localIds?:Set<string>; stagedId?:string};
async function prepare(records: Records, available: Map<string, Available>, parts: Map<string, ()=>Promise<Blob>>, client:Dependencies["client"], uploadedParts:Set<string>, progress:()=>void) {
  const books = [];
  for (const book of records.snapshot.books) {
    const id=String(book.id),blob=await readBookFile(records.blobs,id);
    if (!blob?.size) throw new Error("本地书籍文件为空，暂未同步");
    const chunks: string[] = [];
    for (let offset = 0; offset < blob.size; offset += DAV_CHUNK_SIZE) {
      const part = blob.slice(offset, offset + DAV_CHUNK_SIZE), digest = await hash(part);
      chunks.push(digest);
      // Capture only the file id and offset, never the current file or its buffer.
      parts.set(digest, async()=>{const current=await readBookFile(records.blobs,id);if(!current)throw new Error("本地书籍已变更，请重试同步");return current.slice(offset,offset+DAV_CHUNK_SIZE)});
      if(!uploadedParts.has(digest)){uploadedParts.add(digest);if(!await client.exists(partPath(digest))){progress();await client.put(partPath(digest),part)}}
    }
    const resource = { chunks, size: blob.size, mime: blob.type };
    const localIds=available.get(key(resource))?.localIds||new Set<string>();localIds.add(id);
    available.set(key(resource), {localIds,read:async()=>{const current=await readBookFile(records.blobs,id);if(!current)throw new Error("本地书籍已变更，请重试同步");return current}}); books.push({ ...book, resource });
  }
  return { ...records.snapshot, books };
}
function decode(bytes: Uint8Array, validate: Dependencies["validate"]): SyncSnapshot {
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (value?.format !== "papery-webdav" || value.version !== 1) throw new Error("云端同步文件版本不支持，本地数据已保留");
  const snapshot = { ...value, format: "papery-backup" } as SyncSnapshot;
  validate(snapshot);
  for (const book of snapshot.books) { resourceOf(book.resource); if (book.blob !== "data:application/octet-stream;base64,") throw new Error("云端同步文件格式不正确"); }
  return snapshot;
}
const manifestName = /^papery-sync-v1-([a-zA-Z0-9-]+)-(\d+)-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.json$/;

/** Immutable chunks and per-device manifests avoid overwriting concurrent uploads. */
export async function runWebDavSync(deps: Dependencies, status: (message: string) => void) {
  const { client, deviceId } = deps;
  if (!/^[a-zA-Z0-9-]+$/.test(deviceId)) throw new Error("本机同步标识无效");
  status("正在连接 WebDAV…"); await client.ensureFolders();
  const files = await client.list(), latest = new Map<string, { name: string; timestamp: number }>();
  for (const name of files) {
    const match = manifestName.exec(name); if (!match) continue;
    const timestamp = Number(match[2]); if (!Number.isSafeInteger(timestamp)) continue;
    const previous = latest.get(match[1]);
    if (!previous || timestamp > previous.timestamp || timestamp === previous.timestamp && name > previous.name) latest.set(match[1], { name, timestamp });
  }
  const snapshots: SyncSnapshot[] = [];
  status("正在合并书库与阅读记录…");
  for (const file of latest.values()) snapshots.push(decode(await client.get(file.name, MAX_MANIFEST), deps.validate));
  const available = new Map<string, Available>(), parts = new Map<string, ()=>Promise<Blob>>();
  let uploaded=0;const uploadedParts=new Set<string>();const progress=()=>status(`正在上传书籍文件（${++uploaded} 个数据块）…`);
  snapshots.push(await prepare(await deps.readLocal(), available, parts,client,uploadedParts,progress));
  const merged = deps.merge(snapshots);
  // Verify each remote book, stage it durably, then release its buffers before the next.
  const resolve = async (snapshot: SyncSnapshot) => {
    const blobs:BookFiles=new Map();blobs.localIds=new Set();blobs.stagedIds=new Map();
    const reads=new Map<string,()=>Promise<Blob>>();blobs.read=async id=>await reads.get(id)?.();
    let count=0;
    for (const book of snapshot.books) {
      const id=String(book.id),resource = resourceOf(book.resource), resourceKey = key(resource);
      let entry = available.get(resourceKey);
      if (!entry) {
        status(`正在下载书籍（${++count}/${snapshot.books.length}）…`);
        const downloaded: Blob[] = [];
        for (let index = 0; index < resource.chunks.length; index++) {
          const digest = resource.chunks[index], expected = Math.min(DAV_CHUNK_SIZE, resource.size - index * DAV_CHUNK_SIZE);
          const local=parts.get(digest);
          const part = local?await local():new Blob([new Uint8Array(await client.get(partPath(digest), expected)).buffer]);
          if (part.size !== expected || await hash(part) !== digest) throw new Error("云端书籍文件校验失败，本地数据已保留");
          downloaded.push(part);
        }
        const blob = new Blob(downloaded, { type: resource.mime });
        if(deps.stage&&deps.readStaged){const stagedId=await deps.stage(blob);entry={stagedId,read:()=>deps.readStaged!(stagedId)}}
        else entry={read:async()=>blob};
        available.set(resourceKey,entry);
      }
      reads.set(id,entry.read);
      if(entry.localIds?.has(id))blobs.localIds.add(id);
      if(entry.stagedId)blobs.stagedIds.set(id,entry.stagedId);
      if(!deps.stage)blobs.set(id,await entry.read());
    }
    return blobs;
  };
  await resolve(merged);
  const timestamp = Math.max(Date.now(), (latest.get(deviceId)?.timestamp || 0) + 1);
  const name = `papery-sync-v1-${deviceId}-${timestamp}-${crypto.randomUUID()}.json`;
  const manifest = JSON.stringify({ ...merged, format: "papery-webdav" });
  if (new Blob([manifest]).size > MAX_MANIFEST) throw new Error("书库信息超过同步上限，请先导出本地备份");
  status("正在保存同步记录…");
  if (!await client.put(name, manifest)) throw new Error("同步记录发生冲突，请重试；本地数据已保留");
  // Preserve edits made during network operations; the IDB commit also checks freshness.
  const fresh = await prepare(await deps.readLocal(), available, parts,client,uploadedParts,progress);
  const final = deps.merge([merged, fresh]);
  await deps.applyLocal(final, await resolve(final));
  for (const old of files.filter(file => manifestName.exec(file)?.[1] === deviceId).sort().reverse().slice(2)) await client.remove(old).catch(() => {});
  return { books: final.books.length, notes: final.annotations.length, uploadedParts: uploaded };
}
