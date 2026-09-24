"use client";

import { useEffect, useRef, useState } from "react";
import { X, Cloud, LogOut } from "lucide-react";
import { loadSetting, saveSetting } from "../lib/local-library";
import { connectDriveToken, disconnectDrive, driveConnected, syncGoogleDrive, type DriveConfig } from "../lib/drive-sync";
import {
  cancelDriveLogin,
  DRIVE_SCOPE,
  finishDriveLogin,
  loadGoogleIdentityServices,
  startDriveLogin,
  type GoogleTokenClient,
  type GoogleTokenResponse,
} from "../lib/drive-auth";
import { BackupSyncGuide } from "./BackupSyncGuide";

export function SyncPanel({ onClose, onUpdated }: { onClose: () => void; onUpdated: () => void }) {
  const nativeApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [config, setConfig] = useState<DriveConfig>({ clientId: "", autoSync: false });
  const [connected, setConnected] = useState(driveConnected());
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [browserReadyClientId, setBrowserReadyClientId] = useState("");
  const [nativeAuth, setNativeAuth] = useState<{ clientId: string; url: string } | null>(null);
  const [status, setStatus] = useState("尚未连接 Google Drive");
  const [code, setCode] = useState("");
  const browserTokenClient = useRef<GoogleTokenClient | null>(null);
  const nativeReturnHandler = useRef<(input: string) => void>(() => undefined);
  const browserResponseHandler = useRef<(response: GoogleTokenResponse) => void>(() => undefined);
  const browserAuthReady = !nativeApp && Boolean(config.clientId) && browserReadyClientId === config.clientId;
  const nativeAuthUrl = nativeAuth?.clientId === config.clientId ? nativeAuth.url : "";

  async function sync() {
    setBusy(true);
    try {
      const result = await syncGoogleDrive(setStatus);
      await saveSetting("sync:last-success", Date.now());
      setStatus(`同步完成：${result.books} 本书，${result.notes} 条笔记`);
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "同步失败，本地数据已保留");
    } finally {
      setBusy(false);
      setConnected(driveConnected());
    }
  }

  async function acceptToken(token: string, expiresIn: number) {
    connectDriveToken(token, expiresIn);
    setCode("");
    setWaiting(false);
    setConnected(true);
    await sync();
  }

  async function acceptNativeReturn(input: string) {
    try {
      const result = await finishDriveLogin(input);
      await acceptToken(result.access_token, result.expires_in);
    } catch (error) {
      setWaiting(false);
      setStatus(error instanceof Error ? error.message : "连接码无效，请重新连接");
    }
  }

  useEffect(() => { nativeReturnHandler.current = acceptNativeReturn; }, [acceptNativeReturn]);

  function acceptBrowserResponse(response: GoogleTokenResponse) {
    if (response.error || !response.access_token) {
      setWaiting(false);
      const detail = response.error_description ? `：${response.error_description}` : "";
      setStatus(response.error === "access_denied" ? "Google 未授予 Drive 权限。请重新连接并允许应用访问。" : `Google 授权没有完成${detail}`);
      return;
    }
    const grantedScopes = response.scope?.split(/\s+/) ?? [];
    if (!grantedScopes.includes(DRIVE_SCOPE)) {
      setWaiting(false);
      setStatus("Google 未授予 Papery 需要的 Drive 应用数据权限，请重新连接并允许访问。");
      return;
    }
    const lifetime = Number(response.expires_in);
    void acceptToken(response.access_token, Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3500);
  }

  useEffect(() => { browserResponseHandler.current = acceptBrowserResponse; }, [acceptBrowserResponse]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void loadSetting<DriveConfig>("sync:drive-config").then(value => {
      if (value && !disposed) setConfig({ clientId: value.clientId || "", autoSync: !!value.autoSync });
    });
    if (nativeApp) {
      void import("@tauri-apps/plugin-deep-link").then(async ({ onOpenUrl }) => {
        const stop = await onOpenUrl(urls => {
          const url = urls.find(value => value.startsWith("papery://drive-auth#"));
          if (url) void nativeReturnHandler.current(url);
        });
        if (disposed) stop();
        else unlisten = stop;
      }).catch(() => {
        if (!disposed) setStatus("未收到浏览器返回。请从 Google 授权完成页复制连接码，再粘贴到此处。");
      });
    }
    return () => {
      disposed = true;
      unlisten?.();
      cancelDriveLogin();
    };
  }, []);

  useEffect(() => {
    if (!nativeApp || !config.clientId) return;
    let active = true;
    void startDriveLogin(config.clientId).then(url => {
      if (active) setNativeAuth({ clientId: config.clientId, url });
    }).catch(error => {
      if (active) setStatus(error instanceof Error ? error.message : "无法准备 Google 授权");
    });
    return () => {
      active = false;
      cancelDriveLogin();
    };
  }, [nativeApp, config.clientId]);

  useEffect(() => {
    if (nativeApp || !config.clientId) {
      browserTokenClient.current = null;
      return;
    }
    let active = true;
    browserTokenClient.current = null;
    void loadGoogleIdentityServices().then(() => {
      if (!active) return;
      const oauth = window.google?.accounts.oauth2;
      if (!oauth) throw new Error("Google 授权服务没有就绪，请重新打开同步设置。");
      browserTokenClient.current = oauth.initTokenClient({
        client_id: config.clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: false,
        callback: response => browserResponseHandler.current(response),
        error_callback: error => {
          setWaiting(false);
          setStatus(error.type === "popup_failed_to_open" ? "浏览器阻止了 Google 授权窗口，请允许弹出窗口后重试。" : "Google 授权窗口未完成，可以重新选择账号。" );
        },
      });
      setBrowserReadyClientId(config.clientId);
    }).catch(error => {
      if (active) setStatus(error instanceof Error ? error.message : "无法加载 Google 授权服务");
    });
    return () => { active = false; };
  }, [nativeApp, config.clientId]);

  const save = async (next: DriveConfig) => {
    if (next.clientId !== config.clientId) {
      setBrowserReadyClientId("");
      setNativeAuth(null);
      browserTokenClient.current = null;
    }
    setConfig(next);
    await saveSetting("sync:drive-config", next);
  };

  const login = () => {
    if (busy || !config.clientId) return;
    if (!nativeApp) {
      const client = browserTokenClient.current;
      if (!client) {
        setStatus("Google 授权服务正在准备，请稍候再试。");
        return;
      }
      setWaiting(true);
      setStatus("正在打开 Google 官方授权窗口…");
      try {
        client.requestAccessToken({ prompt: "select_account" });
      } catch {
        setWaiting(false);
        setStatus("浏览器没有打开 Google 授权窗口，请允许弹出窗口后重试。");
      }
      return;
    }

    if (!nativeAuthUrl) {
      setStatus("正在准备 Google 授权，请稍候再试。");
      return;
    }
    setWaiting(true);
    setStatus("已打开 Google 官方授权页。选择账号并允许访问后，会自动返回 Papery 并开始同步。");
    setBusy(true);
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(nativeAuthUrl)).catch(error => {
      setWaiting(false);
      setStatus(error instanceof Error ? `无法打开系统浏览器：${error.message}` : "无法打开系统浏览器");
    }).finally(() => setBusy(false));
  };

  return <>
    <button className="modalScrim" aria-label="关闭同步设置" onClick={busy ? undefined : onClose}/>
    <aside className="settingsPanel syncPanel">
      <div className="panelHeader"><div><small>跨设备书库</small><h2>Google Drive 同步</h2></div><button disabled={busy} onClick={onClose} aria-label="关闭同步设置"><X size={20}/></button></div>
      <p className="syncDescription">同步完整书库、书籍原文件、阅读位置、笔记、书签、分类、个人资料和阅读统计。授权令牌只在本次运行期间保存在内存中。</p>
      <div className="syncStatus" role="status"><Cloud size={20}/><span>{status}</span></div>
      <label>Google 客户端 ID<input aria-label="OAuth 客户端 ID" value={config.clientId} disabled={busy || waiting} onChange={event => void save({ ...config, clientId: event.target.value.trim() })} placeholder="…apps.googleusercontent.com"/></label>
      <button className="uiButton full" disabled={busy || !config.clientId || (nativeApp ? !nativeAuthUrl : !browserAuthReady)} onClick={login}>
        {waiting ? "重新打开 Google 授权" : "使用 Google 连接"}
      </button>
      {nativeApp && waiting && <>
        <label>若没有自动返回，请粘贴授权完成页中的加密连接码<textarea aria-label="连接码" value={code} onChange={event => setCode(event.target.value)} rows={3}/></label>
        <button className="uiButton full" disabled={!code.trim() || busy} onClick={() => void acceptNativeReturn(code)}>完成连接并同步</button>
        <button className="uiButton full" disabled={busy} onClick={() => { cancelDriveLogin(); setWaiting(false); setCode(""); setStatus("已取消连接"); }}>取消本次授权</button>
      </>}
      <button className="uiButton dark full" disabled={busy || !connected} onClick={() => void sync()}>{busy ? "正在处理…" : "立即同步"}</button>
      <label className="syncAuto"><input type="checkbox" checked={config.autoSync} onChange={event => void save({ ...config, autoSync: event.target.checked })}/>连接期间在书库自动同步</label>
      <p className="settingsHint">同步会合并多台设备的书库；较新的进度和笔记会保留，删除也会同步。请先确认这台设备的数据已完整备份。关闭应用或授权到期后，需要重新授权。</p>
      {connected && <button className="uiButton full" disabled={busy} onClick={() => { disconnectDrive(); setConnected(false); setStatus("已断开连接，本地书库仍保留"); }}><LogOut size={16}/>断开连接</button>}
      <BackupSyncGuide/>
    </aside>
  </>;
}
