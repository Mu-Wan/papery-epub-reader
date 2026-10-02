// Run through playwright-cli run-code after injecting the original fixture JSON.
async (page) => {
  const fixture=__FIXTURE__;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const p=await context.newPage(),failures=[],checks=[];
  const check=(name,ok,detail)=>{checks.push({name,ok,detail});if(!ok)failures.push(name)};
  p.on('pageerror',error=>failures.push('pageerror: '+error.message));
  await p.goto('http://127.0.0.1:3100');await p.locator('.appShell[data-ready=true]').waitFor();
  await p.getByRole('button',{name:'用户资料与同步'}).click();await p.getByRole('button',{name:'云同步',exact:true}).click();
  check('fresh installation has blank Google configuration',(await p.getByRole('textbox',{name:'OAuth 客户端 ID'}).inputValue())==='');
  await p.getByRole('button',{name:'关闭用户设置',exact:true}).last().click();
  await p.evaluate(async fixture=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});
    const tx=db.transaction(['books','settings','categories','annotations','sessions'],'readwrite');
    tx.objectStore('books').put({id:'epub-core',title:'阅读核心核查',author:'原创测试文档',format:'EPUB',category:'分类 01',progress:0,blob:new Blob([Uint8Array.from(atob(fixture.epub),c=>c.charCodeAt(0))]),updatedAt:100});
    tx.objectStore('settings').put({key:'reader:epub-core',value:{fontFamily:'system',pageColor:'#FCFBFA',flow:'scrolled',spread:'double',fontSize:20,horizontalMargin:7,verticalMargin:5,lineHeight:1.8,paragraphSpacing:14,paperTexture:'plain'},updatedAt:100});
    for(let i=1;i<25;i++)tx.objectStore('categories').put({name:'分类 '+String(i).padStart(2,'0'),createdAt:100});
    await new Promise(resolve=>tx.oncomplete=resolve);db.close();
  },fixture);
  await p.reload();await p.locator('.bookCard').first().waitFor();
  const heading=await p.locator('.sidebarShelf>p').boundingBox();await p.locator('.categoryList').evaluate(e=>e.scrollTop=e.scrollHeight);const after=await p.locator('.sidebarShelf>p').boundingBox();
  check('category title remains fixed',Math.abs(heading.y-after.y)<1);
  await p.locator('.categoryList').evaluate(e=>e.scrollTop=0);await p.getByRole('button',{name:'编辑分类 分类 01',exact:true}).focus();await p.getByRole('button',{name:'编辑分类 分类 01',exact:true}).click();
  await p.getByRole('textbox',{name:'分类名称',exact:true}).fill('已改名的分类');await p.getByRole('button',{name:'保存分类',exact:true}).click();await p.locator('.smallModal').waitFor({state:'detached'});
  check('category rename updates books and preserves source',await p.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});const book=await new Promise(resolve=>{const r=db.transaction('books').objectStore('books').get('epub-core');r.onsuccess=()=>resolve(r.result)});db.close();return book.category==='已改名的分类'&&book.blob.size>0}));
  await p.getByRole('button',{name:'用户资料与同步'}).click();await p.getByRole('button',{name:'云同步',exact:true}).click();
  const input=p.getByRole('textbox',{name:'OAuth 客户端 ID'});await input.fill('test-only.apps.googleusercontent.com');await input.focus();
  const a=await input.boundingBox(),b=await p.getByRole('button',{name:'使用 Google 连接',exact:true}).boundingBox();check('Google connection button clears the field',b.y>=a.y+a.height+6,{field:a,button:b});
  await p.screenshot({path:'output/ui-0.1.28/sync-fields.png'});await p.getByRole('button',{name:'关闭用户设置',exact:true}).last().click();
  await p.getByRole('button',{name:'数据',exact:true}).click();await p.locator('.formatComposition').waitFor();check('format composition has no bubble SVG',await p.locator('.formatWidget svg').count()===0);await p.screenshot({path:'output/ui-0.1.28/data.png'});
  await p.getByRole('button',{name:'书库',exact:true}).click();await p.getByRole('button',{name:'阅读《阅读核心核查》',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.getContents?.()[0]?.doc?.querySelector('p'));
  await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.getContents?.()[0]?.doc?.body?.offsetHeight>300);
  const metrics=()=>p.locator('foliate-view').evaluate(v=>{const r=v.renderer,c=r.getContents()[0],f=c.doc.defaultView.frameElement;return{tag:r.tagName,index:c.index,width:c.doc.body.getBoundingClientRect().width,frame:c.doc.defaultView.innerWidth,host:v.clientWidth,count:r.getContents().length,top:r.scroller?.scrollTop,height:r.scroller?.scrollHeight,viewport:r.scroller?.clientHeight,frameRect:f.getBoundingClientRect().toJSON(),color:getComputedStyle(c.doc.body).color,visible:getComputedStyle(f).visibility}});
  const initial=await metrics();check('vertical mode spans full reader width',initial.width/initial.host>.98,initial);
  const visited=[];for(let i=0;i<12;i++){
    await p.locator('foliate-view').evaluate(async(v,index)=>{await v.goTo(index);},i);
    await p.waitForFunction(index=>document.querySelector('foliate-view')?.renderer?.getContents?.()[0]?.index===index,i);
    const info=await metrics();visited.push(info);check('chapter '+(i+1)+' full width',info.width/info.host>.98,info);check('bounded adjacent chapter retention '+i,info.count<=5,info.count);
    // Scroll natively over the boundary into the following chapter, then back.
    if(i<11){await p.locator('foliate-view').evaluate(v=>{const r=v.renderer,e=r.entries[r.currentIndex];r.scroller.scrollTop=e.element.offsetTop+e.height+50});await p.waitForFunction(index=>document.querySelector('foliate-view')?.renderer?.currentIndex>=index,i+1);check('continuous boundary '+i,true);}
  }
  await p.locator('foliate-view').evaluate(v=>v.renderer.scroller.scrollTop=v.renderer.scroller.scrollHeight);await p.waitForTimeout(150);
  check('last chapter can reach end',(await p.locator('.readerPosition').innerText()).includes('100%'),await p.locator('.readerPosition').innerText());
  await p.locator('foliate-view').evaluate(v=>v.goTo(2));await p.waitForFunction(()=>{const r=document.querySelector('foliate-view')?.renderer;return r?.currentIndex===2&&r?.entries?.[2]?.ready});await p.waitForTimeout(500);const reverse=await metrics();check('visible chapter after reverse jump',reverse.frameRect.height>reverse.viewport,reverse);await p.screenshot({path:'output/ui-0.1.28/epub-scroll.png'});
  const beforeWheel=await metrics();const readerBox=await p.locator('foliate-view').boundingBox();await p.mouse.move(readerBox.x+readerBox.width*.5,readerBox.y+readerBox.height*.5);await p.mouse.wheel(0,550);await p.waitForTimeout(250);const afterWheel=await metrics();check('real iframe wheel moves continuous reader',afterWheel.top>beforeWheel.top,{before:beforeWheel.top,after:afterWheel.top});
  await p.getByRole('button',{name:'隐藏阅读工具栏'}).click();const quiet=await p.locator('.readerBottom').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,blur:getComputedStyle(e).backdropFilter,opacity:getComputedStyle(e).opacity,text:e.textContent}));check('hidden controls preserve transparent status',quiet.bg==='rgba(0, 0, 0, 0)'&&quiet.opacity==='1'&&/\d{2}:\d{2}/.test(quiet.text),quiet);
  await p.getByRole('button',{name:'显示阅读工具栏'}).click();await p.getByRole('button',{name:'书内搜索',exact:true}).click();const search=p.getByPlaceholder('搜索书内文字');await search.fill('检索标记-10-7');await search.press('Enter');await p.locator('.bookSearchResults button').first().waitFor();await p.screenshot({path:'output/ui-0.1.28/search-focus.png'});await p.locator('.bookSearchResults button').first().click();await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.currentIndex===9);check('search jumps across unloaded chapters',true);
  // Change flow through the actual settings control, preserving the current CFI.
  await p.getByRole('button',{name:'排版',exact:true}).click();await p.getByRole('button',{name:/^横向翻页/}).click();await p.getByRole('button',{name:'双页',exact:true}).click();await p.getByRole('button',{name:'关闭阅读设置',exact:true}).last().click();
  await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.tagName==='FOLIATE-PAGINATOR');await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.getContents?.()[0]?.index===9);
  const gutter=()=>p.locator('foliate-view').evaluate(v=>{const c=v.renderer.getContents()[0],doc=c.doc;return{gap:parseFloat(getComputedStyle(doc.documentElement).columnGap),width:doc.defaultView.innerWidth,index:c.index,columns:doc.documentElement.style.columnWidth}});
  const gap1=await gutter();await p.getByRole('button',{name:'排版',exact:true}).click();const sliders=p.locator('.readerSettingsPanel input[type=range]');
  // The range is labelled by its containing section, retained for keyboard accessibility.
  const margin=p.getByRole('slider',{name:'左右边距'});await margin.fill('14');await margin.dispatchEvent('input');await p.getByRole('button',{name:'关闭阅读设置',exact:true}).last().click();await p.waitForTimeout(250);const gap2=await gutter();check('double-page middle gutter remains fixed',Math.abs(gap1.gap-gap2.gap)<1&&Math.abs(gap2.gap-52)<1,{before:gap1,after:gap2});
  await p.screenshot({path:'output/ui-0.1.28/epub-double.png'});
  await p.getByRole('button',{name:'排版',exact:true}).click();await p.getByRole('button',{name:'单页',exact:true}).click();await p.getByRole('button',{name:/^竖向滚动/}).click();await p.getByRole('button',{name:'关闭阅读设置',exact:true}).last().click();await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.tagName==='PAPERY-CONTINUOUS');await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.currentIndex===9);
  await p.waitForFunction(()=>document.querySelector('foliate-view')?.renderer?.entries?.[9]?.ready);await p.waitForTimeout(150);await p.setViewportSize({width:390,height:844});await p.waitForTimeout(200);const narrow=await metrics();check('narrow reader retains full-width text and chapter',narrow.width/narrow.host>.98&&narrow.index===9,narrow);await p.screenshot({path:'output/ui-0.1.28/epub-mobile.png'});
  check('no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();
  return {checks,failures,visited};
}
