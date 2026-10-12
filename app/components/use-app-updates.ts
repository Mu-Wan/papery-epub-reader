"use client";
import { useEffect, useSyncExternalStore } from "react";
import { checkAppUpdate, deviceUpdatePlatform, type AppRelease } from "../lib/app-updates";
export type UpdateState={status:"idle"|"checking"|"success"|"error";release?:AppRelease;checkedAt?:number;error?:string};
let state:UpdateState={status:"idle"},pending:Promise<void>|undefined;
let lastAttempt=0;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
const serverState:UpdateState={status:"idle"};
const publish=(next:UpdateState)=>{state=next;listeners.forEach(listener=>listener())};
export function checkUpdates():Promise<void>{
  if(pending)return pending;
  lastAttempt=Date.now();publish({...state,status:"checking",error:undefined});
  pending=checkAppUpdate(deviceUpdatePlatform(navigator.userAgent)).then(release=>{publish({status:"success",release,checkedAt:Date.now()})}).catch(error=>{publish({...state,status:"error",error:error instanceof Error?error.message:"无法检查更新"})}).finally(()=>{pending=undefined});
  return pending;
}
export function useAppUpdates(auto=false):UpdateState{
  const current=useSyncExternalStore(subscribe,()=>state,()=>serverState);
  useEffect(()=>{
    if(!auto)return;
    const run=()=>{const interval=state.status==="success"?12*60*60*1000:15*60*1000;if(!document.hidden&&(!lastAttempt||Date.now()-lastAttempt>interval))void checkUpdates()};
    const timer=setTimeout(run,1500);
    // A hidden launch waits until the app is visible; the background request
    // never blocks loading the library or restoring a book.
    document.addEventListener("visibilitychange",run);
    return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",run)};
  },[auto]);
  return current;
}
