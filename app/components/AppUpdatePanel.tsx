"use client";
import { useState } from "react";
import { version } from "../../package.json";
import { compareVersions, deviceUpdatePlatform, plainReleaseNotes, type UpdatePlatform } from "../lib/app-updates";
import { checkUpdates, useAppUpdates } from "./use-app-updates";
import { Download } from "./PaperyIcons";
import { useUpdateDownload, downloadUpdate, cancelUpdateDownload, installUpdate, updateDownloadBusy } from "./use-update-download";
export function AppUpdatePanel({onBeforeInstall}:{onBeforeInstall?:()=>Promise<void>}){
  const state=useAppUpdates(),[openError,setOpenError]=useState("");
  const transfer=useUpdateDownload(),busy=updateDownloadBusy(transfer),native=typeof window!=="undefined"&&"__TAURI_INTERNALS__" in window;
  const release=state.release,newer=!!release&&compareVersions(release.version,version)>0;
  const platform=typeof navigator!=="undefined"?deviceUpdatePlatform(navigator.userAgent):null;
  const open=async(url:string)=>{setOpenError("");try{if("__TAURI_INTERNALS__" in window){const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(url)}else window.open(url,"_blank","noopener,noreferrer")}catch{setOpenError("无法打开下载，请重试。")}};
  const ready=transfer.phase==="ready"&&transfer.version===release?.version;
  const download=(target:UpdatePlatform)=>release?.downloads[target]&&<button key={target} className="uiButton dark" disabled={busy||state.status==="checking"} onClick={()=>void downloadUpdate(release,target)}><Download size={17}/>{platform?transfer.phase==="error"||transfer.phase==="cancelled"?"重新下载":"下载更新":target==="windows-x64"?"Windows 安装包":"Android 安装包"}</button>;
  const percent=transfer.total?Math.min(transfer.phase==="ready"?100:99,Math.floor(transfer.downloaded/transfer.total*100)):undefined;
  const size=(bytes:number)=>`${(bytes/1024/1024).toFixed(1)} MB`;
  return <section className="appUpdateContent" aria-label="应用更新" aria-busy={state.status==="checking"||busy}>
    <div className="updateVersion"><span>Papery 阅读器</span><strong>{version}</strong><span>当前版本</span></div>
    <div className={`updateStatus ${state.status==="error"?"error":""}`} role={state.status==="error"?"alert":"status"}>
      {state.status==="checking"?"正在检查更新…":state.status==="error"?state.error:state.status==="success"?newer?`发现新版本 ${release!.version}`:"当前版本无需更新":"检查是否有可用更新。"}
      {state.checkedAt&&state.status!=="checking"&&<small>上次成功检查：{new Date(state.checkedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small>}
    </div>
    <div className="updateActions">{newer&&(ready?<>{native&&<button className="uiButton dark" onClick={()=>void installUpdate(onBeforeInstall)}>安装更新</button>}{platform&&<button className="uiButton" onClick={()=>void downloadUpdate(release!,platform)}>重新下载</button>}</>:platform?download(platform):[download("windows-x64"),download("android-arm64")])}{busy?<button className="uiButton" disabled={transfer.phase==="verifying"} onClick={()=>void cancelUpdateDownload()}>取消下载</button>:<button className="uiButton" disabled={state.status==="checking"} onClick={()=>void checkUpdates()}>{state.status==="error"?"重新检查":"检查更新"}</button>}</div>
    {transfer.phase!=="idle"&&<div className="updateTransfer" aria-live="polite"><div className="updateTransferMeta"><span>{transfer.phase==="preparing"?"正在准备下载…":transfer.phase==="downloading"?"正在下载安装包…":transfer.phase==="verifying"?"正在检查安装包…":transfer.phase==="ready"?"安装包已准备好":transfer.phase==="cancelled"?"下载已取消":"下载未完成"}</span>{percent!==undefined&&<strong>{percent}%</strong>}</div>{["downloading","verifying","ready"].includes(transfer.phase)&&<><div className="updateProgress" role="progressbar" aria-label="更新下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:`${percent??20}%`}}/></div><small>{size(transfer.downloaded)}{transfer.total?` / ${size(transfer.total)}`:" 已下载"}</small></>}{transfer.error&&<p role="alert">{transfer.error}</p>}{transfer.installMessage&&<p role="status">{transfer.installMessage}</p>}</div>}
    {openError&&<p role="alert">{openError}</p>}
    {release&&state.status==="success"&&<><div className="updateReleaseHeader"><h3>{newer?"更新内容":"最新公开版本"} <span>{release.version}</span></h3><button onClick={()=>void open(release.page)}>发布页 ↗</button></div><p className="updateNotes">{plainReleaseNotes(release.notes)||"本次更新说明见发布页。"}</p></>}
    <p className="updateHint">{platform==="windows-x64"&&native?"安装时会关闭 Papery，完成后自动重新打开。":"下载完成后点击安装，按系统提示升级。"}书库、笔记与设置会保留。</p>
  </section>;
}
