"use client";
import { BookOpen, Keyboard, PenLine, Smartphone, X } from "./PaperyIcons";
import { useDialogFocus } from "./use-dialog-focus";

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const dialog = useDialogFocus<HTMLElement>(onClose);
  return <><button className="modalScrim" aria-label="关闭帮助" onClick={onClose}/><aside ref={dialog} className="settingsPanel helpPanel" role="dialog" aria-modal="true" aria-label="阅读操作"><div className="panelHeader"><h2>阅读操作</h2><button aria-label="关闭帮助" onClick={onClose}><X size={20}/></button></div>
    <section><h3><Keyboard size={18}/>翻页与工具栏</h3><p>方向键、PageUp / PageDown、空格或滚轮翻页。点击正文左侧四分之一返回，右侧四分之一前进，中间区域切换工具栏。</p><div className="shortcutRows"><span>书内搜索<kbd>Ctrl F</kbd></span><span>目录与笔记<kbd>T</kbd></span><span>显示或隐藏工具栏<kbd>Esc</kbd></span></div></section>
    <section><h3><PenLine size={18}/>标记与笔记</h3><p>选中文字后可划线或写笔记。点击标注可以编辑、删除；从笔记列表进入，会返回对应文字。</p><p>点击书内脚注或尾注，可直接查看注释；关闭后继续阅读。使用“在书中查看”跳转后，点击“返回正文”回到原来的阅读位置。</p></section>
    <section><h3><Smartphone size={18}/>触屏操作</h3><p>横向滑动翻页；连续阅读模式上下滑动。PDF 支持双指缩放和放大后拖动。Android 阅读时，音量减键下一页、音量加键上一页；弹窗或输入时恢复音量调节。</p></section>
    <section><h3><BookOpen size={18}/>阅读位置</h3><p>EPUB 和 TXT 按内容保存位置，调整排版后仍能继续阅读。PDF 显示实际页码。</p></section>
  </aside></>;
}
