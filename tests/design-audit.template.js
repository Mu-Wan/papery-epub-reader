async(page)=>{
 const fixture=__FIXTURE__,checks=[],screens=[];
 for(const width of [390,1440,2560])for(const count of [0,3,50]){
  const context=await page.context().browser().newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'}),p=await context.newPage();
  await p.goto('http://127.0.0.1:3100');await p.locator('.appShell[data-ready=true]').waitFor();
  if(count)await p.evaluate(async({fixture,count})=>{const db=await new Promise(r=>{const q=indexedDB.open('papery-library',3);q.onsuccess=()=>r(q.result)}),tx=db.transaction(['books','categories','annotations','sessions','settings'],'readwrite'),now=Date.now();for(let i=0;i<count;i++){const format=['EPUB','PDF','TXT'][i%3],id='visual-'+i;tx.objectStore('books').put({id,title:i===0?'清晨的河岸与阅读中留下的记录——'+('一段很长的书名'.repeat(12)):'河岸记录 · '+(i+1),author:i===0?'原创界面核查文档':('记录者 '+(i+1)),format,category:'阅读札记',progress:i%4===0?99:i*3%100,blob:new Blob([Uint8Array.from(atob(fixture[format.toLowerCase()]),c=>c.charCodeAt(0))]),updatedAt:now});tx.objectStore('annotations').put({id:'visual-note-'+i,bookId:id,style:i%3===0?'bookmark':i%3===1?'highlight':'underline',quote:i%3===0?'':'清晨沿着河岸慢慢走。'+('在纸上留下一段话。'.repeat(i===0?40:3)),note:i%2?'下次想再读这一段':'',color:'#EE9A6C',chapterTitle:'第 '+(i+1)+' 章',locator:JSON.stringify({type:'txt',offset:0}),progress:25,createdAt:now,updatedAt:now});tx.objectStore('sessions').put({id:'visual-session-'+i,book_id:id,started_at:now-(i%7)*86400000-1800000,duration_seconds:900+(i%9)*360,words_read:1000})}for(let i=0;i<(count===50?24:2);i++)tx.objectStore('categories').put({name:i===0?'阅读札记':'一个稍长的分类名称 '+i,createdAt:now});tx.objectStore('settings').put({key:'last-read-book-id',value:'visual-0',updatedAt:now});await new Promise(r=>tx.oncomplete=r);db.close()},{fixture,count});
  if(count){await p.reload();await p.locator('.appShell[data-ready=true]').waitFor();await p.locator('.bookCard').first().waitFor()}
  const navigate=async(name)=>{if(width===390)await p.getByRole('button',{name:'打开导航',exact:true}).click();await p.getByRole('button',{name,exact:true}).click()};
  for(const view of ['书库','笔记','数据']){
   if(view!=='书库')await navigate(view);await p.waitForTimeout(50);
   const info=await p.evaluate(()=>{const root=document.querySelector('.page'),nodes=[...root.querySelectorAll('*')].filter(e=>e.childNodes.length&&e.getBoundingClientRect().width&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));return{overflow:document.documentElement.scrollWidth>innerWidth,weights:[...new Set(nodes.map(e=>getComputedStyle(e).fontWeight))],cards:[...document.querySelectorAll('.bookCard,.noteCard,.timeWidget,.rhythmWidget,.formatWidget')].map(e=>({type:e.className,shadow:getComputedStyle(e).boxShadow,blur:getComputedStyle(e).backdropFilter})),radii:[...new Set([...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width).map(e=>getComputedStyle(e).borderRadius))],stockIcons:document.querySelectorAll('.lucide').length}});
   checks.push({name:`${view} ${width}px ${count} books`,ok:!info.overflow&&info.weights.length<=2&&!info.stockIcons,detail:info});
   const path=`output/ui-0.1.28/design-${width}-${count}-${view==='书库'?'library':view==='笔记'?'notes':'data'}.png`;await p.screenshot({path,fullPage:false});screens.push(path);
  }
  await context.close();
 }
 return {checks,screens,failures:checks.filter(c=>!c.ok)};
}
