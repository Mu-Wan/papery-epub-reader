import ePub from "epubjs";
import { saveImportedBook } from "./book-store.js";
import { convertTxtToEpub, decodeTxt } from "./txt-importer.js";

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

async function prepareFile(file) {
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return { data: await file.arrayBuffer(), format: "epub", fallbackTitle: file.name.replace(/\.epub$/i, "") };
  }
  const text = decodeTxt(await file.arrayBuffer());
  const title = file.name.replace(/\.txt$/i, "");
  return { data: await convertTxtToEpub(text, title), format: "txt", fallbackTitle: title };
}

export async function importBook(file) {
  const prepared = await prepareFile(file);
  const book = ePub(prepared.data);
  await book.ready;
  const metadata = await book.loaded.metadata;
  const now = Date.now();
  const record = {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    fileName: file.name,
    title: metadata.title || prepared.fallbackTitle,
    author: metadata.creator || "未知作者",
    cover: await readCover(book),
    format: prepared.format,
    location: "",
    progress: 0,
    status: "unread",
    boxId: null,
    finishedAt: null,
    finishPrompted: false,
    addedAt: now,
    lastRead: 0,
    updatedAt: now,
  };
  book.destroy();
  await saveImportedBook(record, prepared.data);
  return record;
}
