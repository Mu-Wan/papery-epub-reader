"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "./PaperyIcons";
import { useDialogFocus } from "./use-dialog-focus";

export function PaperColorPicker({value,onChange}:{value:string;onChange:(color:string)=>void}) {
  const [container,setContainer]=useState<Element|null>(null);
  return <><button className="customPaperColor" aria-label="自定义页面颜色" aria-haspopup="dialog" aria-expanded={!!container} onClick={event=>setContainer(event.currentTarget.closest(".appShell")||document.body)}><i className="customPaperSwatch" style={{backgroundColor:value}} aria-hidden="true"/><span>自定义</span><span className="customPaperValue" aria-hidden="true">{value.toUpperCase()}</span><ChevronRight size={14}/></button>{container&&createPortal(<ColorChoices value={value} onClose={()=>setContainer(null)} onChange={onChange}/>,container)}</>;
}
function ColorChoices({value,onChange,onClose}:{value:string;onChange:(color:string)=>void;onClose:()=>void}) {
  const root=useDialogFocus(onClose),[draft,setDraft]=useState(value),valid=/^#[0-9a-f]{6}$/i.test(draft);
  const colors=["#FCFBFA","#F9F8F7","#F2EFEB","#EAE7E2","#EFE6D2","#E7DCC4","#F3E7DC","#E8DFD8","#EAF1E7","#DBE8D8","#E5ECEE","#DDE5EA","#292A2C","#333632","#38352F","#3A3030"];
  return <><button className="choiceScrim" aria-label="关闭自定义颜色" onClick={onClose}/><div ref={root} role="dialog" aria-modal="true" aria-label="自定义页面颜色" className="choiceDialog paperColorDialog"><header><h2>自定义页面颜色</h2><button aria-label="关闭" onClick={onClose}><X size={20}/></button></header><div className="paperColorGrid">{colors.map(color=><button key={color} aria-label={`颜色 ${color}`} aria-pressed={draft.toUpperCase()===color} style={{backgroundColor:color}} onClick={()=>setDraft(color)}/>)}</div><label className="paperHexField"><span>颜色值</span><input aria-label="十六进制颜色值" spellCheck={false} autoComplete="off" maxLength={7} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>{if(!draft.startsWith("#")&&/^[0-9a-f]{6}$/i.test(draft))setDraft(`#${draft}`)}} aria-invalid={!valid}/><i aria-hidden="true" style={{backgroundColor:valid?draft:value}}/></label><button className="uiButton dark full" disabled={!valid} onClick={()=>{onChange(draft);onClose()}}>使用此颜色</button></div></>;
}
