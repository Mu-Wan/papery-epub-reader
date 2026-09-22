import { exportLibraryBackup, importLibraryBackup, getDeviceId } from "./local-library";
import { mergeSnapshots, validateSnapshot, type SyncSnapshot } from "./sync-merge";

const API = "https://www.googleapis.com/drive/v3";
let running: Promise<{ books: number; notes: number }> | null = null;
export type DriveConfig = { clientId: string; authUrl: string; autoSync: boolean };
let accessToken = "";
let expiresAt = 0;
export function connectDriveToken(token: string, seconds = 3500) { accessToken=token.trim(); expiresAt=Date.now()+seconds*1000; }
export function disconnectDrive() { accessToken=""; expiresAt=0; }
export function driveConnected() { return !!accessToken && expiresAt>Date.now(); }

async function request(url: string, init: RequestInit = {}, retries = 0): Promise<Response> {
  if (!driveConnected()) throw new Error("Google 授权尚未连接或已过期，请重新连接");
  const response = await fetch(url, { ...init, headers:{...init.headers, Authorization:`Bearer ${accessToken}`}, signal:AbortSignal.timeout(60000) });
  if ((response.status===429 || response.status>=500) && retries<3) { await new Promise(resolve=>setTimeout(resolve,500*2**retries)); return request(url,init,retries+1); }
  if (response.status===401) { disconnectDrive(); throw new Error("Google 授权已过期，请重新连接"); }
  if (!response.ok && response.status!==308) throw new Error(`Google Drive 请求失败（${response.status}），本地数据已保留`);
  return response;
}

async function listSnapshots() {
  const files: {id:string;name:string;modifiedTime:string}[]=[];
  let token="";
  do {
    const params=new URLSearchParams({spaces:"appDataFolder",q:"trashed = false and name contains 'papery-sync-v1-'",fields:"nextPageToken,files(id,name,modifiedTime)",pageSize:"1000",...(token?{pageToken:token}:{})});
    const result=await (await request(`${API}/files?${params}`)).json();
    files.push(...result.files);token=result.nextPageToken||"";
  } while(token);
  return files;
}

async function uploadSnapshot(snapshot: SyncSnapshot, name: string) {
  const blob = new Blob([JSON.stringify(snapshot)],{type:"application/json"});
  const init=await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",{
    method:"POST",headers:{"Content-Type":"application/json","X-Upload-Content-Type":"application/json","X-Upload-Content-Length":String(blob.size)},
    body:JSON.stringify({name,parents:["appDataFolder"],mimeType:"application/json"})
  });
  const url=init.headers.get("Location");
  if(!url || new URL(url).origin!=="https://www.googleapis.com")throw new Error("无法建立 Google Drive 上传连接");
  const chunk=8*1024*1024;
  for(let start=0;start<blob.size;start+=chunk){const end=Math.min(blob.size,start+chunk);await request(url,{method:"PUT",headers:{"Content-Type":"application/json","Content-Range":`bytes ${start}-${end-1}/${blob.size}`},body:blob.slice(start,end)});}
}

export function syncGoogleDrive(onStatus:(text:string)=>void) {
  if(running)return running;
  running=(async()=>{
    onStatus("正在读取云端书库…");
    const files=await listSnapshots();
    // Immutable per-device snapshots avoid two devices overwriting one shared file.
    const latest=new Map<string,typeof files[number]>();
    for(const file of files){const match=/^papery-sync-v1-(.+)-(\d+)\.json$/.exec(file.name);if(!match)continue;const prev=latest.get(match[1]);if(!prev||file.name>prev.name)latest.set(match[1],file);}
    const snapshots:SyncSnapshot[]=[];
    for(const file of latest.values()){const value=await (await request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`)).json();validateSnapshot(value);snapshots.push(value);}
    const local=JSON.parse(await (await exportLibraryBackup()).text());validateSnapshot(local);snapshots.push(local);
    const merged=mergeSnapshots(snapshots);
    onStatus(`正在同步 ${merged.books.length} 本书和 ${merged.annotations.length} 条笔记…`);
    const prefix=`papery-sync-v1-${getDeviceId()}-`;
    await uploadSnapshot(merged,`${prefix}${Date.now()}.json`);
    // Re-read after network I/O so edits made while uploading cannot be overwritten locally.
    const fresh=JSON.parse(await (await exportLibraryBackup()).text());
    const final=mergeSnapshots([merged,fresh]);
    await importLibraryBackup(new File([JSON.stringify(final)],"sync.json",{type:"application/json"}));
    // Keep two previous snapshots for recovery; failure to tidy does not fail a completed sync.
    const old=files.filter(file=>file.name.startsWith(prefix)).sort((a,b)=>b.name.localeCompare(a.name)).slice(2);
    for(const file of old)await request(`${API}/files/${encodeURIComponent(file.id)}`,{method:"DELETE"}).catch(()=>undefined);
    return {books:final.books.length,notes:final.annotations.length};
  })().finally(()=>{running=null;});
  return running;
}
