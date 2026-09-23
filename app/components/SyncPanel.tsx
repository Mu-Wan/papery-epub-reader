"use client";
import { useEffect, useState } from "react";
import { X, Cloud, LogOut } from "lucide-react";
import { loadSetting, saveSetting } from "../lib/local-library";
import { connectDriveToken, disconnectDrive, driveConnected, syncGoogleDrive, type DriveConfig } from "../lib/drive-sync";
import { startDriveLogin, finishDriveLogin, cancelDriveLogin } from "../lib/drive-auth";
import { BackupSyncGuide } from "./BackupSyncGuide";

export function SyncPanel({onClose,onUpdated}:{onClose:()=>void;onUpdated:()=>void}) {
 const [config,setConfig]=useState<DriveConfig>({clientId:"",autoSync:false});
 const [connected,setConnected]=useState(driveConnected()),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[status,setStatus]=useState("尚未连接 Google Drive"),[code,setCode]=useState("");
 const accept=async(input:string)=>{try{const result=await finishDriveLogin(input);connectDriveToken(result.access_token,result.expires_in);setCode("");setConnected(true);setWaiting(false);setStatus("已连接 Google Drive，可以立即同步")}catch(error){setStatus(error instanceof Error?error.message:"连接码无效，请重新连接")}};
 useEffect(()=>{let disposed=false;let unlisten:(()=>void)|undefined;void loadSetting<DriveConfig>("sync:drive-config").then(value=>{if(value&&!disposed)setConfig({clientId:value.clientId||"",autoSync:!!value.autoSync})});if("__TAURI_INTERNALS__" in window)void import("@tauri-apps/plugin-deep-link").then(async({onOpenUrl})=>{const stop=await onOpenUrl(urls=>{const url=urls.find(value=>value.startsWith("papery://drive-auth#"));if(url)void accept(url)});if(disposed)stop();else unlisten=stop}).catch(()=>{if(!disposed)setStatus("可通过系统浏览器授权，并粘贴连接码返回")});return()=>{disposed=true;unlisten?.();cancelDriveLogin()}},[]);
 const save=async(next:DriveConfig)=>{setConfig(next);await saveSetting("sync:drive-config",next)};
 const sync=async()=>{setBusy(true);try{const result=await syncGoogleDrive(setStatus);await saveSetting("sync:last-success",Date.now());setStatus(`同步完成：${result.books} 本书，${result.notes} 条笔记`);onUpdated()}catch(error){setStatus(error instanceof Error?error.message:"同步失败，本地数据已保留")}finally{setBusy(false);setConnected(driveConnected())}};
 const login=async()=>{setBusy(true);try{const url=await startDriveLogin(config.clientId);if("__TAURI_INTERNALS__" in window){const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(url)}else{window.open(url,"_blank","noopener,noreferrer")}setWaiting(true);setStatus("请在浏览器选择 Google 账号，授权后点击“返回 Papery”。请保持此面板打开；也可复制连接码返回。")}catch(error){setStatus(error instanceof Error?error.message:"无法打开授权页面")}finally{setBusy(false)}};
 return <><button className="modalScrim" aria-label="关闭同步设置" onClick={busy?undefined:onClose}/><aside className="settingsPanel syncPanel"><div className="panelHeader"><div><small>跨设备书库</small><h2>Google Drive 同步</h2></div><button disabled={busy} onClick={onClose} aria-label="关闭同步设置"><X size={20}/></button></div>
 <p className="syncDescription">只需 Web 应用客户端 ID，无需客户端密钥或自建登录服务。同步书籍、阅读位置、笔记、书签、分类与排版。</p>
 <div className="syncStatus" role="status"><Cloud size={20}/><span>{status}</span></div>
 <label>Google 客户端 ID<input aria-label="OAuth 客户端 ID" value={config.clientId} disabled={busy||waiting} onChange={event=>void save({...config,clientId:event.target.value.trim()})} placeholder="…apps.googleusercontent.com"/></label>
 <button className="uiButton full" disabled={busy||!config.clientId} onClick={login}>{waiting?"重新打开 Google 授权":"使用 Google 连接"}</button>
 {waiting&&<><label>粘贴连接码（浏览器未自动返回时）<textarea aria-label="连接码" value={code} onChange={event=>setCode(event.target.value)} rows={3}/></label><button className="uiButton full" disabled={!code.trim()||busy} onClick={()=>void accept(code)}>完成连接</button><button className="uiButton full" onClick={()=>{cancelDriveLogin();setWaiting(false);setCode("");setStatus("已取消连接")}}>取消本次授权</button></>}
 <button className="uiButton dark full" disabled={busy||!connected} onClick={sync}>{busy?"正在处理…":"立即同步"}</button>
 <label className="syncAuto"><input type="checkbox" checked={config.autoSync} onChange={event=>void save({...config,autoSync:event.target.checked})}/>连接期间在书库自动同步</label>
 <p className="settingsHint">关闭应用或授权过期后需重新连接。离线时保留本地数据；同一记录合并较新的修改，删除也会同步。首次同步建议先导出备份。</p>
 {connected&&<button className="uiButton full" disabled={busy} onClick={()=>{disconnectDrive();setConnected(false);setStatus("已断开连接，本地书库仍保留")}}><LogOut size={16}/>断开连接</button>}
 <BackupSyncGuide/>
 </aside></>;
}
