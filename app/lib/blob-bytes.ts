/** FileReader remains available in Android WebViews with unreliable Blob.arrayBuffer. */
export async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  let failure: unknown;
  try {
    if (typeof blob.arrayBuffer === "function") {
      const bytes = await blob.arrayBuffer();
      if (bytes.byteLength && bytes.byteLength === blob.size) return bytes;
    }
  } catch (reason) { failure = reason; }
  if (typeof FileReader !== "undefined" && blob.size > 0) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const bytes = reader.result;
        if (bytes instanceof ArrayBuffer && bytes.byteLength === blob.size) resolve(bytes);
        else reject(new Error("文件内容不完整，请重新选择原文件"));
      };
      reader.onerror = () => reject(reader.error || new Error("无法读取文件，请重新选择原文件"));
      reader.onabort = () => reject(new Error("文件读取已中断，请重新选择原文件"));
      reader.readAsArrayBuffer(blob);
    });
  }
  throw failure instanceof Error ? failure : new Error("书籍文件为空或内容不完整，请重新导入原文件");
}
