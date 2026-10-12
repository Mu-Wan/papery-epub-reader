"use client";
import {Plus} from "./PaperyIcons";

export function EmptyLibrary({onImport}:{onImport:()=>void}){
  return <section className="emptyLibrary libraryFirstBook" aria-labelledby="firstBookTitle">
    <div className="firstBookCopy"><h2 id="firstBookTitle">从一本书开始。</h2><p>把喜欢的书放进来，<br/>慢慢读，也记下值得留下的想法。</p><button className="uiButton firstBookImport" onClick={onImport}><Plus size={18}/>选择书籍</button><span className="firstBookHint">可一次导入多本 · 保存在本机</span></div>
    <div className="firstBookScene" aria-hidden="true">
      <div className="firstBookShelf"/>
      <div className="firstBookVolume volumeText"><span>TXT</span><i/><b/></div>
      <div className="firstBookVolume volumePdf"><span>PDF</span><i/><b/></div>
      <div className="firstBookVolume volumeEpub"><span>EPUB</span><i/><svg viewBox="0 0 60 68" fill="none"><path d="M13 13h22l12 12v29H13V13Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M35 13v12h12M22 35h17M22 42h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><b/></div>
    </div>
  </section>;
}
