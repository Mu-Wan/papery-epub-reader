"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Bookmark, Highlighter, Trash2, Underline, X } from "lucide-react";
import type { ReaderAnnotation, ReaderLocation, TocItem } from "../lib/reader-types";

export const TocPanel = memo(function TocPanel({
  toc,
  location,
  annotations,
  onClose,
  onGo,
  onDelete,
}: {
  toc: TocItem[];
  location: ReaderLocation;
  annotations: ReaderAnnotation[];
  onClose: () => void;
  onGo: (value: string) => void;
  onDelete: (annotation: ReaderAnnotation) => void;
}) {
  const [tab, setTab] = useState<"toc" | "marks">("toc");
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (tab !== "toc" || !activeRef.current) return;
    const timer = window.setTimeout(() => activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    return () => window.clearTimeout(timer);
  }, [tab, location.chapterIndex]);

  return <>
    <button className="modalScrim" aria-label="关闭目录" onClick={onClose}/>
    <aside className="tocPanel">
      <div className="panelHeader"><div><small>阅读导航</small><h2>目录与标记</h2></div><button aria-label="关闭目录" onClick={onClose}><X size={20}/></button></div>
      <div className="panelTabs">
        <button className={tab === "toc" ? "active" : ""} onClick={() => setTab("toc")}>目录</button>
        <button className={tab === "marks" ? "active" : ""} onClick={() => setTab("marks")}>标记 {annotations.length}</button>
      </div>
      <div className="tocList">
        {tab === "toc" ? toc.map((item, index) => <button
          key={item.id}
          ref={index === location.chapterIndex ? activeRef : undefined}
          className={index === location.chapterIndex ? "active" : ""}
          style={{ paddingLeft: 16 + item.level * 15 }}
          onClick={() => onGo(item.locator)}
        ><span>{item.label}</span>{item.page && <em>第 {item.page} 页</em>}</button>) : annotations.map(item => <div className="tocMarkRow" key={item.id}>
          <button className="tocMarkJump" onClick={() => onGo(item.locator)}>
            <span className="tocMarkIcon">{item.style === "bookmark" ? <Bookmark size={15}/> : item.style === "underline" ? <Underline size={15}/> : <Highlighter size={15}/>}</span>
            <span className="tocMarkText">{item.style === "bookmark" ? item.chapterTitle : item.quote || item.note || "未命名标记"}</span>
            <i>{Math.round(item.progress)}%</i>
          </button>
          <button className="tocMarkDelete" aria-label={`删除${item.style === "bookmark" ? "书签" : "标注"}`} title="删除标记" onClick={() => onDelete(item)}><Trash2 size={15}/></button>
        </div>)}
        {tab === "marks" && annotations.length === 0 && <p className="tocMarksEmpty">还没有标注或书签</p>}
      </div>
    </aside>
  </>;
});
