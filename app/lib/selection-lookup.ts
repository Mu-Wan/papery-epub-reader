export const normalizeLookupText = (text:string) => Array.from(text.replace(/\s+/g," ").trim().slice(0,500),character=>character.length===1&&character.charCodeAt(0)>=0xd800&&character.charCodeAt(0)<=0xdfff?"\ufffd":character).join("");
const ignored=new Set(["的","了","是","在","和","与","而","就","也","都","不","一个","我们","他们","这个","那个"]);
export type DictionaryRecord = [sourceUrl:string,meanings:string[]];
export type LookupEntry = {word:string;sourceUrl?:string;meanings:string[]};
const root="/dictionary/zh-v1";
let indexPromise:Promise<Set<string>>|undefined;
const shardCache=new Map<number,Promise<Record<string,DictionaryRecord>>>();
async function localJson(path:string){const response=await fetch(`${root}/${path}`,{credentials:"omit",redirect:"error"});if(!response.ok)throw new Error("本机词库暂时无法读取");return response.json();}
async function dictionaryIndex(){if(!indexPromise)indexPromise=localJson("index.json").then(words=>new Set<string>(words)).catch(error=>{indexPromise=undefined;throw error});return indexPromise;}
async function shardFor(word:string){const key=word.codePointAt(0)!%128;let promise=shardCache.get(key);if(!promise){promise=localJson(`${key.toString(16).padStart(2,"0")}.json`).catch(error=>{shardCache.delete(key);throw error});shardCache.set(key,promise);if(shardCache.size>12)shardCache.delete(shardCache.keys().next().value!);}return promise;}
/** Dictionary matching also works on older WebViews without Intl.Segmenter. */
export function lookupTerms(text:string,known:ReadonlySet<string>):string[] {
  const query=normalizeLookupText(text),terms:string[]=[];
  for(const run of query.match(/[\p{Script=Han}]+|[\p{L}]+(?:['’-][\p{L}]+)*/gu)||[]){
    if(!/\p{Script=Han}/u.test(run)){terms.push(run);continue;}
    const chars=Array.from(run);
    const boundaries=new Map<number,string>();
    try {for(const segment of new Intl.Segmenter("zh",{granularity:"word"}).segment(run))if(segment.isWordLike)boundaries.set(Array.from(run.slice(0,segment.index)).length,segment.segment);}catch{/* dictionary matching below remains available */}
    for(let i=0;i<chars.length;){let word="";for(let size=Math.min(8,chars.length-i);size>0;size--){const candidate=chars.slice(i,i+size).join("");if(known.has(candidate)){word=candidate;break;}}
      const natural=boundaries.get(i);if(natural&&Array.from(natural).length>Array.from(word).length)word=natural;
      if(word){terms.push(word);i+=Array.from(word).length;}
      else {terms.push(chars[i]);i++;}
    }
  }
  const single=Array.from(query).length===1;
  return [...new Set(terms)].filter(word=>single||!ignored.has(word)).slice(0,32);
}
export async function lookupSelection(text:string):Promise<LookupEntry[]> {
  if(!normalizeLookupText(text))return[];
  const known=await dictionaryIndex(),words=lookupTerms(text,known);
  return Promise.all(words.map(async word=>{if(!known.has(word))return{word,meanings:[]};const record=(await shardFor(word))[word];return {word,sourceUrl:record?.[0],meanings:record?.[1]||[]};}));
}
