async page=>{
 await page.setViewportSize({width:393,height:852});await page.goto('http://127.0.0.1:3188/');await page.waitForFunction(()=>window.fixture?.open);
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('papery-library');r.onsuccess=resolve;r.onerror=reject;});window.fixture.location=null;window.fixture.settings({pdfMode:'text',flow:'scrolled'});window.fixture.textRequests=0;window.fixture.docRequests=0;const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...args){if(data?.action==='GetTextContent')window.fixture.textRequests++;if(data?.action==='GetDocRequest')window.fixture.docRequests++;return post.call(this,data,...args);};});
 const measurements=[];
 for(const round of ['first','cached']){
  if(round==='cached'){await page.evaluate(()=>{window.fixture.close();window.fixture.textRequests=0;window.fixture.docRequests=0;});await page.waitForTimeout(100);}
  await page.evaluate(async round=>{window.fixture.started=performance.now();if(round==='first')await window.fixture.open('PDF','large');else window.fixture.reopen();},round);
  await page.waitForFunction(()=>document.querySelector('[data-txt-start]')?.textContent.includes('Page'),{timeout:60000});
  measurements.push(await page.evaluate(round=>({round,ms:Math.round(performance.now()-window.fixture.started),textRequests:window.fixture.textRequests,docRequests:window.fixture.docRequests,totalPages:window.fixture.location?.totalPages}),round));
  await page.waitForTimeout(250);
 }
 const results=await page.evaluate(async()=>{const found=await window.fixture.api.search('Page 399 line 20');return {found:found.length,page:found[0]?.page,loc:found[0]?.locator};});
 return {measurements,search:results,pass:measurements[0].textRequests===400&&measurements[1].textRequests===0&&results.page===399};
}
