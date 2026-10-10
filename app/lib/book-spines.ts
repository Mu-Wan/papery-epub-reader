type SpineBook={id:string;title:string;author?:string;blob?:Blob};
export function spineGap(previous:SpineBook|undefined,book:SpineBook,mobile=false){return !previous?0:(previous.author?.trim()||"未知作者")===(book.author?.trim()||"未知作者")?3:mobile?14:18;}
const bindings=["#c7cfc2","#a84937","#345b78","#e4d4ad","#4f6b5f","#ce916a","#41494d","#c7b7d0","#d7dccf","#95b5c4"];
export function spineMetrics(book:SpineBook,mobile=false){
  let hash=2166136261;for(const character of book.id+book.title)hash=Math.imul(hash^character.charCodeAt(0),16777619)>>>0;
  const height=(mobile?162:180)+(hash>>>8)%(mobile?54:74);
  const width=(mobile?40:26)+hash%17;
  return {width,height,color:bindings[hash%bindings.length],ink:hash%bindings.length===1||hash%bindings.length===2||hash%bindings.length===4||hash%bindings.length===6?"#f3eee1":"#252a2b"};
}
export function spineRows<T extends SpineBook>(books:T[],width:number,mobile=false){
  const rows:T[][]=[];let current:T[]=[],used=0;
  for(const book of books){let size=spineMetrics(book,mobile).width+spineGap(current.at(-1),book,mobile);if(current.length&&used+size>Math.max(80,width)){rows.push(current);current=[];used=0;size=spineMetrics(book,mobile).width;}current.push(book);used+=size;}
  if(current.length)rows.push(current);return rows;
}
