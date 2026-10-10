"use client";
import {useEffect,useState} from "react";
import {lookupSelection,type LookupEntry} from "../lib/selection-lookup";
export function SelectionLookup({quote}:{quote:string}) {
  const [result,setResult]=useState<{quote:string;entries:LookupEntry[];error?:boolean}|null>(null),[retry,setRetry]=useState(0);
  useEffect(()=>{let cancelled=false;lookupSelection(quote).then(entries=>{if(!cancelled)setResult({quote,entries})}).catch(()=>{if(!cancelled)setResult({quote,entries:[],error:true})});return()=>{cancelled=true}},[quote,retry]);
  const current=result?.quote===quote?result:null,found=current?.entries.filter(entry=>entry.meanings.length)||[],missing=current?.entries.filter(entry=>!entry.meanings.length)||[];
  return <div className="selectionLookup" aria-label="离线词语释义">
    {!current?<p className="lookupStatus" role="status">正在读取本机词库…</p>:current.error?<div role="alert"><p>本机词库暂时无法读取。</p><button className="uiButton" onClick={()=>setRetry(value=>value+1)}>重试</button></div>:<>
      <dl className="lookupDefinitions">{found.map(entry=><div key={entry.word}><dt>{entry.word}</dt><dd>{entry.meanings.map((meaning,index)=><p key={index}>{meaning}</p>)}<span className="lookupSource" title={entry.sourceUrl}>维基词典 · {entry.word}</span></dd></div>)}</dl>
      {!found.length&&<p className="lookupStatus">本机词库暂未收录这段文字中的词语。</p>}
      {!!missing.length&&<p className="lookupMissing">未收录：{missing.map(entry=>entry.word).join("、")}</p>}
    </>}
    <details className="lookupAttribution"><summary>离线简体中文词库</summary><p>维基词典贡献者 · Kaikki / Wiktextract<br/>CC BY-SA 4.0 · 2026-10-01 快照<br/>词条及释义统一为简体中文，删减例句、引文、读音和媒体，不收录繁体查询词形。仅在本机分词、读取词条。专有名词及专业词汇可能未收录。</p><p>来源：zh.wiktionary.org<br/>提取：kaikki.org/zhwiktionary<br/>授权：creativecommons.org/licenses/by-sa/4.0</p></details>
  </div>;
}
