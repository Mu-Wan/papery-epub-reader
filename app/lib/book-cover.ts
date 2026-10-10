import { readBlobBytes } from "./blob-bytes";
import { loadPdfJs, pdfDocumentOptions } from "./pdf-loader";
import { authorFromFilename, authorFromFrontMatter, cleanAuthor, creditedAuthors, decodeMetadataText, publicationYear } from "./book-metadata";

export async function readEpubMetadata(blob: Blob) {
  const { BlobReader, BlobWriter, TextWriter, ZipReader } = await import("@zip.js/zip.js");
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
    const coverDataUrl = entry && !entry.directory ? await (async () => dataUrl(await entry.getData(new BlobWriter(mime))))().catch(() => null) : null;
    const metas = Array.from(opf.getElementsByTagNameNS("*", "meta"));
    let author = creditedAuthors(Array.from(opf.getElementsByTagNameNS("*", "creator")).map(creator => ({
      name: creator.textContent || "", role: creator.getAttributeNS("http://www.idpf.org/2007/opf", "role") || creator.getAttribute("opf:role")
        || metas.find(meta => meta.getAttribute("refines") === `#${creator.id}` && meta.getAttribute("property") === "role")?.textContent?.trim(),
    })));
    if (!author) {
      // Only bounded front matter is scanned; chapter prose is never used to infer a name.
      const ids = Array.from(opf.querySelectorAll("spine > itemref")).slice(0, 5).map(item => item.getAttribute("idref"));
      for (const id of ids) {
        const href = items.find(item => item.getAttribute("id") === id)?.getAttribute("href");
        const front = href ? find(resolve(href).split("#")[0]) : undefined;
        if (!front || front.directory || front.uncompressedSize > 256_000) continue;
        const doc = new DOMParser().parseFromString(await front.getData(new TextWriter()), "text/html");
        author = cleanAuthor(doc.querySelector('meta[name="author"],meta[name="dc.creator"],meta[name="DC.creator"]')?.getAttribute("content"));
        doc.querySelectorAll("script,style").forEach(element => element.remove());
        doc.querySelectorAll("p,div,br,h1,h2,h3,tr,li").forEach(element => element.append("\n"));
        author ||= authorFromFrontMatter(doc.body.textContent || "");
        if (author) break;
      }
    }
    return { title: opf.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim(), author,
      publicationYear: Array.from(opf.getElementsByTagNameNS("*", "date")).filter(element => {
        const event = element.getAttributeNS("http://www.idpf.org/2007/opf", "event") || element.getAttribute("opf:event");
        return !event || event === "publication";
      }).map(element => publicationYear(element.textContent)).find(Boolean), coverDataUrl };
  } finally { await zip.close(); }
}

export async function readBookMetadata(blob: Blob, format: string, filename = ""): Promise<{ title?: string; author: string; publicationYear?: number; totalPages?: number; coverDataUrl?: string | null }> {
  if (format === "EPUB") {
    const metadata = await readEpubMetadata(blob);
    return { ...metadata, author: metadata.author || authorFromFilename(filename) };
  }
  if (format === "TXT") return { author: authorFromFrontMatter(decodeMetadataText(await readBlobBytes(blob.slice(0, 64_000)))) || authorFromFilename(filename) };
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument(pdfDocumentOptions(await readBlobBytes(blob))).promise;
  try {
    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as { Title?: string; Author?: string } | undefined;
    let author = cleanAuthor(info?.Author);
    const creators = metadata?.metadata?.get("dc:creator");
    author ||= creditedAuthors((Array.isArray(creators) ? creators : typeof creators === "string" ? [creators] : []).map((name: string) => ({ name })));
    if (!author) for (let index = 1; index <= Math.min(5, pdf.numPages); index++) {
      const content = await (await pdf.getPage(index)).getTextContent();
      let text = "", previousY: number | undefined;
      for (const item of content.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
        if (!item.str) continue;
        const y = item.transform?.[5];
        if (previousY !== undefined && y !== undefined && Math.abs(y - previousY) > 3) text += "\n";
        text += item.str + (item.hasEOL ? "\n" : " "); previousY = y;
      }
      author = authorFromFrontMatter(text);
      if (author) break;
    }
    return { title: typeof info?.Title === "string" ? info.Title.trim() : undefined, author: author || authorFromFilename(filename), totalPages: pdf.numPages };
  } finally { await pdf.destroy(); }
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
    const pdf = await pdfjs.getDocument(pdfDocumentOptions(await readBlobBytes(blob))).promise;
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
