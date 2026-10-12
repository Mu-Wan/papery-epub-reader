export type TxtChapterRule={name:string;mode:"auto"|"simple"|"regex";chapterPattern:string;volumePattern?:string};
export type TxtChapterEntry={title:string;offset:number;index:number;level?:number};
export const TXT_DEFAULT_RULE_KEY="txt-chapter-default";
export const automaticTxtRule:TxtChapterRule={name:"自动识别",mode:"auto",chapterPattern:""};
export function matchTxtChapters(text:string,rule:TxtChapterRule,signal?:AbortSignal):Promise<TxtChapterEntry[]>{
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new Error("已取消"));return;}
  if(text.length>16000000){reject(new Error("文本过大，请使用自动识别分章"));return;}
  const worker=new Worker(new URL("/vendor/txt-chapters-worker.js",window.location.href));
  const finish=(error?:string,chapters?:TxtChapterEntry[])=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);worker.terminate();if(error)reject(new Error(error));else resolve(chapters||[])};
  const abort=()=>finish("已取消");
  const timer=setTimeout(()=>finish("规则匹配耗时过长，请简化正则表达式"),2500);
  worker.onmessage=event=>{const result=event.data;if(result.error)finish(result.error);else finish(undefined,result.chapters)};
  worker.onerror=()=>finish("分章规则无法加载，请重新打开后重试");
  signal?.addEventListener("abort",abort,{once:true});worker.postMessage({text,rule});
 });
}
export function decodeTxtBytes(buffer:ArrayBuffer):string{
 const bytes=new Uint8Array(buffer);
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder("utf-16le").decode(bytes.subarray(2));
 if(bytes[0]===254&&bytes[1]===255)return new TextDecoder("utf-16be").decode(bytes.subarray(2));
 const text=new TextDecoder().decode(bytes);if((text.match(/�/g)?.length||0)/Math.max(1,text.length)<.002)return text.replace(/^\uFEFF/,"");
 try{return new TextDecoder("gb18030").decode(bytes)}catch{return text}
}
