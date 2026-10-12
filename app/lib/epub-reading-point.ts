/** A viewport range can start just after the last character on the preceding page. */
export function forwardReadingPoint(input:Range):Range{
 const point=input.cloneRange();point.collapse(true);let node=point.startContainer,offset=point.startOffset;
 if(node.nodeType===3&&offset<(node.textContent?.length||0))return point;
 if(node.nodeType===1){const child=node.childNodes[offset];if(child){node=child;offset=0;if(node.nodeType===3&&node.textContent?.trim()){point.setStart(node,0);point.collapse(true);return point;}}}
 const doc=node.ownerDocument;if(!doc?.body?.contains(node))return point;
 const walker=doc.createTreeWalker(doc.body,4,{acceptNode:n=>n.textContent?.trim()&&!n.parentElement?.closest('script,style')?1:3});walker.currentNode=node;
 const next=walker.nextNode();if(next){point.setStart(next,0);point.collapse(true)}return point;
}
/** One glyph yields a stable rectangle; a multi-paragraph range may span columns. */
export function readingAnchorRange(input:Range):Range{
 const point=forwardReadingPoint(input),node=point.startContainer,offset=point.startOffset;
 if(node.nodeType===3&&offset<(node.textContent?.length||0))point.setEnd(node,offset+1);
 return point;
}
export function firstVisibleTextRange(doc:Document,y:number):Range|undefined{
 const walker=doc.createTreeWalker(doc.body,4,{acceptNode:n=>n.textContent?.trim()&&!n.parentElement?.closest('script,style')?1:3});let node:Node|null;
 while((node=walker.nextNode())){
  const range=doc.createRange();range.selectNodeContents(node);if(range.getBoundingClientRect().bottom<=y)continue;
  let low=0,high=Math.max(0,(node.textContent?.length||0)-1);
  while(low<high){const mid=(low+high)>>1;range.setStart(node,mid);range.setEnd(node,mid+1);if(range.getBoundingClientRect().bottom<=y)low=mid+1;else high=mid;}
  range.setStart(node,low);range.setEnd(node,low+1);return range;
 }
}
/** Use line fragments, because a paragraph's union box can span hidden columns. */
export function paginatedReadingPoint(doc:Document,viewport:DOMRect):Range|undefined{
 const frame=(doc.defaultView?.frameElement as HTMLElement|null)?.getBoundingClientRect();if(!frame)return;
 const style=doc.defaultView!.getComputedStyle(doc.body),vertical=style.writingMode.startsWith("vertical"),rtl=!vertical&&style.direction==="rtl";
 const visible=(rect:DOMRect)=>rect.width>0&&rect.height>0&&rect.right+frame.left>viewport.left+1&&rect.left+frame.left<viewport.right-1&&rect.bottom+frame.top>viewport.top+1&&rect.top+frame.top<viewport.bottom-1;
 const before=(rect:DOMRect)=>vertical?rect.bottom+frame.top<=viewport.top+1:rtl?rect.left+frame.left>=viewport.right-1:rect.right+frame.left<=viewport.left+1;
 const walker=doc.createTreeWalker(doc.body,4,{acceptNode:n=>n.textContent?.trim()&&!n.parentElement?.closest('script,style')?1:3});let node:Node|null;
 while((node=walker.nextNode())){
  const range=doc.createRange();range.selectNodeContents(node);if(!Array.from(range.getClientRects()).some(visible))continue;
  let low=0,high=Math.max(0,(node.textContent?.length||0)-1);
  while(low<high){const mid=(low+high)>>1;range.setStart(node,mid);range.setEnd(node,mid+1);if(before(range.getBoundingClientRect()))low=mid+1;else high=mid;}
  for(let at=low;at<(node.textContent?.length||0)&&at<low+512;at++){range.setStart(node,at);range.setEnd(node,at+1);if(Array.from(range.getClientRects()).some(visible)){range.collapse(true);return range;}}
 }
}
