/** Downsample before gallery display; only one cover is decoded at a time. */
let queue: Promise<unknown> = Promise.resolve();
export function coverThumbnail(blob: Blob): Promise<string | null> {
  const task = queue.then(async () => {
    if (typeof createImageBitmap !== "function") return null;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob, { resizeWidth: 384, resizeQuality: "medium" });
      const scale = Math.min(1, 512 / bitmap.height), canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d"); if (!context) return null;
      context.fillStyle = "#FCFBFA"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let result = canvas.toDataURL("image/jpeg", .82);
      if(result.length>=70_000)result=canvas.toDataURL("image/jpeg",.6);
      if(result.length>=70_000)result=canvas.toDataURL("image/jpeg",.4);
      canvas.width = 0; canvas.height = 0; return result;
    } catch { return null; } finally { bitmap?.close(); }
  });
  queue = task.catch(() => {}); return task;
}
export async function boundedCoverDataUrl(value: string) {
  if (!value.startsWith("data:image/") || value.length < 80_000) return value;
  const response = await fetch(value);
  return await coverThumbnail(await response.blob()) || value;
}
