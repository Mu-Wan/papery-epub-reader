async (page) => {
 const fixture=__FIXTURE__;
 const context=await page.context().browser().newContext({viewport:{width:1440,height:960},deviceScaleFactor:2,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
 const demo=await context.newPage();await demo.goto('http://localhost:3100');await demo.locator('.appShell[data-ready=true]').waitFor();
 await demo.evaluate(async fixture=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});
  const tx=db.transaction(['books','annotations','sessions','settings','categories'],'readwrite');for(const name of ['books','annotations','sessions','settings','categories'])tx.objectStore(name).clear();
  const now=Date.now();for(const [i,item]of fixture.books.entries()){const {blobBase64,...book}=item;tx.objectStore('books').put({...book,blob:new Blob([Uint8Array.from(atob(blobBase64),c=>c.charCodeAt(0))]),updatedAt:now-i*1000});}
  tx.objectStore('settings').put({key:'app',value:{appTheme:'light',density:'comfortable',startPage:'library',profileName:'Papery 读者',avatarDataUrl:'/brand/default-avatar-v2.png',autoSync:false}});
  tx.objectStore('settings').put({key:'last-read-book-id',value:'demo-0'});tx.objectStore('settings').put({key:'reader:demo-0',value:{fontFamily:'lxgw',fontSize:20,lineHeight:1.9,paragraphSpacing:14,verticalMargin:5,horizontalMargin:7,pageColor:'#FCFBFA',flow:'paginated',spread:'single',paperTexture:'plain'}});
  for(const name of ['未分类','散文','随笔'])tx.objectStore('categories').put({name});
  const notes=['日常的小风景，也是值得停下来的理由。','把目光从屏幕上移开，重新认识身边的地方。','真正留下来的，往往是这些细小的片刻。','记住这句话，带到下一次散步里。'];
  for(let i=0;i<4;i++){const quote=fixture.quotes[i],start=fixture.text.indexOf(quote);tx.objectStore('annotations').put({id:'demo-note-'+i,bookId:'demo-0',style:i===2?'underline':'highlight',quote,note:notes[i],locator:JSON.stringify({type:'txt',start,end:start+quote.length}),color:['#FDEDE4','#E8F4FB','#E8F3EA','#F5F2EF'][i],chapterTitle:'河岸的早晨',progress:7+i*9,createdAt:now-i*86400000,updatedAt:now-i*86400000});}
  for(let i=0;i<7;i++){const date=new Date();date.setHours(10,0,0,0);date.setDate(date.getDate()-i);const seconds=[42,35,28,48,0,31,52][i]*60;if(seconds)tx.objectStore('sessions').put({id:'demo-session-'+i,book_id:'demo-'+(i%5),started_at:date.getTime(),duration_seconds:seconds,words_read:0});}
  await new Promise(resolve=>tx.oncomplete=resolve);db.close();
 },fixture);
 await demo.reload();await demo.locator('.bookCard').nth(4).waitFor();await demo.evaluate(()=>document.fonts.ready);await demo.mouse.move(1400,940);
 const capture=async(name)=>{await demo.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});await demo.screenshot({path:'site/assets/screens/'+name+'.png'});};
 await capture('library');await demo.setViewportSize({width:390,height:844});await capture('mobile-library');await demo.setViewportSize({width:1440,height:960});await demo.getByRole('button',{name:'数据',exact:true}).click();await demo.locator('.readingDashboard').waitFor();await demo.waitForTimeout(750);await capture('data');
 await demo.getByRole('button',{name:'笔记',exact:true}).click();await demo.setViewportSize({width:1050,height:800});await demo.locator('.noteCard').nth(3).waitFor();await capture('notes');
 await demo.setViewportSize({width:1440,height:960});await demo.getByRole('button',{name:'书库',exact:true}).click();await demo.locator('.resumeAction').click();await demo.locator('.txtFlowContent').waitFor();await demo.waitForTimeout(250);await capture('reader');
 await demo.getByRole('button',{name:'返回书库',exact:true}).click();await demo.setViewportSize({width:390,height:844});
 await demo.locator('.resumeAction').click();await demo.locator('.txtFlowContent').waitFor();await capture('mobile-reader');
 await context.close();return 'Captured six real product views with isolated demonstration data at 2x resolution.';
}
