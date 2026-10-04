"use client";
import { useEffect, useState } from "react";
import { X, Cloud, LogOut } from "./PaperyIcons";
import { loadSetting, saveSetting } from "../lib/local-library";
import { connectDriveToken, disconnectDrive, driveConnected, syncGoogleDrive, type DriveConfig } from "../lib/drive-sync";
import { startDriveLogin, finishDriveLogin, cancelDriveLogin } from "../lib/drive-auth";
import { useDialogFocus } from "./use-dialog-focus";
import { BackupSyncGuide } from "./BackupSyncGuide";
import { ToggleSwitch } from "./ToggleSwitch";

export function SyncPanel({onClose,onUpdated,embedded=false,onBusyChange}:{onClose:()=>void;onUpdated:()=>void;embedded?:boolean;onBusyChange?:(busy:boolean)=>void}) {
 const dialog=useDialogFocus<HTMLElement>(()=>{if(!busy)onClose()},!embedded);
 const [config,setConfig]=useState<DriveConfig>({clientId:"",autoSync:false});
 const [connected,setConnected]=useState(()=>driveConnected()),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[status,setStatus]=useState("尚未连接 Google Drive"),[code,setCode]=useState("");
 const [failed,setFailed]=useState(false);
 useEffect(()=>{onBusyChange?.(busy)},[busy,onBusyChange]);
 const accept=async(input:string)=>{setFailed(false);try{const result=await finishDriveLogin(input);connectDriveToken(result.access_token,result.expires_in);setCode("");setConnected(true);setWaiting(false);setStatus("已连接 Google Drive，可以立即同步")}catch(error){setFailed(true);setStatus(error instanceof Error?error.message:"连接码无效，请重新连接")}};
 useEffect(()=>{let disposed=false;let unlisten:(()=>void)|undefined;void loadSetting<DriveConfig>("sync:drive-config").then(value=>{if(value&&!disposed)setConfig({clientId:value.clientId||"",autoSync:!!value.autoSync})});if("__TAURI_INTERNALS__" in window)void import("@tauri-apps/plugin-deep-link").then(async({onOpenUrl})=>{const stop=await onOpenUrl(urls=>{const url=urls.find(value=>value.startsWith("papery://drive-auth#"));if(url)void accept(url)});if(disposed)stop();else unlisten=stop}).catch(()=>{if(!disposed)setStatus("可通过系统浏览器授权，并粘贴连接码返回")});return()=>{disposed=true;unlisten?.();cancelDriveLogin()}},[]);
 const save=async(next:DriveConfig)=>{setConfig(next);await saveSetting("sync:drive-config",next)};
 const sync=async()=>{setBusy(true);setFailed(false);try{const result=await syncGoogleDrive(setStatus);await saveSetting("sync:last-success",Date.now());setStatus(`同步完成：${result.books} 本书，${result.notes} 条笔记`);onUpdated()}catch(error){setFailed(true);setStatus(error instanceof Error?error.message:"同步失败，本地数据已保留")}finally{setBusy(false);setConnected(driveConnected())}};
 const login=async()=>{setBusy(true);setFailed(false);try{const url=await startDriveLogin(config.clientId);if("__TAURI_INTERNALS__" in window){const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(url)}else{window.open(url,"_blank","noopener,noreferrer")}setWaiting(true);setStatus("浏览器会尝试直接打开 Google 官方授权窗口。若没有弹出，请在连接页点击“继续到 Google”。请保持此面板打开，授权后会尝试自动返回。")}catch(error){setFailed(true);setStatus(error instanceof Error?error.message:"无法打开授权页面")}finally{setBusy(false)}};
 return <>{!embedded&&<button className="modalScrim" aria-label="关闭同步设置" onClick={busy?undefined:onClose}/>}<aside ref={embedded?undefined:dialog} className={`syncPanel ${embedded?"userSyncContent":"settingsPanel"}`} role={embedded?undefined:"dialog"} aria-modal={embedded?undefined:true} aria-label="Google Drive 同步" aria-busy={busy}>{!embedded&&<div className="panelHeader"><div><h2>Google Drive 同步</h2></div><button disabled={busy} onClick={onClose} aria-label="关闭同步设置"><X size={20}/></button></div>}
 <p className="syncDescription">只需 Web 应用客户端 ID，无需客户端密钥或自建登录服务。同步书籍、阅读位置、笔记、书签、分类与排版。</p>
 <div className={`syncStatus ${connected?"connected":""} ${busy?"processing":""} ${failed?"error":""}`} role={failed?"alert":"status"}><Cloud size={20}/><span>{status}</span></div>
 <label>Google 客户端 ID<input aria-label="OAuth 客户端 ID" value={config.clientId} disabled={busy||waiting} onChange={event=>void save({...config,clientId:event.target.value.trim()})} placeholder="…apps.googleusercontent.com"/></label>
 <button className="uiButton full" disabled={busy||!config.clientId} onClick={login}>{waiting?"重新打开 Google 授权":"使用 Google 连接"}</button>
 {waiting&&<><label>粘贴连接码（浏览器未自动返回时）<textarea aria-label="连接码" value={code} onChange={event=>setCode(event.target.value)} rows={3}/></label><button className="uiButton full" disabled={!code.trim()||busy} onClick={()=>void accept(code)}>完成连接</button><button className="uiButton full" onClick={()=>{cancelDriveLogin();setWaiting(false);setCode("");setStatus("已取消连接")}}>取消本次授权</button></>}
 <button className="uiButton dark full" disabled={busy||!connected} onClick={sync}>{busy?"正在处理…":"立即同步"}</button>
 <div className="syncAuto"><ToggleSwitch checked={config.autoSync} onChange={checked=>void save({...config,autoSync:checked})} label="连接期间在书库自动同步" disabled={busy}/><span>连接期间在书库自动同步</span></div>
 <p className="settingsHint">关闭应用或授权过期后需重新连接。离线时保留本地数据；同一记录合并较新的修改，删除也会同步。首次同步建议先导出备份。</p>
 {connected&&<button className="uiButton full" disabled={busy} onClick={()=>{disconnectDrive();setConnected(false);setStatus("已断开连接，本地书库仍保留")}}><LogOut size={16}/>断开连接</button>}
 <BackupSyncGuide/>
 </aside></>;
}
