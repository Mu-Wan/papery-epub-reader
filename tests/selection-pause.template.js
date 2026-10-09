async page=>{
 const results=[],check=(name,value,details)=>{results.push({name,pass:!!value,details});if(!value)throw new Error(JSON.stringify(results));};
 await page.mouse.up();
 await page.setViewportSize({width:1280,height:800});
 let isTxt=false;
 await page.route('**/text.pdf',async route=>{
  if(isTxt)await route.fulfill({contentType:'text/plain',body:'正文内容适合用来测试选区。按住鼠标左键，拖动后停住，文字应保持选中，直到松开左键再弹出标注。'.repeat(80)});
  else await route.continue();
 });
 for(const mode of [{format:'EPUB'},{format:'PDF',pdfMode:'original'},{format:'PDF',pdfMode:'text'},{format:'TXT'}]){
  isTxt=mode.format==='TXT';
  await page.evaluate(async mode=>{window.fixture.close();window.fixture.location=null;window.fixture.selection=null;window.fixture.settings({flow:'scrolled',fontSize:20,pdfMode:mode.pdfMode||'original'});await window.fixture.open(mode.format);},mode);
  await page.waitForFunction(mode=>mode.format==='EPUB'?document.querySelector('foliate-view')?.renderer?.getContents?.()[0]?.doc?.querySelector('p'):mode.format==='PDF'&&mode.pdfMode==='original'?document.querySelector('.pdfTextLayer span'):document.querySelector('[data-txt-start]'),mode);
  await page.waitForTimeout(300);
  await page.evaluate(mode=>{window.pauseEvents=[];window.addEventListener('blur',()=>{let active=document.activeElement,path=[];while(active){path.push(active.tagName);active=active.shadowRoot?.activeElement;}window.pauseEvents.push({type:'parent-blur',focus:document.hasFocus(),path});},{once:true});const doc=mode.format==='EPUB'?document.querySelector('foliate-view').renderer.getContents()[0].doc:document;for(const type of ['mousedown','mouseup','pointerdown','pointerup','blur'])doc.addEventListener(type,e=>window.pauseEvents.push({type:e.type,button:e.button,buttons:e.buttons}),true);},mode);
  const point=await page.evaluate(mode=>{
   const doc=mode.format==='EPUB'?document.querySelector('foliate-view').renderer.getContents()[0].doc:document;
   const offset=mode.format==='EPUB'?doc.defaultView.frameElement.getBoundingClientRect():{left:0,top:0};
   const els=doc.querySelectorAll(mode.format==='EPUB'?'p':mode.format==='PDF'&&mode.pdfMode==='original'?'.pdfTextLayer span':'[data-txt-start]');
   for(const el of els){const b=el.getBoundingClientRect();if(b.width>150&&b.top+offset.top>30&&b.top+offset.top<innerHeight-80)return{x:offset.left+b.left+50,y:offset.top+b.top+Math.min(12,b.height/2)};}
  },mode);
  if(!point)throw new Error('No visible text for '+JSON.stringify(mode));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+160,point.y,{steps:12});
  const selected=await page.evaluate(mode=>{const doc=mode.format==='EPUB'?document.querySelector('foliate-view').renderer.getContents()[0].doc:document;for(let i=0;i<8;i++)doc.dispatchEvent(new Event('selectionchange'));return doc.getSelection().toString();},mode);
  check(mode.format+' '+(mode.pdfMode||'')+' drag creates a nonempty selection',selected.trim().length>0,selected);
  await page.waitForTimeout(1800);
  check(mode.format+' '+(mode.pdfMode||'')+' stationary held mouse keeps selection without opening notes',await page.evaluate(mode=>{const doc=mode.format==='EPUB'?document.querySelector('foliate-view').renderer.getContents()[0].doc:document;return !window.fixture.selection&&!!doc.getSelection().toString();},mode));
  await page.mouse.up();await page.waitForTimeout(180);
  check(mode.format+' '+(mode.pdfMode||'')+' only primary release commits the selection',await page.evaluate(()=>!!window.fixture.selection?.quote),await page.evaluate(()=>window.pauseEvents));
 }
 await page.unroute('**/text.pdf');return results;
}
