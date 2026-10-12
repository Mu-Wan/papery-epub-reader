/** Auxiliary progress fractions and quote context do not change a bookmark's anchor. */
export function sameReadingAnchor(left:string,right:string):boolean{
 if(!left||!right)return false;if(left===right)return true;
 try{const a=JSON.parse(left),b=JSON.parse(right);if(a.type!==b.type)return false;
  if(a.type==="epub")return typeof a.cfi==="string"&&a.cfi===b.cfi;
  if(a.type==="txt")return a.completed===true&&b.completed===true||Number.isFinite(a.offset)&&a.offset===b.offset;
  if(a.type==="pdf")return a.page===b.page&&Math.abs((a.offset||0)-(b.offset||0))<.001;
 }catch{}return false;
}
