"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "./PaperyIcons";

export function PdfTools({ zoom, fitMode, onZoom, onFit }: {
  zoom: number; fitMode: "width" | "page" | "custom";
  onZoom: (zoom: number) => void; onFit: (mode: "width" | "page") => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return <div className="pdfToolDock" data-collapsed={collapsed} onClick={event => event.stopPropagation()}>
    <button className="pdfDockToggle" aria-label={collapsed ? "展开 PDF 工具" : "收起 PDF 工具"}
      aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>
      {collapsed ? <ChevronRight size={16}/> : <><ChevronLeft size={14}/><span>收起</span></>}
    </button>
    {!collapsed && <div className="pdfZoomControls" role="toolbar" aria-label="PDF 阅读工具">
      <button onClick={() => onZoom(zoom - .1)} aria-label="缩小 PDF">−</button>
      <button className="zoomValue" onClick={() => onFit("width")} aria-label="恢复适合宽度">{Math.round(zoom * 100)}%</button>
      <button onClick={() => onZoom(zoom + .1)} aria-label="放大 PDF">＋</button><i/>
      <button aria-pressed={fitMode === "width"} className={fitMode === "width" ? "active" : ""} onClick={() => onFit("width")}>适应宽度</button>
      <button aria-pressed={fitMode === "page"} className={fitMode === "page" ? "active" : ""} onClick={() => onFit("page")}>适应页面</button>
    </div>}
  </div>;
}
