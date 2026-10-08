export const BOOK_METADATA_VERSION = 1;

export function cleanAuthor(value: unknown): string {
  if (typeof value !== "string") return "";
  const author = value.replace(/\s+/g, " ").trim();
  return /^(?:unknown(?: author)?|未知(?:作者)?|不详|作者不详|暂无(?:作者)?|n\/?a|none|null|无)$/i.test(author) ? "" : author;
}

export function publicationYear(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const match = String(value).trim().match(/^(?:D:)?([12]\d{3})(?:\D|\d{2}|$)/);
  const year = match ? Number(match[1]) : 0;
  return year >= 1000 && year <= new Date().getFullYear() + 1 ? year : undefined;
}

/** Prefer explicitly credited authors over translators, editors and other creators. */
export function creditedAuthors(creators: { name: string; role?: string }[]) {
  const authors = creators.filter(item => !item.role || /^(?:aut|author)$/i.test(item.role));
  const explicit = authors.filter(item => /^(?:aut|author)$/i.test(item.role || ""));
  return [...new Set((explicit.length ? explicit : authors).map(item => cleanAuthor(item.name)).filter(Boolean))].join("、");
}

/** Read labelled credits in front matter only; never guess from names in prose. */
export function authorFromFrontMatter(text: string): string {
  const lines = text.slice(0, 32000).split(/[\r\n]+/).map(line => line.trim()).filter(Boolean);
  for (const line of lines.slice(0, 240)) {
    const match = line.match(/^(?:作\s*者|著\s*者|原\s*著|Author(?:s)?|Written by|By)\s*[:：]\s*(.{1,100})$/i)
      || line.match(/^(?:作\s*者|著\s*者|原\s*著)\s+(.{1,100})$/)
      || line.match(/^(?:[\[【（(][^\]】）)]{1,12}[\]】）)]\s*)?([\p{Script=Han}·・]{2,24}(?:\s*[、&]\s*[\p{Script=Han}·・]{2,24})*)\s*著$/u);
    if (!match) continue;
    const author = cleanAuthor(match[1].replace(/\s+(?:著|编著)$/, ""));
    if (author && !/[。！？!?<>]|https?:|www\.|版权|出版社|整理|校对|制作|扫描|电子书|译者|翻译|第一章|本书|本文/.test(author)) return author;
  }
  return "";
}

export function authorFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const match = stem.match(/(?:^|[ _—-])作者\s*[:：]\s*(.{1,60})$/)
    || stem.match(/《[^》]+》\s*[—_-]?\s*(.{1,60}?)(?:\s+著)?$/);
  const author = match ? cleanAuthor(match[1]) : "";
  return /精校|校对|排版|版次|版本|扫描|电子版|完整版|修订|整理|下载|全集|PDF|EPUB|TXT|\d{4}/i.test(author) ? "" : author;
}

export function decodeMetadataText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // A bounded prefix can end inside a UTF-8 character; one trailing replacement
  // must not turn an otherwise valid book into a different encoding.
  const broken = (utf8.match(/�/g)?.length || 0) / Math.max(1, utf8.length);
  return broken < .002 ? utf8.replace(/^\uFEFF/, "") : new TextDecoder("gb18030").decode(bytes);
}
