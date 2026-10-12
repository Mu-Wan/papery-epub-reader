"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { X,ChevronRight } from "./PaperyIcons";
import { Checkbox } from "./Checkbox";
import { readBlobBytes } from "../lib/blob-bytes";
import { defaultSimpleOptions } from "../lib/txt-chapter-rules.mjs";
import { automaticTxtRule,decodeTxtBytes,matchTxtChapters,type TxtChapterRule,type TxtChapterEntry,type TxtSimpleOptions } from "../lib/txt-chapters";

const formats:[keyof Omit<TxtSimpleOptions,"maxTitleLength">,string,string][]=[
 ["chinese","中文章节","第一章 · 第壹佰回 · 第 50 节"],
 ["numeric","数字标题","001、起点 · 一、归途 · 1.2 小节"],
 ["english","英文章节","Chapter 12 · Chapter IV · Chapter One"],
 ["special","序章与番外","楔子 · 前言 · 番外 · 终章 · 附录"],
 ["volumes","分卷与分部","第一卷 · 卷二 · 上卷 · Part II"],
];
const initialRegex="^第[零〇一二三四五六七八九十百千万两0-9]+[章回节].*$";
export function TxtChapterRuleDialog({blob,value,onSave,onClose}:{blob?:Blob;value?:TxtChapterRule;onSave:(rule:TxtChapterRule)=>Promise<void>;onClose:()=>void}){
 const [mode,setMode]=useState<"simple"|"regex">(value?.mode==="regex"?"regex":"simple");
 const [options,setOptions]=useState<TxtSimpleOptions>({...defaultSimpleOptions,...value?.simple});
 const [simpleChapter,setSimpleChapter]=useState(value?.mode==="simple"?value.chapterPattern:"");
 const [simpleVolume,setSimpleVolume]=useState(value?.mode==="simple"?value.volumePattern||"":"");
 const [regexChapter,setRegexChapter]=useState(value?.mode==="regex"?value.chapterPattern:initialRegex);
 const [regexVolume,setRegexVolume]=useState(value?.mode==="regex"?value.volumePattern||"":"");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[example,setExample]=useState("第一章 春风拂面"),[sampleResult,setSampleResult]=useState<string|null>(null),[preview,setPreview]=useState<TxtChapterEntry[]|null>(null);
 const controller=useRef<AbortController|null>(null),text=useRef<Promise<string>|null>(null),panelId=useId();
 const dialog=useDialogFocus<HTMLDivElement>(()=>{if(!busy)onClose()});
 useEffect(()=>()=>controller.current?.abort(),[]);
 const clear=()=>{setError("");setPreview(null);setSampleResult(null)};
 const changeMode=(next:"simple"|"regex")=>{setMode(next);clear()};
 const rule=():TxtChapterRule=>mode==="simple"?{name:"简易分章",mode,chapterPattern:simpleChapter.trim(),volumePattern:simpleVolume.trim(),simple:options}:{name:"正则分章",mode,chapterPattern:regexChapter.trim(),volumePattern:regexVolume.trim()};
 const getText=()=>text.current??=(readBlobBytes(blob!).then(buffer=>decodeTxtBytes(buffer).replace(/\r\n?/g,"\n").replace(/\u0000/g,"")));
 const run=async(save:boolean,sample=false)=>{
  if(busy)return;setBusy(true);setError("");controller.current=new AbortController();
  try{
   const next=rule();if(mode==="simple"&&!formats.some(([key])=>options[key])&&!simpleChapter.trim()&&!simpleVolume.trim())throw new Error("请至少选择一种标题格式，或填写补充匹配。");
   const body=sample||!blob?example:await getText(),chapters=await matchTxtChapters(body,next,controller.current.signal);
   if(sample)setSampleResult(chapters.length?"匹配成功":"未匹配，请调整格式或示例");
   else{setPreview(chapters);if(save){if(blob&&!chapters.length)throw new Error("本书没有匹配到章节，请先调整设置并预览。");await onSave(next)}}
  }catch(error){setError(error instanceof Error?error.message:"规则测试失败")}finally{setBusy(false)}
 };
 const reset=async()=>{setBusy(true);setError("");try{await onSave(automaticTxtRule)}catch(error){setError(error instanceof Error?error.message:"保存失败");setBusy(false)}};
 return <>
  <button className="modalScrim" aria-label="关闭 TXT 分章规则" onClick={busy?undefined:onClose}/>
  <div ref={dialog} className="profilePanel chapterRuleDialog framedDialog" role="dialog" aria-modal="true" aria-label="TXT 分章规则" aria-busy={busy}>
   <div className="panelHeader"><h2>TXT 分章</h2><button aria-label="关闭 TXT 分章规则" disabled={busy} onClick={onClose}><X size={20}/></button></div>
   <div className="dialogScroll chapterRuleFields">
    <div className="chapterMode" role="tablist" aria-label="分章方式" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?"simple":e.key==="End"?"regex":mode==="simple"?"regex":"simple";changeMode(next);e.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus()}}>
     {(["simple","regex"] as const).map(next=><button key={next} data-mode={next} role="tab" aria-selected={mode===next} aria-controls={panelId} tabIndex={mode===next?0:-1} disabled={busy} onClick={()=>changeMode(next)}>{next==="simple"?"简单":"正则"}</button>)}
    </div>
    <div id={panelId} role="tabpanel" aria-label={mode==="simple"?"简单分章":"正则分章"} className="chapterModeContent">
     {mode==="simple"?<>
      <fieldset className="chapterFormats" disabled={busy}><legend>识别这些标题</legend>{formats.map(([key,label,hint])=><Checkbox key={key} className="chapterFormat" checked={options[key]} label={label} description={hint} disabled={busy} onChange={checked=>{setOptions(current=>({...current,[key]:checked}));clear()}}/>)}</fieldset>
      <details className="chapterExtras"><summary><ChevronRight size={15}/><span>补充匹配</span></summary><div className="chapterExtraFields"><label>章节格式<input className="chapterTextField" aria-label="章节补充匹配" value={simpleChapter} disabled={busy} maxLength={2000} placeholder="例如：故事*" onChange={e=>{setSimpleChapter(e.target.value);clear()}}/></label><label>分卷格式<input className="chapterTextField" aria-label="分卷补充匹配" value={simpleVolume} disabled={busy} maxLength={2000} placeholder="例如：第*部*" onChange={e=>{setSimpleVolume(e.target.value);clear()}}/></label></div><p>* 匹配任意文字，? 匹配一个字符。补充格式与上方选择同时生效。</p></details>
     </>:<>
      <label>章节正则<textarea className="chapterTextField" aria-label="章节匹配规则" rows={4} value={regexChapter} disabled={busy} maxLength={2000} spellCheck={false} onChange={e=>{setRegexChapter(e.target.value);clear()}}/></label>
      <label><span>分卷正则 <span className="chapterOptional">可选</span></span><textarea className="chapterTextField" aria-label="分卷匹配规则" rows={2} value={regexVolume} disabled={busy} maxLength={2000} spellCheck={false} placeholder="例如：^第[0-9]+卷.*$" onChange={e=>{setRegexVolume(e.target.value);clear()}}/></label>
      <p className="chapterFieldHint">逐行匹配标题；例如 ^Chapter\s+\d+.*$。</p>
     </>}
    </div>
    <div className="chapterSample"><label>试一个章节名<input className="chapterTextField" aria-label="示例章节名" value={example} disabled={busy} maxLength={500} onChange={e=>{setExample(e.target.value);setSampleResult(null)}}/></label><button className="chapterTextAction" disabled={busy} onClick={()=>void run(false,true)}>测试示例</button></div>
    {sampleResult&&<p className="chapterSampleResult" role="status">{sampleResult}</p>}
    {blob&&<button className="chapterPreviewAction" disabled={busy} onClick={()=>void run(false)}>预览本书目录</button>}
    {preview&&<div className="chapterPreview"><p role="status">识别到 {preview.length} 个章节 / 分卷</p><ol>{preview.slice(0,20).map(entry=><li key={entry.offset} style={{paddingLeft:entry.level?16:0}}>{entry.title}</li>)}</ol>{preview.length>20&&<small>显示前 20 条</small>}</div>}
    {error&&<p className="ruleError" role="alert">{error}</p>}
   </div>
   <div className="chapterFooter"><button className="chapterReset" disabled={busy} onClick={()=>void reset()}>恢复自动识别</button><button className="uiButton dark" disabled={busy||mode==="regex"&&!regexChapter.trim()} onClick={()=>void run(true)}>{busy?"正在处理…":"保存设置"}</button></div>
  </div>
 </>;
}
