import { loadPdfJs } from "./pdf-loader";
import { BlobReader, BlobWriter, TextWriter, ZipReader } from "@zip.js/zip.js";

export async function readEpubMetadata(blob: Blob) {
  const zip = new ZipReader(new BlobReader(blob));
  try {
    const entries = await zip.getEntries();
    const find = (path: string) => entries.find(entry => entry.filename === decodeURIComponent(path));
    const text = async (path: string) => { const entry = find(path); return entry && !entry.directory ? await entry.getData(new TextWriter()) : ""; };
    const parse = (value: string) => new DOMParser().parseFromString(value, "application/xml");
    const container = parse(await text("META-INF/container.xml"));
    const path = container.querySelector("rootfile")?.getAttribute("full-path");
    if (!path) throw new Error("EPUB 缺少书籍目录");
    const opf = parse(await text(path));
    const resolve = (href: string, base = path) => new URL(href, `https://epub.invalid/${base}`).pathname.slice(1);
    const items = Array.from(opf.querySelectorAll("manifest > item"));
    const coverId = opf.querySelector('meta[name="cover"]')?.getAttribute("content");
    const coverItem = items.find(item => item.getAttribute("id") === coverId || item.getAttribute("properties")?.split(/\s+/).includes("cover-image"));
    let imagePath = coverItem?.getAttribute("href") ? resolve(coverItem.getAttribute("href")!) : "";
    if (!imagePath) {
      const guide = opf.querySelector('reference[type="cover"]')?.getAttribute("href");
      const firstIds = Array.from(opf.querySelectorAll("spine > itemref")).slice(0, 2).map(item => item.getAttribute("idref"));
      const candidates = guide ? [resolve(guide)] : firstIds.map(id => items.find(item => item.getAttribute("id") === id)?.getAttribute("href")).filter((href): href is string => !!href).map(href => resolve(href));
      for (const candidate of candidates) {
        const doc = new DOMParser().parseFromString(await text(candidate.split("#")[0]), "text/html");
        const img = doc.querySelector("img,image");
        const href = img?.getAttribute("src") || img?.getAttribute("href") || img?.getAttribute("xlink:href");
        // Only image-led front matter is a cover, never an arbitrary illustration.
        if (href && (doc.body.textContent?.trim().length || 0) < 120) { imagePath = resolve(href, candidate); break; }
      }
    }
    const entry = imagePath ? find(imagePath) : undefined;
    const mime = items.find(item => resolve(item.getAttribute("href") || "") === imagePath)?.getAttribute("media-type") || "image/jpeg";
    const coverDataUrl = entry && !entry.directory ? await dataUrl(await entry.getData(new BlobWriter(mime))) : null;
    return { title: opf.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim(), author: opf.getElementsByTagNameNS("*", "creator")[0]?.textContent?.trim(), coverDataUrl };
  } finally { await zip.close(); }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Store a portable image, never an expiring EPUB object URL. */
export async function extractBookCover(blob: Blob, format: string): Promise<string | null> {
  if (format === "EPUB") {
    return (await readEpubMetadata(blob)).coverDataUrl;
  }
  if (format === "PDF") {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    try {
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1, 480 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      return canvas.toDataURL("image/jpeg", .85);
    } finally { await pdf.destroy(); }
  }
  return null;
}
