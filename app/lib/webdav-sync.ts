import { loadSetting, saveSetting, exportLibraryRecords, importLibraryRecords, getDeviceId, validateLibrarySnapshot, stageSyncFile, readStagedSyncFile, discardStagedSyncFiles, clearExpiredSyncFiles } from "./local-library";
import { mergeSnapshots } from "./sync-merge";
import { WebDavClient, type WebDavConfig, type DavFetch } from "./webdav-client";
import { runWebDavSync } from "./webdav-engine";

export const defaultWebDavConfig: WebDavConfig = { url: "", folder: "Papery", username: "", password: "", autoSync: false, remember: false };
let session: WebDavConfig | null = null;
let running: Promise<{ books: number; notes: number; uploadedParts: number }> | null = null;
async function makeClient(config: WebDavConfig) {
  let transport: DavFetch = (url, init) => fetch(url, init);
  if ("__TAURI_INTERNALS__" in window) {
    const native = await import("@tauri-apps/plugin-http");
    transport = (url, init) => native.fetch(url, { ...init, maxRedirections: 0, connectTimeout: 20_000 });
  }
  return new WebDavClient(config, transport);
}
export async function loadWebDavConfig() {
  const stored = await loadSetting<Partial<WebDavConfig>>("sync:webdav-config");
  return { ...defaultWebDavConfig, ...stored, ...session };
}
export async function saveWebDavConfig(config: WebDavConfig) {
  await saveSetting("sync:webdav-config", { ...config, password: config.remember ? config.password : "" });
}
export function webDavConnected() { return session !== null; }
export function restoreWebDavSession(config: WebDavConfig) {
  if(config.remember&&config.password&&config.url&&config.username)session={...config};
  return webDavConnected();
}
export async function connectWebDav(config: WebDavConfig) {
  const client = await makeClient(config); await client.ensureFolders(); await client.list();
  await saveWebDavConfig(config); session = { ...config };
}
export async function disconnectWebDav() {
  session = null; const config = await loadWebDavConfig();
  await saveWebDavConfig({ ...config, password: "", remember: false, autoSync: false });
}
export async function changeWebDavAutoSync(autoSync: boolean) {
  const config = await loadWebDavConfig(); const next = { ...config, autoSync };
  await saveWebDavConfig(next); if (session) session = next;
}
export function syncWebDav(onStatus: (text: string) => void) {
  if (running) return running;
  running = (async () => {
    if (!session) {
      const config = await loadWebDavConfig();
      if (!config.remember || !config.password) throw new Error("请先测试并连接 WebDAV");
      await connectWebDav(config);
    }
    const client = await makeClient(session!);
    await clearExpiredSyncFiles();
    const staged:string[]=[];
    try{const result = await runWebDavSync({ client, deviceId: getDeviceId(), readLocal: ()=>exportLibraryRecords({lazyFiles:true,includeCovers:true}), applyLocal: importLibraryRecords, merge: mergeSnapshots, validate: validateLibrarySnapshot,stage:async blob=>{const id=await stageSyncFile(blob);staged.push(id);return id},readStaged:readStagedSyncFile }, onStatus);
      await saveSetting("sync:webdav-last-success", Date.now()); return result;
    }finally{await discardStagedSyncFiles(staged)}
  })().finally(() => { running = null; });
  return running;
}
