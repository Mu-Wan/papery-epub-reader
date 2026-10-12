"use client";
import { AppUpdatePanel } from "./AppUpdatePanel";
import { useDialogFocus } from "./use-dialog-focus";
import { X } from "./PaperyIcons";
export function AppUpdateDialog({onClose,onBeforeInstall}:{onClose:()=>void;onBeforeInstall?:()=>Promise<void>}){
  const dialog=useDialogFocus<HTMLDivElement>(onClose);
  return <><button className="modalScrim" aria-label="关闭应用更新" onClick={onClose}/><div ref={dialog} className="profilePanel updateDialog framedDialog" role="dialog" aria-modal="true" aria-label="应用更新"><div className="panelHeader"><h2>应用更新</h2><button onClick={onClose} aria-label="关闭应用更新"><X size={20}/></button></div><div className="dialogScroll" tabIndex={0} aria-label="更新内容"><AppUpdatePanel onBeforeInstall={onBeforeInstall}/></div></div></>;
}
