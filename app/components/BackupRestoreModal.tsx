"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function BackupRestoreModal({
  file,
  onClose,
  onMerge,
  onReplace,
}: {
  file: File;
  onClose: () => void;
  onMerge: () => Promise<void>;
  onReplace: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    await action();
    setBusy(false);
  };

  return <>
    <button className="modalScrim backupRestoreScrim" aria-label="关闭备份恢复" disabled={busy} onClick={onClose}/>
    <section className="backupRestoreModal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <div className="panelHeader"><div><small>本地数据备份</small><h2 id="restore-title">选择恢复方式</h2></div><button aria-label="关闭" disabled={busy} onClick={onClose}><X size={20}/></button></div>
      <p>已选择 <strong>{file.name}</strong>。请按需要选择恢复方式。</p>
      <div className="restoreChoice">
        <button disabled={busy} onClick={() => void run(onMerge)}><strong>合并到当前书库</strong><span>恢复备份内容并保留本机独有的书籍和记录。</span></button>
        <button className="replace" disabled={busy} onClick={() => void run(onReplace)}><strong>完整还原此备份</strong><span>用备份完整替换本机书籍、阅读记录、笔记、分类、统计与个人资料。当前 Google 同步设置会保留。</span></button>
      </div>
      <button className="restoreCancel" disabled={busy} onClick={onClose}>取消</button>
    </section>
  </>;
}
