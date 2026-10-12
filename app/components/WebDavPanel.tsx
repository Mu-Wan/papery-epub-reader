"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud } from "./PaperyIcons";
import { ToggleSwitch } from "./ToggleSwitch";
import { changeWebDavAutoSync, connectWebDav, defaultWebDavConfig, disconnectWebDav, loadWebDavConfig, restoreWebDavSession, syncWebDav, webDavConnected } from "../lib/webdav-sync";
import type { WebDavConfig } from "../lib/webdav-client";

export function WebDavPanel({ onUpdated, onBusyChange, onBeforeSync }: { onUpdated: () => void; onBusyChange?: (busy: boolean) => void; onBeforeSync?: () => Promise<void> }) {
  const [config, setConfig] = useState(defaultWebDavConfig), [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(webDavConnected), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("填写服务器信息，测试连接后即可同步"), [failed, setFailed] = useState(false);
  const actionLock = useRef(false);
  useEffect(() => { let active = true; void loadWebDavConfig().then(value => { if (active) { setConfig(value); setReady(true);if(restoreWebDavSession(value)){setConnected(true);setStatus("连接设置已恢复，可以立即同步")} } }).catch(() => { if (active) { setFailed(true); setStatus("连接设置读取失败，请重新打开此面板"); } }); return () => { active = false; }; }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const action = async (operation: () => Promise<void>) => { if (actionLock.current) return; actionLock.current = true; setBusy(true); setFailed(false); try { await operation(); } catch (error) { setFailed(true); setStatus(error instanceof Error ? error.message : "同步失败，本地数据已保留"); } finally { actionLock.current = false; setBusy(false); setConnected(webDavConnected()); } };
  const edit = (field: keyof WebDavConfig, value: string) => setConfig(current => ({ ...current, [field]: value }));
  return <div className="webdavContent" data-connected={connected} aria-busy={busy}>
    <div className="webdavIntro"><h3>把书库放在自己的云端</h3><p>书籍、笔记与阅读进度，随你在设备间流转。</p></div>
    <div className={`syncStatus webdavStatus ${connected ? "connected" : ""} ${busy ? "processing" : ""} ${failed ? "error" : ""}`} role={failed ? "alert" : "status"}><Cloud size={18}/><span>{status}</span></div>
    {!connected ? <form className="webdavConnection" onSubmit={event => { event.preventDefault(); if (ready && config.url.trim() && config.username.trim() && config.password) void action(async () => { setStatus("正在测试连接…"); await connectWebDav(config); setStatus("连接成功，可以立即同步"); }); }}>
      <fieldset disabled={busy || !ready} className="webdavFields">
        <label className="webdavAddress">WebDAV 地址<input type="url" aria-label="WebDAV 地址" autoComplete="url" spellCheck={false} value={config.url} onChange={event => edit("url", event.target.value)} placeholder="https://服务器地址/dav/" required/></label>
        <label>用户名<input aria-label="WebDAV 用户名" autoComplete="username" value={config.username} onChange={event => edit("username", event.target.value)} required/></label>
        <label>密码或应用密码<input type="password" aria-label="WebDAV 密码" autoComplete="current-password" value={config.password} onChange={event => edit("password", event.target.value)} required/></label>
        <label className="webdavFolder">同步文件夹<input aria-label="WebDAV 同步文件夹" value={config.folder} onChange={event => edit("folder", event.target.value)} placeholder="Papery"/><small>在服务器中单独存放 Papery 书库</small></label>
        <div className="webdavOption webdavRemember"><div><span>在此设备记住密码</span><small>下次打开应用时可直接同步</small></div><ToggleSwitch checked={config.remember} disabled={busy || !ready} onChange={remember => setConfig(current => ({ ...current, remember }))} label="在此设备记住密码"/></div>
      </fieldset>
      <button type="submit" className="uiButton dark webdavPrimary" disabled={busy || !ready || !config.url.trim() || !config.username.trim() || !config.password}>{busy ? "正在测试连接…" : "测试并连接"}</button>
    </form> : <>
      <div className="webdavServer"><span>当前书库位置</span><p>{config.url}</p><div><span>{config.folder || "Papery"}</span><span>{config.username}</span></div></div>
      <button className="uiButton dark webdavPrimary" disabled={busy} onClick={() => void action(async () => { await onBeforeSync?.(); const result = await syncWebDav(setStatus); setStatus(`同步完成：${result.books} 本书，${result.notes} 条笔记`); onUpdated(); })}>{busy ? "正在处理…" : "立即同步"}</button>
      <div className="webdavOption"><div><span>在书库自动同步</span><small>停留在书库时同步较新的修改</small></div><ToggleSwitch checked={config.autoSync} disabled={busy} onChange={autoSync => void action(async () => { await changeWebDavAutoSync(autoSync); setConfig(current => ({ ...current, autoSync })); setStatus(autoSync ? "已开启书库自动同步" : "已关闭自动同步"); })} label="在书库自动同步"/></div>
      <button className="webdavDisconnect" disabled={busy} onClick={() => void action(async () => { await disconnectWebDav(); setConfig(current => ({ ...current, password: "", remember: false, autoSync: false })); setStatus("已断开连接，本地书库仍保留"); })}>断开连接 / 修改服务器</button>
    </>}
    <details className="webdavHelp"><summary>连接与同步说明</summary><p>使用服务商提供的完整 WebDAV 地址。部分网盘需要开启 WebDAV 并生成应用密码；建议使用 HTTPS。</p><p>同步包含书籍、封面、进度、笔记、书签、分类、排版与阅读记录。较新的修改与删除会在设备间合并，首次同步前建议导出备份。</p><p>连接信息仅保存在此设备，不进入书库备份或同步。未记住密码时，重启后需重新连接；浏览器版还需服务器允许跨域访问。</p></details>
  </div>;
}
