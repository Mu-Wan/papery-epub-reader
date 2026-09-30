const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_RECOVERIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class UploadSessionExpiredError extends Error {
  constructor() {
    super("Google Drive 上传会话已失效");
    this.name = "UploadSessionExpiredError";
  }
}

export type ResumableRequest = (url: string, init?: RequestInit) => Promise<Response>;
export type ShouldRetryUploadError = (error: unknown) => boolean;

function nextAcceptedByte(range: string | null, totalBytes: number, maximum: number) {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) throw new Error("Google Drive 返回了无效的上传进度，本地数据已保留");

  const nextByte = Number(match[1]) + 1;
  if (!Number.isSafeInteger(nextByte) || nextByte > totalBytes || nextByte > maximum) {
    throw new Error("Google Drive 返回的上传进度超出当前文件范围，本地数据已保留");
  }
  return nextByte;
}

type UploadState = { complete: true } | { complete: false; nextByte: number };
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function queryUploadState(
  sessionUrl: string,
  totalBytes: number,
  send: ResumableRequest,
  shouldRetryError: ShouldRetryUploadError,
): Promise<UploadState> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RECOVERIES; attempt++) {
    let response: Response;
    try {
      response = await send(sessionUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes */${totalBytes}` },
      });
    } catch (error) {
      if (!shouldRetryError(error)) throw error;
      lastError = error;
      if (attempt < MAX_UPLOAD_RECOVERIES) await delay(500 * 2 ** attempt);
      continue;
    }

    if (response.ok) return { complete: true };
    if (response.status === 308) {
      return { complete: false, nextByte: nextAcceptedByte(response.headers.get("Range"), totalBytes, totalBytes) };
    }
    if (response.status === 404) throw new UploadSessionExpiredError();
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`无法确认 Google Drive 上传进度（${response.status}），本地数据已保留`);
    }
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw new Error(`无法确认 Google Drive 上传进度（${response.status}），本地数据已保留`);
    }

    lastError = new Error(`无法确认 Google Drive 上传进度（${response.status}）`);
    if (attempt < MAX_UPLOAD_RECOVERIES) await delay(500 * 2 ** attempt);
  }

  throw lastError instanceof Error
    ? new Error(`Google Drive 上传中断，无法确认已上传内容：${lastError.message}`)
    : new Error("Google Drive 上传中断，无法确认已上传内容");
}

/** Resume each upload from the byte offset confirmed by Google's Range header. */
export async function uploadResumableBlob(
  sessionUrl: string,
  blob: Blob,
  send: ResumableRequest,
  shouldRetryError: ShouldRetryUploadError = () => true,
  chunkSize = UPLOAD_CHUNK_BYTES,
) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize % (256 * 1024) !== 0) {
    throw new Error("Google Drive 分块大小必须是 256 KiB 的整数倍");
  }

  let start = 0;
  let recoveriesWithoutProgress = 0;

  while (start < blob.size) {
    const end = Math.min(blob.size, start + chunkSize);
    let response: Response;

    try {
      response = await send(sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Range": `bytes ${start}-${end - 1}/${blob.size}`,
        },
        body: blob.slice(start, end),
      });
    } catch (error) {
      if (!shouldRetryError(error)) throw error;
      const state = await queryUploadState(sessionUrl, blob.size, send, shouldRetryError);
      if (state.complete) return;
      if (state.nextByte > start) {
        start = state.nextByte;
        recoveriesWithoutProgress = 0;
      } else if (++recoveriesWithoutProgress > MAX_UPLOAD_RECOVERIES) {
        throw new Error("Google Drive 上传多次中断，文件尚未完整上传，本地数据已保留");
      }
      await delay(500 * recoveriesWithoutProgress);
      continue;
    }

    if (response.status === 308) {
      const nextByte = nextAcceptedByte(response.headers.get("Range"), blob.size, end);
      if (nextByte > start) {
        start = nextByte;
        recoveriesWithoutProgress = 0;
        continue;
      }
      if (++recoveriesWithoutProgress > MAX_UPLOAD_RECOVERIES) {
        throw new Error("Google Drive 上传没有取得进展，本地数据已保留");
      }
      await delay(500 * recoveriesWithoutProgress);
      continue;
    }

    if (response.ok) return;
    if (response.status === 404) throw new UploadSessionExpiredError();
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Google Drive 上传失败（${response.status}），本地数据已保留`);
    }
    if (!RETRYABLE_STATUS.has(response.status)) {
      throw new Error(`Google Drive 上传失败（${response.status}），本地数据已保留`);
    }

    const state = await queryUploadState(sessionUrl, blob.size, send, shouldRetryError);
    if (state.complete) return;
    if (state.nextByte > start) {
      start = state.nextByte;
      recoveriesWithoutProgress = 0;
    } else if (++recoveriesWithoutProgress > MAX_UPLOAD_RECOVERIES) {
      throw new Error("Google Drive 上传多次失败，文件尚未完整上传，本地数据已保留");
    }
    await delay(500 * recoveriesWithoutProgress);
  }
}
