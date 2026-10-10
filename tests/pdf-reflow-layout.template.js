async page=>{
 const results=[];const check=(name,value,details)=>{results.push({name,pass:!!value,details});if(!value)throw new Error(JSON.stringify(results));};
 await page.goto('http://127.0.0.1:3188/');await page.waitForSelector('.readerPage');
 await page.setViewportSize({width:2560,height:1600});
 const defaults=await page.evaluate(()=>{const root=document.querySelector('.readerPage');return{color:getComputedStyle(root).backgroundColor,texture:getComputedStyle(root).backgroundImage};});
 check('Default paper is parchment with fine texture',defaults.color==='rgb(240, 230, 210)'&&defaults.texture.includes('fine.png'),defaults);
 await page.evaluate(()=>{window.fixture.settings({pdfMode:'text',flow:'paginated',fontFamily:'serif',fontSize:24});return window.fixture.open('PDF','chinese');});
 await page.waitForFunction(()=>document.querySelector('[data-txt-start]'));await page.waitForTimeout(650);
 const text=await page.evaluate(()=>[...document.querySelectorAll('[data-txt-start]')].map(p=>p.textContent));
 const expected=await page.evaluate(async()=>await(await fetch('chinese-paragraphs.json')).json());
 check('Wide-line-spacing Chinese PDF retains four real paragraphs rather than physical lines',JSON.stringify(text)===JSON.stringify(expected),{paragraphs:text.length,expected:expected.length});
 const measure=()=>{
  const host=document.querySelector('.txtReader').getBoundingClientRect(),p=document.querySelector('[data-txt-start]'),rect=p.getBoundingClientRect(),node=p.firstChild;
  let longest=0;const rows=new Map();for(let i=0;i<node.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.left>=rect.left-1&&r.right<=rect.right+1){const key=Math.round(r.top),old=rows.get(key)||{left:r.left,right:r.right};old.left=Math.min(old.left,r.left);old.right=Math.max(old.right,r.right);rows.set(key,old);}}
  for(const row of rows.values())longest=Math.max(longest,row.right-row.left);
  return{left:rect.left-host.left,right:host.right-rect.right,width:rect.width,fill:longest/rect.width,rows:rows.size};
 };
 const large=await page.evaluate(measure);
 check('Desktop reflow has equal left/right margins and fills the text column',Math.abs(large.left-large.right)<2&&large.fill>.95,large);
 await page.screenshot({path:'output/diagnostics/reader-media/pdf-reflow-parchment-desktop.png'});
 await page.evaluate(()=>window.fixture.settings({fontSize:32}));await page.waitForTimeout(550);
 const larger=await page.evaluate(measure);check('Larger font rewraps without inheriting original PDF line ends',larger.rows>large.rows&&larger.fill>.95,larger);
 const search=await page.evaluate(async()=>window.fixture.api.search('检索目标'));check('Search finds joined paragraphs and keeps PDF page locator',search.length===1&&JSON.parse(search[0].locator).page===1,search[0]);
 await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.fixture.settings({flow:'scrolled',fontSize:20}));await page.waitForTimeout(550);
 const mobile=await page.evaluate(()=>{const host=document.querySelector('.txtReader').getBoundingClientRect(),content=document.querySelector('.txtReader article');const css=getComputedStyle(content);return{left:Number.parseFloat(css.paddingLeft),right:Number.parseFloat(css.paddingRight),overflow:document.documentElement.scrollWidth>innerWidth,paragraphs:content.children.length,host:host.width};});
 check('Mobile reflow keeps symmetric margins and no horizontal overflow',Math.abs(mobile.left-mobile.right)<1&&!mobile.overflow&&mobile.paragraphs===4,mobile);
 await page.screenshot({path:'output/diagnostics/reader-media/pdf-reflow-parchment-mobile.png'});
 await page.evaluate(()=>window.fixture.settings({pageColor:'#DCE8D7',paperTexture:'plain'}));await page.waitForTimeout(100);
 check('Custom paper choices remain adjustable after the new default',await page.evaluate(()=>getComputedStyle(document.querySelector('.readerPage')).backgroundColor==='rgb(220, 232, 215)'&&getComputedStyle(document.querySelector('.readerPage')).backgroundImage==='none'));
 return results;
}
