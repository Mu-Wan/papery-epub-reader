import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { JSDOM } from "jsdom";
import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { authorFromFrontMatter, authorFromFilename, creditedAuthors, decodeMetadataText, cleanAuthor, publicationYear } from "../app/lib/book-metadata.ts";
import { bookMatchesSearch, groupLibraryBooks, readingRecency, recentLibraryBooks, titleInitial } from "../app/lib/library-groups.ts";
import { groupCollectionNotes } from "../app/lib/note-groups.ts";
import { indexTimelineNotes } from "../app/lib/notes-timeline.ts";
import { batteryFillWidth, normalizeDevicePower } from "../app/lib/device-power.ts";
import { portableSetting, validateSnapshot } from "../app/lib/sync-merge.ts";

// Exercise production storage and React markup in memory; no application or device is launched.
const require = createRequire(import.meta.url), cache = new Map();
function loadTs(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} }; cache.set(filename, module.exports);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = specifier => {
    if (!specifier.startsWith(".")) return require(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(file => fs.existsSync(file));
    return loadTs(new URL(`file:///${target.replaceAll("\\", "/")}`));
  };
  new Function("require", "exports", "module", compiled)(resolve, module.exports, module);
  cache.set(filename, module.exports); return module.exports;
}
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.DOMParser = new JSDOM("").window.DOMParser;
globalThis.FileReader = class {
  readAsDataURL(blob) { void blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`; this.onload?.(); }).catch(error => { this.error = error; this.onerror?.(); }); }
};
const library = loadTs("../app/lib/local-library.ts");
const base = { progress: 0, author: "未知作者", category: "未分类", type: "TXT", color: "cream", source: "", last: "" };
const books = [
  { ...base, id: "a", title: "《三体》", author: "刘慈欣", publicationYear: 2006, importedAt: new Date(2025, 1, 1).getTime(), lastReadAt: 100 },
  { ...base, id: "b", title: "沿河慢行", author: "林青", publicationYear: 2022, importedAt: new Date(2026, 1, 1).getTime(), currentLocation: "saved", progress: 34 },
  { ...base, id: "c", title: "Beta", author: "刘慈欣", lastReadAt: 300 },
  { ...base, id: "d", title: "1984" },
  { ...base, id: "e", title: "重返故乡" },
];

test("Shelf groups preserve each book exactly once and order missing metadata last", () => {
  for (const groupBy of ["none", "author", "title", "published", "imported"]) {
    for (const sortBy of ["recent", "title", "author", "published", "imported"]) {
      const groups = groupLibraryBooks(books, { groupBy, sortBy }, readingRecency(books, []));
      assert.deepEqual(groups.flatMap(group => group.books.map(book => book.id)).sort(), books.map(book => book.id).sort());
    }
  }
  const authors = groupLibraryBooks(books, { groupBy: "author", sortBy: "title" });
  assert.equal(authors.find(group => group.label === "刘慈欣").books.length, 2); assert.equal(authors.at(-1).label, "未知作者");
  assert.deepEqual(groupLibraryBooks(books, { groupBy: "published", sortBy: "title" }).map(group => group.label), ["2022 年", "2006 年", "年份未记录"]);
  assert.deepEqual(groupLibraryBooks([], { groupBy: "author", sortBy: "recent" }), []);
  assert.equal(titleInitial("《三体》"), "S"); assert.equal(titleInitial("Beta"), "B"); assert.equal(titleInitial("重返故乡"), "C"); assert.equal(titleInitial("1984"), "0–9");
});

test("Recent reading includes a single opened book and legacy progress, without importing unread books into history", () => {
  const recency = readingRecency(books, [{ book_id: "a", started_at: 200 }, { book_id: "deleted", started_at: 999 }]);
  assert.deepEqual(recentLibraryBooks(books, recency).map(book => book.id), ["c", "a", "b"]);
  assert.deepEqual(recentLibraryBooks([books[0]], readingRecency([books[0]], [])).map(book => book.id), ["a"]);
  assert.deepEqual(recentLibraryBooks([books[3]], readingRecency([books[3]], [])), []);
  assert.deepEqual(recentLibraryBooks([books[3]], readingRecency([books[3]], [], "d")).map(book => book.id), ["d"]);
});

test("Library search handles title, author, mixed terms, whitespace, case and full-width Latin input", () => {
  for (const query of ["三体", " 《三体》 ", "三体 刘慈欣", "三 体"]) assert.ok(bookMatchesSearch(books[0], query), query);
  assert.ok(bookMatchesSearch(books[2], "ＢＥＴＡ 刘慈欣"));
  assert.equal(bookMatchesSearch(books[1], "三体"), false);
  assert.equal(bookMatchesSearch(books[1], "   "), true);
});

test("Author extraction respects creator roles and explicit credits, never prose, translators or file-name guesses", () => {
  assert.equal(creditedAuthors([{ name: "译者甲", role: "trl" }, { name: "作者乙", role: "aut" }, { name: "作者丙", role: "aut" }]), "作者乙、作者丙");
  assert.equal(creditedAuthors([{ name: "译者甲", role: "trl" }]), "");
  assert.equal(authorFromFrontMatter("书名\n作者：鲁迅\n第一章\n正文"), "鲁迅");
  assert.equal(authorFromFrontMatter("版权页\n[日] 夏目漱石 著\n译者：王某"), "夏目漱石");
  assert.equal(authorFromFrontMatter("译者：王某\n主人公喜欢鲁迅，说自己是作者。"), "");
  assert.equal(authorFromFilename("《三体》 刘慈欣.epub"), "刘慈欣");
  assert.equal(authorFromFilename("三体-精校版.epub"), "");
  assert.equal(authorFromFilename("《三体》精校版.epub"), "");
  assert.equal(cleanAuthor("UNKNOWN"), ""); assert.equal(cleanAuthor("佚名"), "佚名");
  assert.equal(publicationYear("2022-04-05"), 2022); assert.equal(publicationYear("invalid"), undefined);
  assert.equal(decodeMetadataText(Uint8Array.from([0xd7,0xf7,0xd5,0xdf,0xa3,0xba,0xc2,0xb3,0xd1,0xb8]).buffer), "作者：鲁迅");
  const utf8 = Uint8Array.from(Buffer.from("作者：鲁迅\n", "utf8")); assert.equal(authorFromFrontMatter(decodeMetadataText(utf8.buffer)), "鲁迅");
  const prefix = Uint8Array.from(Buffer.from(`作者：鲁迅\n${"正文".repeat(30000)}`, "utf8")).slice(0, 64000);
  assert.equal(authorFromFrontMatter(decodeMetadataText(prefix.buffer)), "鲁迅");
});

test("Real EPUB containers retain covers, read EPUB 2/3 creator roles and recover labelled copyright-page authors", async () => {
  const { readEpubMetadata } = loadTs("../app/lib/book-cover.ts");
  async function fixture(metadata, front) {
    const zip = new ZipWriter(new BlobWriter("application/epub+zip"));
    await zip.add("META-INF/container.xml", new TextReader('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>'));
    await zip.add("OPS/package.opf", new TextReader(`<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>原创演示</dc:title>${metadata}</metadata><manifest><item id="front" href="front.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="front"/></spine></package>`));
    await zip.add("OPS/front.xhtml", new TextReader(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${front}</body></html>`));
    await zip.add("OPS/cover.png", new Uint8ArrayReader(Uint8Array.from([137,80,78,71,13,10,26,10])));
    return zip.close();
  }
  const epub3 = await readEpubMetadata(await fixture('<dc:creator id="translator">译者甲</dc:creator><meta refines="#translator" property="role">trl</meta><dc:creator id="writer">原作者乙</dc:creator><meta refines="#writer" property="role">aut</meta><dc:date opf:event="modification">2025-01-01</dc:date><dc:date opf:event="publication">2020-01-01</dc:date>', '<p>序言</p>'));
  assert.equal(epub3.author, "原作者乙"); assert.equal(epub3.publicationYear, 2020); assert.equal(epub3.coverDataUrl, "data:image/png;base64,iVBORw0KGgo=");
  const epub2 = await readEpubMetadata(await fixture('<dc:creator opf:role="trl">译者甲</dc:creator><dc:creator opf:role="aut">鲁迅</dc:creator>', '<p>序言</p>'));
  assert.equal(epub2.author, "鲁迅");
  const fallback = await readEpubMetadata(await fixture('<dc:creator>Unknown</dc:creator>', '<h1>版权页</h1><p>作者：<span>林青</span></p><p>译者：王某</p>'));
  assert.equal(fallback.author, "林青"); assert.equal(fallback.title, "原创演示");
});

test("Metadata repair, manual edits, moves and recent-open writes preserve blobs, page locators and imported dates", async () => {
  await library.saveLocalBook({ id: "storage", title: "原书名", author: "未知作者", format: "TXT", category: "未分类", progress: 54, currentLocation: "anchor-54", importedAt: 123, coverDataUrl: "data:cover", blob: new Blob(["内容"]), updatedAt: 1 });
  await library.updateLocalBook("storage", { author: "鲁迅", publicationYear: 1926, metadataVersion: 1 }, true);
  await library.saveBookProgress("storage", 73, "anchor-73");
  await library.updateLocalBook("storage", { title: "手动书名", author: "手动作者", metadataEdited: true });
  await library.updateLocalBook("storage", { author: "旧扫描作者", publicationYear: 1999, coverDataUrl: "other" }, true);
  await library.updateLocalBook("storage", { category: "文学", lastReadAt: 456 });
  const saved = (await library.loadLocalBooks()).find(book => book.id === "storage");
  assert.equal(saved.author, "手动作者"); assert.equal(saved.title, "手动书名"); assert.equal(saved.publicationYear, 1926);
  assert.equal(saved.progress, 73); assert.equal(saved.currentLocation, "anchor-73"); assert.equal(saved.importedAt, 123); assert.equal(saved.lastReadAt, 456);
  assert.equal(saved.coverDataUrl, "data:cover"); assert.equal(await saved.blob.text(), "内容");
  await library.deleteLocalBook("storage"); assert.equal(await library.updateLocalBook("storage", { author: "不能复活" }), null);
});

test("Note grouping keeps original note IDs, locators, dates and groups same-title books separately", () => {
  const notes = indexTimelineNotes([
    { id: "n1", bookId: "a", style: "highlight", quote: "摘录", note: "想法", locator: "original-a", createdAt: 200, updatedAt: 250 },
    { id: "n2", bookId: "c", style: "bookmark", quote: "书签", note: "", locator: "original-c", createdAt: 100, updatedAt: 150 },
  ]);
  for (const by of ["book", "author", "kind"]) {
    const result = groupCollectionNotes(notes, books, by);
    assert.deepEqual(result.flatMap(group => group.notes).map(item => item.note.locator).sort(), ["original-a", "original-c"]);
  }
  assert.equal(groupCollectionNotes(notes, books, "author")[0].notes.length, 2);
  assert.equal(groupCollectionNotes(notes, [books[0], { ...books[2], title: books[0].title }], "book").length, 2);
});

test("Grouping and metadata survive cross-platform snapshots; malformed new fields are rejected", () => {
  const snapshot = { format: "papery-backup", version: 1, exportedAt: "", books: [], annotations: [], sessions: [], categories: [], settings: [{ key: "library-view", value: { groupBy: "author", sortBy: "title" } }, { key: "notes-view", value: { groupBy: "book" } }] };
  assert.ok(portableSetting("library-view")); assert.ok(portableSetting("notes-view")); assert.equal(portableSetting("sync:drive-config"), false);
  assert.doesNotThrow(() => validateSnapshot(snapshot)); snapshot.settings[0].value.groupBy = "bad"; assert.throws(() => validateSnapshot(snapshot), /分组/);
});

test("Battery fill tracks actual percentage and unknown data is not rendered as empty battery", () => {
  assert.equal(batteryFillWidth(0), 0); assert.equal(batteryFillWidth(50), 6.5); assert.equal(batteryFillWidth(100), 13);
  assert.equal(normalizeDevicePower({ percent: 255, charging: false }), null); assert.equal(normalizeDevicePower({ percent: NaN, charging: false }), null);
  assert.deepEqual(normalizeDevicePower({ percent: 97.4, charging: true }), { percent: 97, charging: true });
  const { BatteryLevel } = loadTs("../app/components/BatteryLevel.tsx");
  const html = renderToStaticMarkup(React.createElement(BatteryLevel, { percent: 97, charging: false }));
  assert.match(html, /width="12\.61"/);
  assert.ok(!renderToStaticMarkup(React.createElement(BatteryLevel)).includes('x="4"'));
});

test("Shelf markup presents real search results immediately and keeps the only recent book", () => {
  const { LibraryView } = loadTs("../app/components/LibraryView.tsx");
  const noop = () => {};
  const props = { books: [books[0]], allBooks: books, recentBooks: [books[0]], selectedBook: books[0], loading: false, search: "三体", setSearch: noop, category: "全部", categories: ["未分类"], setCategory: noop, onImport: noop, onRead: noop, onReadIntent: noop, onMenu: noop, bookMenu: null, setBookMenu: noop, onMove: noop, onDelete: noop, onEdit: noop, shelfView: { groupBy: "none", sortBy: "title" }, onShelfView: noop, recency: new Map() };
  const html = renderToStaticMarkup(React.createElement(LibraryView, props));
  assert.match(html, /搜索结果/); assert.ok(!html.includes('class="libraryLead"')); assert.equal((html.match(/class="bookCard"/g) || []).length, 1);
  const home = renderToStaticMarkup(React.createElement(LibraryView, { ...props, search: "" }));
  assert.match(home, /最近阅读/); assert.ok(!home.includes("阅读过的书籍会出现在这里"));
});
