"use client";
import { useState } from "react";
import type { LibraryBook } from "./LibraryView";
import { X } from "./PaperyIcons";
import { useDialogFocus } from "./use-dialog-focus";
import { readBookMetadata } from "../lib/book-cover";
import { cleanAuthor } from "../lib/book-metadata";

export function BookMetadataDialog({ book, onSave, onClose }: {
  book: LibraryBook; onSave: (values: { title: string; author: string; publicationYear?: number }) => Promise<void>; onClose: () => void;
}) {
  const root = useDialogFocus<HTMLFormElement>(onClose), [title, setTitle] = useState(book.title), [author, setAuthor] = useState(cleanAuthor(book.author));
  const [year, setYear] = useState(book.publicationYear ? String(book.publicationYear) : ""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const recognize = async () => {
    if (!book.blob || busy) return;
    setBusy(true); setMessage("");
    try {
      const metadata = await readBookMetadata(book.blob, book.type, book.fileName);
      if (metadata.author) setAuthor(metadata.author);
      if (metadata.publicationYear) setYear(String(metadata.publicationYear));
      setMessage(metadata.author ? "已识别，请核对后保存。" : "文件中未找到明确署名，请手动填写作者。");
    } catch { setMessage("未能读取书籍信息，可手动填写后保存。"); }
    finally { setBusy(false); }
  };
  return <><button className="modalScrim" aria-label="关闭书籍信息" onClick={onClose}/><form ref={root} className="smallModal bookMetadataDialog" role="dialog" aria-modal="true" aria-label="编辑书籍信息" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const publicationYear = year.trim() ? Number(year) : undefined;
    if (!title.trim()) { setMessage("请填写书名。"); return; }
    if (publicationYear !== undefined && (!Number.isInteger(publicationYear) || publicationYear < 1000 || publicationYear > new Date().getFullYear() + 1)) { setMessage("请填写有效的四位出版年份，未知时留空。"); return; }
    setBusy(true); setMessage("");
    try { await onSave({ title: title.trim(), author: author.trim() || "未知作者", publicationYear }); onClose(); }
    catch { setMessage("保存失败，请重试。"); setBusy(false); }
  }}>
    <header><h2>书籍信息</h2><button type="button" aria-label="关闭书籍信息" onClick={onClose}><X size={20}/></button></header>
    <label>书名<input value={title} onChange={event => setTitle(event.target.value)} maxLength={300} disabled={busy}/></label>
    <label>作者<input value={author} onChange={event => setAuthor(event.target.value)} maxLength={150} placeholder="作者未记录" disabled={busy}/></label>
    <label>出版年份<input value={year} onChange={event => setYear(event.target.value)} inputMode="numeric" maxLength={4} placeholder="未知时留空" disabled={busy}/></label>
    <p role="status">{message}</p><footer><button className="uiButton" type="button" onClick={recognize} disabled={busy || !book.blob}>{busy ? "正在处理…" : "从文件识别"}</button><button className="uiButton primary" disabled={busy} type="submit">保存</button></footer>
  </form></>;
}
