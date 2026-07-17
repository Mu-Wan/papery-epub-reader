import assert from "node:assert/strict";
import JSZip from "jszip";
import { convertTxtToEpub, decodeTxt, splitTxt } from "../src/txt-importer.js";

const bomText = "前言\n这是带 BOM 的文本";
const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(bomText)]);
assert.equal(decodeTxt(bomBytes.buffer), bomText);

const gbkBytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
assert.equal(decodeTxt(gbkBytes.buffer), "中文");

const chapters = splitTxt("序章\n开始\n第一章 相遇\n正文一\n第二章 远行\n正文二");
assert.equal(chapters.length, 3);
assert.equal(chapters[1].title, "第一章 相遇");

const fallback = splitTxt(`没有章节标题\n\n${"长段落".repeat(5000)}`);
assert.ok(fallback.length >= 2);

const epub = await convertTxtToEpub("第一章 开始\n正文\n第二章 继续\n正文", "测试书");
const zip = await JSZip.loadAsync(epub);
assert.ok(zip.file("OEBPS/package.opf"));
assert.ok(zip.file("OEBPS/c1.xhtml"));

console.log("TXT 编码、分章与转换测试通过");
