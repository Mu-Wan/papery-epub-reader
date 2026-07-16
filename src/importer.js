import ePub from "epubjs";
import { saveBook } from "./db.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function readCover(book) {
  try {
    const url = await book.coverUrl();
    if (!url) return "";
    const response = await fetch(url);
    return blobToDataUrl(await response.blob());
  } catch {
    return "";
  }
}

export async function importEpub(file) {
  const data = await file.arrayBuffer();
  const book = ePub(data);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const cover = await readCover(book);
  const record = {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    fileName: file.name,
    title: metadata.title || file.name.replace(/\.epub$/i, ""),
    author: metadata.creator || "未知作者",
    cover,
    data,
    location: "",
    addedAt: Date.now(),
    lastRead: 0,
  };
  book.destroy();
  await saveBook(record);
  return record;
}
