import { exportLibraryBackup, importLibraryBackup, getDeviceId } from "./local-library";
import { mergeSnapshots, validateSnapshot, type SyncSnapshot } from "./sync-merge";
import { UploadSessionExpiredError, uploadResumableBlob } from "./drive-upload";

const API = "https://www.googleapis.com/drive/v3";
const MAX_SESSION_RESTARTS = 1;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

let running: Promise<{ books: number; notes: number }> | null = null;
export type DriveConfig = { clientId: string; autoSync: boolean };

let accessToken = "";
let expiresAt = 0;

export function connectDriveToken(token: string, seconds = 3500) {
  accessToken = token.trim();
  expiresAt = Date.now() + seconds * 1000;
}

export function disconnectDrive() {
  accessToken = "";
  expiresAt = 0;
}

export function driveConnected() {
  return Boolean(accessToken) && expiresAt > Date.now();
}

class DriveAuthorizationError extends Error {}

async function authorizedFetch(url: string, init: RequestInit = {}) {
  if (!driveConnected()) throw new DriveAuthorizationError("Google 授权尚未连接或已过期，请重新连接");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });

  if (response.status === 401) {
    disconnectDrive();
    throw new DriveAuthorizationError("Google 授权已过期，请重新连接");
  }

  return response;
}

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(url: string, init: RequestInit = {}, retries = 0): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const safeToRetry = method === "GET" || method === "HEAD" || method === "DELETE";
  let response: Response;

  try {
    response = await authorizedFetch(url, init);
  } catch (error) {
    if (error instanceof DriveAuthorizationError || !safeToRetry || retries >= 3) throw error;
    await delay(500 * 2 ** retries);
    return request(url, init, retries + 1);
  }

  if (RETRYABLE_STATUS.has(response.status) && safeToRetry && retries < 3) {
    await delay(500 * 2 ** retries);
    return request(url, init, retries + 1);
  }

  if (!response.ok && response.status !== 308) {
    throw new Error(`Google Drive 请求失败（${response.status}），本地数据已保留`);
  }

  return response;
}

type DriveFile = { id: string; name: string; modifiedTime?: string };

async function listSnapshots(): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "trashed = false and name contains 'papery-sync-v1-'",
      fields: "nextPageToken,files(id,name,modifiedTime)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const result = await (await request(`${API}/files?${params}`)).json() as {
      files?: DriveFile[];
      nextPageToken?: string;
    } | null;
    if (!result || typeof result !== "object" || (result.files !== undefined && !Array.isArray(result.files))) {
      throw new Error("Google Drive 返回了无效的文件列表，本地数据已保留");
    }
    files.push(...(result.files ?? []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);

  return files;
}

async function createUploadSession(blob: Blob, name: string) {
  const response = await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "application/json",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify({ name, parents: ["appDataFolder"], mimeType: "application/json" }),
  });
  const location = response.headers.get("Location");
  if (!location) throw new Error("无法建立 Google Drive 上传连接");

  const url = new URL(location);
  if (url.origin !== "https://www.googleapis.com" || url.pathname !== "/upload/drive/v3/files") {
    throw new Error("Google Drive 返回了无效的上传地址");
  }
  return url.toString();
}

async function uploadSnapshot(snapshot: SyncSnapshot, name: string) {
  const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });

  for (let attempt = 0; attempt <= MAX_SESSION_RESTARTS; attempt++) {
    const sessionUrl = await createUploadSession(blob, name);
    try {
      await uploadResumableBlob(
        sessionUrl,
        blob,
        authorizedFetch,
        error => !(error instanceof DriveAuthorizationError),
      );
      return;
    } catch (error) {
      if (!(error instanceof UploadSessionExpiredError) || attempt === MAX_SESSION_RESTARTS) throw error;
    }
  }
}

export function syncGoogleDrive(onStatus: (text: string) => void) {
  if (running) return running;

  running = (async () => {
    onStatus("正在读取云端书库…");
    const files = await listSnapshots();

    // Immutable per-device snapshots avoid overwriting another device's upload.
    const latest = new Map<string, { file: DriveFile; timestamp: number }>();
    for (const file of files) {
      const match = /^papery-sync-v1-(.+)-(\d+)\.json$/.exec(file.name);
      if (!match || !file.id) continue;
      const timestamp = Number(match[2]);
      const previous = latest.get(match[1]);
      if (!previous || timestamp > previous.timestamp) latest.set(match[1], { file, timestamp });
    }

    const snapshots: SyncSnapshot[] = [];
    for (const { file } of latest.values()) {
      const value = await (await request(`${API}/files/${encodeURIComponent(file.id)}?alt=media`)).json();
      validateSnapshot(value);
      snapshots.push(value);
    }

    const local = JSON.parse(await (await exportLibraryBackup()).text());
    validateSnapshot(local);
    snapshots.push(local);

    const merged = mergeSnapshots(snapshots);
    onStatus(`正在同步 ${merged.books.length} 本书和 ${merged.annotations.length} 条笔记…`);

    const prefix = `papery-sync-v1-${getDeviceId()}-`;
    await uploadSnapshot(merged, `${prefix}${Date.now()}.json`);

    // Re-read after network I/O so edits made while uploading remain on this device.
    const fresh = JSON.parse(await (await exportLibraryBackup()).text());
    validateSnapshot(fresh);
    const final = mergeSnapshots([merged, fresh]);
    await importLibraryBackup(new File([JSON.stringify(final)], "sync.json", { type: "application/json" }));

    // Keep two older recovery points in addition to the snapshot uploaded above.
    const old = files
      .filter(file => file.name.startsWith(prefix))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(2);
    for (const file of old) {
      await request(`${API}/files/${encodeURIComponent(file.id)}`, { method: "DELETE" }).catch(() => undefined);
    }

    return { books: final.books.length, notes: final.annotations.length };
  })().finally(() => {
    running = null;
  });

  return running;
}
