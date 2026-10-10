async page=>{
 const results=[],check=(name,pass,details)=>{results.push({name,pass:!!pass,details});if(!pass)throw new Error(JSON.stringify(results));};
 await page.unroute('**/text.pdf');await page.addInitScript(()=>{Blob.prototype.arrayBuffer=async()=>new ArrayBuffer(0);Object.defineProperty(Promise,'withResolvers',{value:undefined,configurable:true,writable:true});delete Promise.withResolvers;});
 await page.setViewportSize({width:393,height:852});await page.goto('http://127.0.0.1:3188/');
 await page.evaluate(()=>{window.fixture.location=null;window.fixture.settings({pdfMode:'original'});return window.fixture.open('PDF')});await page.waitForFunction(()=>document.querySelector('.pdfPage canvas')?.width>1);
 check('Older-runtime PDF opens through real FileReader despite zero-byte arrayBuffer',await page.locator('.readerError').count()===0);
 const bytes=await page.evaluate(()=>window.fixture.persist());check('PDF import materializes owned bytes with legacy Blob fallback',bytes>1000,{bytes});
 await page.evaluate(()=>window.fixture.close());await page.waitForTimeout(100);await page.evaluate(()=>window.fixture.reopenStored());await page.waitForFunction(()=>document.querySelector('.pdfPage canvas')?.width>1);check('PDF reopens from IndexedDB-owned bytes in the older runtime',await page.locator('.readerError').count()===0);
 await page.route('**/text.pdf',route=>route.fulfill({contentType:'text/plain',body:'清晨沿着河岸散步，树影落在水面。\n\n纸张留下温暖的颜色。'.repeat(60)}));
 await page.evaluate(()=>{window.fixture.location=null;window.fixture.settings({flow:'scrolled'});return window.fixture.open('TXT')});await page.waitForFunction(()=>document.querySelector('[data-txt-start]')?.textContent.includes('清晨'));check('TXT renders through real FileReader on the same older runtime',await page.locator('.readerError').count()===0);
 await page.evaluate(()=>window.fixture.persist());await page.evaluate(()=>window.fixture.close());await page.waitForTimeout(100);await page.evaluate(()=>window.fixture.reopenStored());await page.waitForFunction(()=>document.querySelector('[data-txt-start]')?.textContent.includes('清晨'));check('TXT reopens from durable IndexedDB storage without a blank page',await page.locator('.readerError').count()===0);
 return results;
}
