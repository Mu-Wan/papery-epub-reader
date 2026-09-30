async (page) => {
  await page.setViewportSize({width:1280,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://localhost:3100');await page.locator('.appShell[data-ready=true]').waitFor();
  const seedPdf=async variant=>page.evaluate(async variant=>{
    const count=200,objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${count} /Kids [${Array.from({length:count},(_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    for(let i=0;i<count;i++){const width=600,height=(i%3===0?900:800)+(variant&&i===150?100:0);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);const stream=`BT /F1 20 Tf 50 700 Td (Page ${i+1}) Tj ET`;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)}
    let text='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(text.length);text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=text.length;text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});const tx=db.transaction(['books','settings'],'readwrite');
    tx.objectStore('books').put({id:'perf-pdf',title:'PDF 性能检查',author:'检查作者',format:'PDF',category:'未分类',progress:0,blob:new Blob([text],{type:'application/pdf'}),coverDataUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="60" height="80" fill="#F5F2EF"/></svg>'),updatedAt:Date.now()});
    if(!variant)tx.objectStore('settings').delete('analysis:perf-pdf');await new Promise(resolve=>tx.oncomplete=resolve);db.close();localStorage.removeItem('papery-progress-perf-pdf');
  },variant);
  const cache=()=>page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});return await new Promise(resolve=>{const r=db.transaction('settings').objectStore('settings').get('analysis:perf-pdf');r.onsuccess=()=>{resolve(r.result?.value);db.close()}})});
  await seedPdf(false);await page.reload();await page.getByRole('button',{name:'阅读《PDF 性能检查》',exact:true}).waitFor();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const open=async()=>{const t=Date.now();await page.getByRole('button',{name:'阅读《PDF 性能检查》',exact:true}).click();await page.locator('.pdfTextLayer span').first().waitFor();return Date.now()-t};
  const firstMs=await open();const first=await cache();if(first.pageRatios?.length!==200||first.pageRatios[150]!==1.5)throw new Error('Mixed page sizes not preserved');
  await page.getByRole('button',{name:'目录',exact:true}).click();await page.locator('.tocPanel button').filter({hasText:'第 151 页'}).click();await page.waitForFunction(()=>document.querySelector('.readerBottom')?.textContent.includes('151 / 200'));
  await page.getByRole('button',{name:'返回书库',exact:true}).click();const cachedMs=await open();await page.waitForFunction(()=>document.querySelector('.readerBottom')?.textContent.includes('151 / 200'));
  const second=await cache();if(first.fingerprint!==second.fingerprint)throw new Error('Stable document signature changed');
  await page.getByRole('button',{name:'返回书库',exact:true}).click();await seedPdf(true);await page.reload();await open();const changed=await cache();if(changed.fingerprint===first.fingerprint||changed.pageRatios[150]!==1000/600)throw new Error('Changed source reused stale geometry');
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  return {result:'PASS: 200-page mixed sizes, exact saved-page restore, geometry cache reuse, full-content invalidation',cpuThrottle:4,firstMs,cachedMs,pages:200};
}
