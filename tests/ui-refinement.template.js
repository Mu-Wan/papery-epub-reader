async page=>{
 const results=[],check=(name,pass,details)=>{results.push({name,pass:!!pass,details});if(!pass)throw new Error(JSON.stringify(results));};
 await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:3188/appearance/');await page.waitForFunction(()=>window.fixture?.preferences);
 for(const prefs of [{appTheme:'light',canvasPreset:'neutral'},{appTheme:'light',canvasPreset:'sand'},{appTheme:'dark',canvasPreset:'mist'},{appTheme:'light',canvasPreset:'custom',customCanvas:'#777777'}]){
  await page.evaluate(p=>window.fixture.preferences(p),prefs);await page.waitForTimeout(60);
  const colors=await page.evaluate(()=>['.appShell','.titleBar','.sidebar'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor));check('Window chrome shares its canvas '+JSON.stringify(prefs),new Set(colors).size===1,colors);
 }
 for(const width of [320,393,768]){
  await page.setViewportSize({width,height:650});await page.goto('http://127.0.0.1:3188/appearance/');await page.waitForFunction(()=>window.fixture?.view);await page.evaluate(()=>{window.fixture.preferences({appTheme:'dark'});window.fixture.count(5);});await page.waitForTimeout(100);
  const geometry=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),art=r('.resumeVisual'),cta=r('.resumeAction'),track=r('.resumeTrack'),section=r('.resumeScene'),tabs=r('.shelfCategories');return {bookBottom:art.bottom,ctaBottom:cta.bottom,progressLeft:track.left,sectionLeft:section.left,progressTop:track.top,bookTop:art.top,height:section.height,tabsHeight:tabs.height};});
  check('Mobile reading composition has a shared baseline and full-width progress '+width,Math.abs(geometry.bookBottom-geometry.ctaBottom)<2&&Math.abs(geometry.progressLeft-geometry.sectionLeft)<1&&geometry.progressTop>geometry.bookBottom&&geometry.tabsHeight<=36,geometry);
  await page.evaluate(()=>window.fixture.view('theme'));await page.getByRole('dialog',{name:'主题设置'}).waitFor();await page.waitForTimeout(250);
  const panel=await page.getByRole('dialog',{name:'主题设置'}).evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{rounded:parseFloat(s.borderRadius)>=16,hiddenScrollbar:s.scrollbarWidth==='none',scrollable:e.scrollHeight>e.clientHeight,fits:r.top>=0&&r.bottom<=innerHeight};});check('Mobile theme dialog retains corners and hides the protruding native scrollbar '+width,panel.rounded&&panel.hiddenScrollbar&&panel.scrollable&&panel.fits,panel);
  await page.getByRole('dialog',{name:'主题设置'}).evaluate(e=>e.scrollTop=e.scrollHeight);await page.getByRole('button',{name:'完成',exact:true}).click();check('Touch dialog remains scrollable through its final action '+width,await page.locator('.libraryPage').isVisible());
  if(width===393){await page.screenshot({path:'output/diagnostics/reader-media/mobile-home-refined49.png'});await page.evaluate(()=>window.fixture.view('theme'));await page.waitForTimeout(250);await page.screenshot({path:'output/diagnostics/reader-media/mobile-theme49.png'});await page.keyboard.press('Escape');await page.evaluate(()=>window.fixture.view('lookup'));await page.locator('.lookupDefinitions dt').first().waitFor();await page.screenshot({path:'output/diagnostics/reader-media/selection-offline-final49.png'});await page.keyboard.press('Escape');}
 }
 return results;
}
