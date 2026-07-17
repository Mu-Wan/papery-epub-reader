import JSZip from "jszip";
import { readSnapshot, restoreSnapshot } from "./backup-store.js";

const BACKUP_VERSION = 1;

function download(blob, fileName) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBackup() {
  const snapshot = await readSnapshot();
  const zip = new JSZip();
  const fileEntries = snapshot.bookFiles.map((file, index) => {
    const path = `files/${index}.bin`;
    zip.file(path, file.data);
    return { bookId: file.bookId, locations: file.locations || "", path };
  });
  const manifest = {
    app: "papery-reader",
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    books: snapshot.books,
    boxes: snapshot.boxes,
    readingDays: snapshot.readingDays,
    files: fileEntries,
  };
  zip.file("manifest.json", JSON.stringify(manifest));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const date = new Date().toISOString().slice(0, 10);
  download(blob, `页间备份-${date}.zip`);
}

export async function importBackup(file, overwrite = false) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("备份清单不存在");
  const manifest = JSON.parse(await manifestFile.async("string"));
  if (manifest.app !== "papery-reader" || manifest.version !== BACKUP_VERSION) throw new Error("备份版本不受支持");
  const bookFiles = [];
  for (const entry of manifest.files || []) {
    const binary = zip.file(entry.path);
    if (!binary) throw new Error(`书籍文件缺失：${entry.bookId}`);
    bookFiles.push({ bookId: entry.bookId, locations: entry.locations || "", data: await binary.async("arraybuffer") });
  }
  await restoreSnapshot({
    books: manifest.books || [],
    boxes: manifest.boxes || [],
    readingDays: manifest.readingDays || [],
    bookFiles,
  }, overwrite);
}
