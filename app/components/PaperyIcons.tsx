import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
// Papery's control drawings use the same gently open corners and page folds as
// the book mark. They are local artwork, independent of a stock icon package.
function icon(name: string, drawing: ReactNode) {
  const Drawing = ({ size = 24, className = "", ...props }: IconProps) => <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" className={`paperyIcon ${className}`} {...props}>{drawing}</svg>;
  Drawing.displayName = name;
  return Drawing;
}
const pages = <><path d="M12 6.3C9.4 4.6 6.4 4.3 3.6 5v13.6c2.8-.7 5.8-.4 8.4 1.2 2.6-1.6 5.6-1.9 8.4-1.2V5c-2.8-.7-5.8-.4-8.4 1.3Z"/><path d="M12 6.3v13.5M6.8 8.1l2 .4m6.4-.4 2-.4"/></>;
const sheet = <><path d="M14.5 3.5H6.8a1.8 1.8 0 0 0-1.8 1.8v13.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V8"/><path d="m14.5 3.5 4.5 4.5h-4.5Z"/></>;
export const BookOpen = icon("BookOpen", pages);
export const BookMarked = icon("BookMarked", <><path d="M5 18.2V5.5A2 2 0 0 1 7 3.5h12v17H7a2 2 0 0 1 0-4h12M9 3.5v6l2-1.3 2 1.3v-6"/></>);
export const BookCheck = icon("BookCheck", <><path d="M4 6c2.6-.7 5.3-.3 8 1.3 2.7-1.6 5.4-2 8-1.3v6M4 6v13c2.6-.7 5.3-.3 8 1.3M12 7.3v13"/><path d="m15 17 2 2 4-4"/></>);
export const Bookmark = icon("Bookmark", <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1Z"/>);
export const Library = icon("Library", <><path d="M4 5v14M8 4v15M12 7v12m3-14 4.5 14M3 21h17"/></>);
export const FileText = icon("FileText", <>{sheet}<path d="M8.5 12h7m-7 3.5h5"/></>);
export const Search = icon("Search", <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.2 15.2 5.3 5.3"/></>);
export const PenLine = icon("PenLine", <><path d="m5 15 10.2-10.2a2 2 0 0 1 2.8 2.8L7.8 17.8l-4 1.2ZM13.8 6.2l2.8 2.8M12 20h8"/></>);
export const Highlighter = icon("Highlighter", <><path d="m9.5 5 3-2 7.5 7.5-2 3-3 2-7.5-7.5ZM7.5 8l7.5 7.5M9 12l-4 4 3 3 4-4M3 21h8"/></>);
export const Underline = icon("Underline", <><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/></>);
export const Trash2 = icon("Trash2", <><path d="M5.5 7h13M9 7V4h6v3M7 10l.7 9.5h8.6L17 10M10 10v6m4-6v6"/></>);
export const Menu = icon("Menu", <path d="M4.5 6.5h15m-15 5.5h11m-11 5.5h15"/>);
export const ListTree = icon("ListTree", <path d="M4 4v13.5h4m-4-10H8m4 0h8m-8 10h8M4 12.5h4m4 0h6"/>);
export const Columns2 = icon("Columns2", <><path d="M4.5 5h6v14h-6ZM13.5 5h6v14h-6Z"/><path d="M7.5 8v8m9-8v8" opacity=".5"/></>);
export const PanelLeftOpen = icon("PanelLeftOpen", <><path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-7M8 4v16"/><path d="m13 8 4 4-4 4"/></>);
export const PanelLeftClose = icon("PanelLeftClose", <><path d="M8 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-7M8 4v16"/><path d="m17 8-4 4 4 4"/></>);
export const ArrowUpRight = icon("ArrowUpRight", <path d="M7 17 17 7M7 7h10v10"/>);
export const ChevronLeft = icon("ChevronLeft", <path d="m14.5 5.5-6 6.5 6 6.5"/>);
export const ChevronRight = icon("ChevronRight", <path d="m9.5 5.5 6 6.5-6 6.5"/>);
export const Plus = icon("Plus", <path d="M12 5v14M5 12h14"/>);
export const Minus = icon("Minus", <path d="M5 12h14"/>);
export const X = icon("X", <path d="m6 6 12 12M18 6 6 18"/>);
export const Check = icon("Check", <path d="m4.5 12 5 5 10-10"/>);
export const MoreHorizontal = icon("MoreHorizontal", <><circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none"/></>);
export const Clock3 = icon("Clock3", <><path d="M12 3.5a8.5 8.5 0 1 1-6 2.5"/><path d="M12 7v5l4 2"/></>);
export const CalendarDays = icon("CalendarDays", <><path d="M6 5H4v15h16V5h-2M8 3v4m8-4v4M8 5h8M4 10h16M8 14h1m6 0h1m-8 3h1m6 0h1"/></>);
export const BarChart3 = icon("BarChart3", <><path d="M4 4v16h16M8 15V9m5 6V5m5 10v-4"/></>);
export const Battery = icon("Battery", <><path d="M3 7h15v10H3ZM21 10v4M6 10v4"/></>);
export const BatteryCharging = icon("BatteryCharging", <><path d="M7 7H3v10h4m7-10h4v10h-4m7-7v4"/><path d="m12 5-4 7h5l-3 7"/></>);
export const Cloud = icon("Cloud", <path d="M7 18H5.5a4 4 0 0 1-.6-8A6.4 6.4 0 0 1 17 8.7a4.7 4.7 0 0 1 1 9.3h-6"/>);
export const LogOut = icon("LogOut", <><path d="M10 4H5v16h5M10 12h10m-4-4 4 4-4 4"/></>);
export const Download = icon("Download", <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>);
export const Upload = icon("Upload", <><path d="M12 15V3m-4 4 4-4 4 4M4 16v4h16v-4"/></>);
export const FolderOpen = icon("FolderOpen", <path d="M3.5 10V5H10l2 3h8.5v3M3.5 11H21l-3 9H5.5Z"/>);
export const AlignJustify = icon("AlignJustify", <path d="M4 5.5h16M4 10h16M4 14.5h16M4 19h16"/>);
export const AppWindow = icon("AppWindow", <><path d="M4 4.5h16v15H4ZM4 9h16M7 7h.1m3 0h.1"/></>);
export const Maximize2 = icon("Maximize2", <path d="M14 4h6v6m0-6-6 6M10 20H4v-6m0 6 6-6"/>);
export const Settings2 = icon("Settings2", <><path d="M4 6.5h3m5 0h8M4 17.5h8m5 0h3"/><circle cx="9.5" cy="6.5" r="2.5"/><circle cx="14.5" cy="17.5" r="2.5"/></>);
export const CircleHelp = icon("CircleHelp", <><path d="M12 3.5a8.5 8.5 0 1 1-6 2.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16.5h.01"/></>);
export const Camera = icon("Camera", <><path d="M4 7h4l1.5-3h5L16 7h4v13H4Z"/><circle cx="12" cy="13" r="3.5"/></>);
export const Keyboard = icon("Keyboard", <><path d="M3.5 6h17v12h-17ZM7 10h.1m4 0h.1m4 0h.1m3 0h.1M7 13h.1m4 0h.1m4 0h.1M8 16h8"/></>);
export const Smartphone = icon("Smartphone", <><path d="M7 3h10v18H7ZM10 5h4M11 18.5h2"/></>);
export const Sparkles = icon("Sparkles", <><path d="m11 4 2.2 5.8L19 12l-5.8 2.2L11 20l-2.2-5.8L3 12l5.8-2.2ZM19 3v4m-2-2h4"/></>);
