"use client";
import { useSyncExternalStore } from "react";
import { publicUpdateFetch, updateInstallerHash, type AppRelease, type UpdatePlatform } from "../lib/app-updates";
export type DownloadState={phase:"idle"|"preparing"|"downloading"|"verifying"|"ready"|"error"|"cancelled";downloaded:number;total?:number;version?:string;error?:string;installMessage?:string};
let state:DownloadState={phase:"idle",downloaded:0},controller:AbortController|undefined,pending:Promise<void>|undefined;
const listeners=new Set<()=>void>(),serverState=state;
const subscribe=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f)}};
const publish=(next:DownloadState)=>{state=next;listeners.forEach(f=>f())};
export const useUpdateDownload=()=>useSyncExternalStore(subscribe,()=>state,()=>serverState);
export const updateDownloadBusy=(state:DownloadState)=>["preparing","downloading","verifying"].includes(state.phase);
export function downloadUpdate(release:AppRelease,platform:UpdatePlatform):Promise<void>{
 if(pending)return pending;
 const active=new AbortController();controller=active;publish({phase:"preparing",downloaded:0,version:release.version});
 pending=(async()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   timer=setTimeout(()=>active.abort(new Error("连接超时，请重试")),15000);
   const hash=await updateInstallerHash(release,platform,active.signal);clearTimeout(timer);active.signal.throwIfAborted();
   const url=release.downloads[platform]!;
   if("__TAURI_INTERNALS__" in window){
    const {invoke,Channel}=await import("@tauri-apps/api/core");const onProgress=new Channel<{phase:"downloading"|"verifying"|"ready";downloaded:number;total?:number}>();
    onProgress.onmessage=event=>publish({...state,...event,total:event.total||undefined});
    await invoke("download_app_update",{url,fileName:decodeURIComponent(new URL(url).pathname.split("/").pop()!),sha256:hash,onProgress});
   }else{
    const response=await publicUpdateFetch(url,{signal:active.signal,credentials:"omit"});if(!response.ok||!response.body)throw new Error("下载失败，请重试");
    const total=Number(response.headers.get("content-length"))||undefined,reader=response.body.getReader(),parts:Uint8Array<ArrayBuffer>[]=[];let downloaded=0;
    if(total&&total>200*1024*1024)throw new Error("安装包过大");
    try{for(;;){const {done,value}=await reader.read();if(done)break;downloaded+=value.length;if(downloaded>200*1024*1024)throw new Error("安装包过大");parts.push(new Uint8Array(value));publish({...state,phase:"downloading",downloaded,total})}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
    publish({...state,phase:"verifying"});const blob=new Blob(parts),bytes=await blob.arrayBuffer(),digest=await crypto.subtle.digest("SHA-256",bytes),actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
    if(actual!==hash)throw new Error("安装包校验未通过，请重新下载");
    const path=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=path;anchor.download=decodeURIComponent(new URL(url).pathname.split("/").pop()!);anchor.click();setTimeout(()=>URL.revokeObjectURL(path),60000);
    publish({...state,phase:"ready",downloaded,total:downloaded,installMessage:"安装包已保存到浏览器下载目录，请打开它完成升级。"});
   }
  }catch(error){const cancelled=active.signal.aborted&&!(active.signal.reason instanceof Error);publish({...state,phase:cancelled?"cancelled":"error",error:cancelled?undefined:typeof error==="string"?error:error instanceof Error?error.message:"下载失败，请重试"})}
  finally{if(timer)clearTimeout(timer);controller=undefined;pending=undefined}
 })();return pending;
}
export async function cancelUpdateDownload(){controller?.abort("cancelled");if("__TAURI_INTERNALS__" in window){const {invoke}=await import("@tauri-apps/api/core");await invoke("cancel_app_update").catch(()=>{})}}
export async function installUpdate(before?:()=>Promise<void>){
 try{await before?.();const {invoke}=await import("@tauri-apps/api/core");const result=await invoke<string>("install_app_update");publish({...state,installMessage:result==="permission"?"请在系统设置中允许 Papery 安装应用，返回后再次点击“安装更新”。":"系统安装界面已打开，请按提示完成升级。",error:undefined})}
 catch(error){publish({...state,error:typeof error==="string"?error:error instanceof Error?error.message:"安装未启动，请重试"})}
}
