async (page) => {
  const phase='after';
  await page.setViewportSize({width:1280,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://localhost:3100');await page.locator('.appShell[data-ready=true]').waitFor();
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const tx=db.transaction(['books','annotations','sessions','settings','categories'],'readwrite');for(const n of ['books','annotations','sessions','settings','categories'])tx.objectStore(n).clear();
    for(let i=0;i<300;i++){const id='perf-book-'+i;tx.objectStore('books').put({id,title:i?'书籍 '+String(i).padStart(3,'0'):'性能检查',author:'检查作者',format:'TXT',category:'未分类',progress:20,currentLocation:'{"type":"txt","offset":0}',blob:new Blob(['第一章 清晨\n'+('阅读内容，保存每一次阅读的位置。\n'.repeat(250))]),updatedAt:1});tx.objectStore('settings').put({key:'cover:'+id,value:null})}
    tx.objectStore('settings').put({key:'last-read-book-id',value:'perf-book-0'});tx.objectStore('settings').put({key:'app',value:{appTheme:'light',density:'comfortable',startPage:'library',profileName:'Papery 读者',avatarDataUrl:'/brand/default-avatar.svg'}});
    tx.objectStore('sessions').put({id:'perf-session',book_id:'perf-book-1',started_at:Date.now()-3600000,duration_seconds:600,words_read:0});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();localStorage.clear();
  });
  await page.addInitScript(()=>{if(window.__paperyTxInstalled)return;window.__paperyTxInstalled=true;window.__txCounts={};const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,...args){const k=String(stores);window.__txCounts[k]=(window.__txCounts[k]||0)+1;return original.call(this,stores,...args)}});
  const client=await page.context().newCDPSession(page);await client.send('Emulation.setCPUThrottlingRate',{rate:4});await client.send('Performance.enable');
  const runs=[];for(let i=0;i<3;i++){const t=Date.now();await page.reload();await page.locator('.bookCard').nth(299).waitFor();await page.evaluate(()=>document.fonts.ready);const metrics=await client.send('Performance.getMetrics');runs.push({readyMs:Date.now()-t,transactions:await page.evaluate(()=>window.__txCounts),metrics:Object.fromEntries(metrics.metrics.filter(m=>['ScriptDuration','TaskDuration','JSHeapUsedSize'].includes(m.name)).map(m=>[m.name,m.value]))})}
  await client.send('Emulation.setCPUThrottlingRate',{rate:1});
  for(const [label,nav,selector] of [['library',null,'.libraryPage'],['data','数据','.statsPage'],['notes','笔记','.notesPage']]){if(nav)await page.getByRole('button',{name:nav,exact:true}).click();await page.locator(selector).waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'output/ui-0.1.25/perf-'+phase+'-'+label+'.png'})}
  await page.getByRole('button',{name:'书库',exact:true}).click();await page.getByRole('button',{name:'继续阅读',exact:true}).click();await page.locator('.txtReader').waitFor();
  await client.send('Emulation.setCPUThrottlingRate',{rate:4});const start=await client.send('Performance.getMetrics');
  for(let i=0;i<20;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(30)}
  const end=await client.send('Performance.getMetrics');await client.send('Emulation.setCPUThrottlingRate',{rate:1});
  const read=ms=>Object.fromEntries(ms.metrics.map(m=>[m.name,m.value]));const a=read(start),b=read(end);
  return {phase,cpuThrottle:4,books:300,runs,turn20:{scriptSeconds:b.ScriptDuration-a.ScriptDuration,taskSeconds:b.TaskDuration-a.TaskDuration}};
}
