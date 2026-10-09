import { loadPdfJs } from "./pdf-loader";
import { releaseReaderResources } from "./reader-resources.mjs";

const buffers = new Map<string, { promise: Promise<ArrayBuffer>; bytes: number }>();
// Cache eviction only drops our reference; active readers retain their buffers.
const maxBytes = 32 * 1024 * 1024, maxSources = 2;

export function readReaderSource(source: string, sourceBlob?: Blob): Promise<ArrayBuffer> {
  // Read the persisted bytes directly, independently of WebView blob-URL lifetime.
  if (sourceBlob) return sourceBlob.arrayBuffer().then(buffer => {
    if (!buffer.byteLength) throw new Error("书籍文件为空，请重新导入原文件");
    return buffer;
  });
  const cached = buffers.get(source);
  if (cached) { buffers.delete(source); buffers.set(source, cached); return cached.promise.then(buffer => {
    if (buffer.byteLength) return buffer;
    buffers.delete(source);
    return readReaderSource(source);
  }); }
  const entry = { promise: fetch(source).then(response => {
    if (!response.ok) throw new Error("读取文件失败");
    return response.arrayBuffer();
  }).then(buffer => {
    if (!buffer.byteLength) throw new Error("书籍文件为空，请重新导入原文件");
    return buffer;
  }), bytes: 0 };
  buffers.set(source, entry);
  void entry.promise.then(buffer => {
    if (buffers.get(source) !== entry) return;
    entry.bytes = buffer.byteLength;
    let total = 0;
    for (const item of buffers.values()) total += item.bytes;
    while (total > maxBytes || buffers.size > maxSources) {
      const key = buffers.keys().next().value!;
      total -= buffers.get(key)!.bytes;
      buffers.delete(key);
    }
  }, () => { if (buffers.get(source) === entry) buffers.delete(source); });
  while (buffers.size > maxSources) buffers.delete(buffers.keys().next().value!);
  return entry.promise;
}

export function releaseReaderSource(source: string) { buffers.delete(source); releaseReaderResources(source); URL.revokeObjectURL(source); }
export function warmReaderFormat(format: "TXT" | "EPUB" | "PDF") {
  if (format === "EPUB") void Promise.all([
    import("foliate-js/view.js"), import("foliate-js/epub.js"),
    import("foliate-js/paginator.js"), import("foliate-js/vendor/zip.js"),
  ]).catch(() => {});
  if (format === "PDF") void loadPdfJs().catch(() => {});
}
