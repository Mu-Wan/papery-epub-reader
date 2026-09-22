"use client";
import { useEffect, useRef, useState } from "react";
import { X, Cloud, LogOut } from "lucide-react";
import { DriveSetupGuide } from "./DriveSetupGuide";
import { loadSetting, saveSetting } from "../lib/local-library";
import { connectDriveToken, disconnectDrive, driveConnected, syncGoogleDrive, type DriveConfig } from "../lib/drive-sync";

export function SyncPanel({onClose,onUpdated}:{onClose:()=>void;onUpdated:()=>void}) {
  const [config,setConfig]=useState<DriveConfig>({clientId:"",authUrl:"",autoSync:false});
  const [connected,setConnected]=useState(driveConnected()),[busy,setBusy]=useState(false),[status,setStatus]=useState("尚未连接 Google Drive"),[token,setToken]=useState("");
  const active=useRef(true);
  useEffect(()=>{active.current=true;void loadSetting<DriveConfig>("sync:drive-config").then(value=>{if(value)setConfig(value)});return()=>{active.current=false}},[]);
  const save=async(next:DriveConfig)=>{setConfig(next);await saveSetting("sync:drive-config",next)};
  const serviceBase=()=>{
    let base:URL;
    try { base=new URL(config.authUrl.trim()); } catch { throw new Error("请填写已部署的登录服务地址，例如 https://sync.example.com；Google 控制台不会生成此地址"); }
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/")throw new Error("请填写登录服务根地址，不要带 /callback、查询参数或账号密码");
    if(base.protocol!=="https:" && !(base.protocol==="http:"&&(base.hostname==="localhost"||base.hostname==="127.0.0.1")))throw new Error("登录服务地址必须使用 HTTPS");
    return base;
  };
  const checkService=async()=>{setBusy(true);try{const base=serviceBase();const response=await fetch(new URL("health",base),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`登录服务返回 ${response.status}`);const result=await response.json();if(result.service!=="papery-auth")throw new Error("此地址不是 Papery 登录服务，请部署交付包附带的服务");if(result.clientId!==config.clientId.trim())throw new Error("客户端 ID 不匹配：请让阅读器与登录服务使用同一个 Google Web 客户端 ID");setStatus("登录服务正常，客户端 ID 匹配，可以使用 Google 连接")}catch(error){setStatus(error instanceof TypeError?"无法连接登录服务，请检查地址、HTTPS 证书及服务是否启动":error instanceof Error?error.message:"服务检查失败")}finally{setBusy(false)}};
  const sync=async()=>{setBusy(true);try{const result=await syncGoogleDrive(setStatus);await saveSetting("sync:last-success",Date.now());setStatus(`同步完成：${result.books} 本书，${result.notes} 条笔记`);onUpdated();}catch(error){setStatus(error instanceof Error?error.message:"同步失败，本地数据已保留")}finally{setBusy(false);setConnected(driveConnected())}};
  const login=async()=>{
    setBusy(true);
    try {
      const base=serviceBase();
      if(!config.clientId.endsWith(".apps.googleusercontent.com"))throw new Error("请先填写 Google OAuth 客户端 ID");
      const response=await fetch(new URL("session",base.href.endsWith("/")?base.href:base.href+"/"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:config.clientId}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error("无法连接登录服务，请核对接入配置");
      const session=await response.json();
      const auth=new URL(session.authorizeUrl);
      if(auth.origin!=="https://accounts.google.com")throw new Error("登录服务返回了无效的 Google 登录地址");
      if("__TAURI_INTERNALS__" in window){const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(auth.href)}else window.open(auth.href,"_blank","noopener,noreferrer");
      setStatus("请在系统浏览器完成 Google 授权，然后返回阅读器");
      for(let attempt=0;attempt<150&&active.current;attempt++){
        await new Promise(resolve=>setTimeout(resolve,2000));
        const result=await fetch(new URL(`session/${encodeURIComponent(session.id)}`,base.href.endsWith("/")?base.href:base.href+"/"),{headers:{Authorization:`Bearer ${session.secret}`},signal:AbortSignal.timeout(15000)});
        if(result.status===202)continue;
        if(!result.ok)throw new Error("登录未完成，请重新连接");
        const authResult=await result.json();
        connectDriveToken(authResult.access_token,authResult.expires_in);setConnected(true);setStatus("已连接 Google Drive，可以开始同步");return;
      }
      if(active.current)throw new Error("登录等待超时，请重新连接");
    }catch(error){setStatus(error instanceof Error?error.message:"Google 登录失败")}finally{if(active.current)setBusy(false)}
  };
  return <><button className="modalScrim" aria-label="关闭同步设置" onClick={busy?undefined:onClose}/><aside className="settingsPanel syncPanel">
    <div className="panelHeader"><div><small>跨设备书库</small><h2>Google Drive 同步</h2></div><button disabled={busy} onClick={onClose} aria-label="关闭同步设置"><X size={20}/></button></div>
    <p className="syncDescription">同步书籍原文件、阅读位置、笔记、书签、分类和每本书的排版。离线时继续阅读，重新连接后合并最新修改。</p>
    <div className="syncStatus" role="status"><Cloud size={20}/><span>{status}</span></div>
    <button className="uiButton dark full" disabled={busy||!connected} onClick={sync}>{busy?"正在处理…":"立即同步"}</button>
    <details open={!connected}><summary>Google 登录接入配置</summary>
      <p>此版本需要自行部署登录服务。Google 控制台只有 ID 和密钥是正常的；服务地址来自下面的部署步骤。客户端密钥只配置在服务器。</p>
      <DriveSetupGuide authUrl={config.authUrl}/>
      <label>OAuth 客户端 ID<input aria-label="OAuth 客户端 ID" value={config.clientId} onChange={event=>void save({...config,clientId:event.target.value})} placeholder="…apps.googleusercontent.com"/></label>
      <label>登录服务地址<input aria-label="登录服务地址" value={config.authUrl} onChange={event=>void save({...config,authUrl:event.target.value})} placeholder="https://sync.example.com/"/></label>
      <button className="uiButton full" disabled={busy||!config.clientId||!config.authUrl} onClick={checkService}>检查登录服务</button>
      <button className="uiButton full" disabled={busy||!config.clientId||!config.authUrl} onClick={login}>使用 Google 连接</button>
      <p>项目附带登录服务和接入说明。尚未配置时可使用“偏好设置 → 数据备份”在设备间迁移。</p>
    </details>
    <details><summary>临时授权接入（用于联调）</summary><p>仅接受具有 drive.appdata 权限的 Google 访问令牌。令牌只留在本次运行的内存中，过期后需重新授权。</p><input type="password" autoComplete="off" aria-label="临时访问令牌" value={token} onChange={event=>setToken(event.target.value)}/><button className="uiButton full" disabled={!token.trim()||busy} onClick={()=>{connectDriveToken(token);setToken("");setConnected(true);setStatus("已设置临时授权，可以验证同步连接")}}>使用临时授权</button></details>
    <label className="syncAuto"><input type="checkbox" checked={config.autoSync} onChange={event=>void save({...config,autoSync:event.target.checked})}/>连接期间在书库自动同步</label>
    <p className="settingsHint">同一条记录保留较新的修改，删除会同步到其他设备。每台设备保留近期恢复快照；授权过期或网络断开时保留本地数据。</p>
    {connected&&<button className="uiButton full" disabled={busy} onClick={()=>{disconnectDrive();setConnected(false);setStatus("已断开连接，本地书库仍保留")}}><LogOut size={16}/>断开连接</button>}
  </aside></>;
}
