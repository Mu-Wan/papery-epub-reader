import { exportBackup, importBackup } from "./backup.js";
import { updateBook } from "./book-store.js";
import { createBox } from "./box-store.js";
import { importBook } from "./importer.js";

const byId = (id) => document.querySelector(`#${id}`);
let pendingBoxBook = null;
let restoreMode = "merge";

export function openBoxDialog(book, boxes, toast) {
  if (!boxes.length) {
    toast("请先在“书盒”中新建一个书盒");
    return;
  }
  pendingBoxBook = book;
  byId("boxDialogBook").textContent = `《${book.title}》`;
  byId("boxSelect").replaceChildren(...boxes.map((box) => new Option(box.name, box.id)));
  byId("boxDialog").showModal();
}

async function importBooks(event, refresh, toast, state, ensureStorage) {
  const files = [...event.target.files];
  if (files.length) await ensureStorage();
  for (const file of files) {
    try {
      toast(`正在添加《${file.name}》`);
      await importBook(file);
    } catch (error) {
      console.error(error);
      toast(`无法读取 ${file.name}`);
    }
  }
  event.target.value = "";
  if (files.length) {
    state.view = "library";
    state.boxId = null;
  }
  await refresh();
  if (files.length) toast(`已添加 ${files.length} 本书`);
}

async function restoreBackup(event, refresh, toast) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const overwrite = restoreMode === "overwrite";
  if (overwrite && !confirm("覆盖恢复会清空当前书架，再写入备份。确定继续吗？")) return;
  try {
    toast(overwrite ? "正在覆盖恢复…" : "正在合并备份…");
    await importBackup(file, overwrite);
    await refresh();
    toast("备份恢复完成");
  } catch (error) {
    console.error(error);
    toast("无法恢复这份备份");
  }
}

export function setupShelfControls({ state, refresh, render, toast, ensureStorage }) {
  byId("boxBackButton").addEventListener("click", () => {
    state.view = "library";
    state.boxId = null;
    render();
  });
  byId("bookInput").addEventListener("change", (event) => importBooks(event, refresh, toast, state, ensureStorage));
  byId("shelfTabs").addEventListener("click", (event) => {
    const view = event.target.dataset.view;
    if (!view) return;
    state.view = view;
    state.boxId = null;
    render();
  });
  byId("createBoxButton").addEventListener("click", async () => {
    const name = prompt("给书盒取个名字")?.trim();
    if (!name) return;
    await createBox(name);
    await refresh();
  });
  byId("boxDialog").addEventListener("close", async (event) => {
    if (event.target.returnValue !== "confirm" || !pendingBoxBook) return;
    await updateBook(pendingBoxBook.id, { boxId: byId("boxSelect").value });
    pendingBoxBook = null;
    toast("已移入书盒");
    await refresh();
  });
  byId("exportButton").addEventListener("click", async () => {
    toast("正在整理备份…");
    await exportBackup();
    toast("备份已导出");
  });
  byId("importBackupButton").addEventListener("click", () => {
    restoreMode = "merge";
    byId("backupInput").click();
  });
  byId("overwriteBackupButton").addEventListener("click", () => {
    restoreMode = "overwrite";
    byId("backupInput").click();
  });
  byId("backupInput").addEventListener("change", (event) => restoreBackup(event, refresh, toast));
}
