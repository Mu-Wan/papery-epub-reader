async (page)=>{
 await page.setViewportSize({width:1800,height:1500});const results=[];
 for(const view of ['hero','reading','data']){await page.goto('http://localhost:3101/scripts/showcase/layout.html?view='+view);await page.evaluate(()=>document.fonts.ready);await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode()))});await page.locator('.board.active').screenshot({path:'site/assets/'+view+'-showcase.png'});results.push(view);}
 return {rendered:results};
}
