import JSZip from "jszip";

const headingPattern = /^(?:第[0-9０-９一二三四五六七八九十百千万零〇两]+[章节卷篇回部集]|序章|序言|前言|楔子|引子|后记|尾声|番外(?:篇)?)(?:\s|$|[：:、.—-])/;

function decode(bytes, encoding, fatal = false) {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return "";
  }
}

export function decodeTxt(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decode(bytes.subarray(3), "utf-8");
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode(bytes.subarray(2), "utf-16le");
  const utf8 = decode(bytes, "utf-8", true);
  return utf8 || decode(bytes, "gb18030") || decode(bytes, "utf-8");
}

function fallbackChunks(text, capacity = 14000) {
  const paragraphs = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > capacity) {
      if (current) chunks.push(current);
      current = "";
      for (let offset = 0; offset < paragraph.length; offset += capacity) chunks.push(paragraph.slice(offset, offset + capacity));
      continue;
    }
    if (current && current.length + paragraph.length > capacity) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n\n" : ""}${paragraph}`;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

export function splitTxt(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headings = lines.reduce((items, line, index) => {
    const value = line.trim();
    if (value.length <= 50 && headingPattern.test(value)) items.push({ index, title: value });
    return items;
  }, []);
  if (headings.length < 2) return fallbackChunks(text).map((body, index) => ({ title: `正文 ${index + 1}`, body }));
  if (headings[0].index > 0) headings.unshift({ index: -1, title: "开篇" });
  return headings.map((heading, index) => ({
    title: heading.title,
    body: lines.slice(heading.index + 1, headings[index + 1]?.index ?? lines.length).join("\n").trim(),
  }));
}

const escapeXml = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
const paragraphs = (body) => body.split(/\n\s*\n|\n/).filter((line) => line.trim()).map((line) => `<p>${escapeXml(line.trim())}</p>`).join("");

function chapterXhtml(chapter, language = "zh-CN") {
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}"><head><meta charset="UTF-8"/><title>${escapeXml(chapter.title)}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${escapeXml(chapter.title)}</h1>${paragraphs(chapter.body)}</body></html>`;
}

export async function convertTxtToEpub(text, title) {
  const chapters = splitTxt(text);
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const manifest = chapters.map((_, index) => `<item id="c${index}" href="c${index}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = chapters.map((_, index) => `<itemref idref="c${index}"/>`).join("");
  zip.file("OEBPS/package.opf", `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${crypto.randomUUID?.() || Date.now()}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>zh-CN</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${manifest}</manifest><spine>${spine}</spine></package>`);
  const nav = chapters.map((chapter, index) => `<li><a href="c${index}.xhtml">${escapeXml(chapter.title)}</a></li>`).join("");
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${nav}</ol></nav></body></html>`);
  zip.file("OEBPS/style.css", "body{font-family:serif}h1{text-align:center;margin:1em 0 2em}p{text-indent:2em;margin:.65em 0}");
  chapters.forEach((chapter, index) => zip.file(`OEBPS/c${index}.xhtml`, chapterXhtml(chapter)));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
