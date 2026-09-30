async (page) => {
 await page.setViewportSize({width:1280,height:800});await page.goto('http://localhost:3100');await page.locator('.appShell[data-ready=true]').waitFor();
 const setting=async value=>page.evaluate(async value=>{const db=await new Promise(resolve=>{const r=indexedDB.open('papery-library',3);r.onsuccess=()=>resolve(r.result)});const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key:'app',value});await new Promise(resolve=>tx.oncomplete=resolve);db.close()},value);
 await setting({appTheme:'light',startPage:'library',density:'comfortable',profileName:'',avatarDataUrl:'/brand/default-avatar.svg'});
 await page.reload();await page.locator('.appShell[data-ready=true]').waitFor();
 const strip=page.getByRole('button',{name:'用户资料与同步',exact:true});
 if(await strip.locator('strong').innerText()!=='Papery 读者')throw Error('Default name');
 if(!(await strip.locator('.avatar').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('default-avatar-v2.png'))throw Error('Old default was not migrated');
 const response=await page.request.get('http://localhost:3100/brand/default-avatar-v2.png');if(!response.ok())throw Error('Default image missing');
 for(const target of ['.avatar','.profileSummary strong','.profileSummary small','svg']){
  await strip.locator(target).click();const panel=page.getByRole('dialog',{name:'用户资料与同步',exact:true});await panel.waitFor();
  await panel.getByRole('button',{name:'云同步',exact:true}).click();await panel.getByLabel('OAuth 客户端 ID',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'个人资料',exact:true}).click();await panel.getByRole('button',{name:'保存个人资料',exact:true}).waitFor();
  await panel.getByRole('button',{name:'关闭用户设置',exact:true}).click();
 }
 await page.getByRole('button',{name:'偏好设置',exact:true}).click();if(await page.locator('.settingsPanel .backupSyncGuide').count()||await page.locator('.settingsPanel').getByText('Google Drive',{exact:false}).count())throw Error('Duplicate sync preference');await page.locator('.settingsPanel').getByRole('button',{name:'关闭偏好设置',exact:true}).click();
 if(!await page.getByRole('button',{name:'对齐核查 0',exact:true}).count()){await page.getByRole('button',{name:'新建分类',exact:true}).click();await page.locator('.smallModal input').fill('对齐核查');await page.getByRole('button',{name:'确认',exact:true}).click();}
 await page.mouse.move(1150,650);await page.getByRole('textbox',{name:'搜索书名或作者'}).focus();
 const cat=page.getByRole('button',{name:'对齐核查 0',exact:true});const ref=page.locator('.categoryButton').filter({hasText:'未分类'}).locator('em');
 const count=cat.locator('em');const resting=(await count.boundingBox()).x+(await count.boundingBox()).width;const right=(await ref.boundingBox()).x+(await ref.boundingBox()).width;
 if(Math.abs(resting-right)>1)throw Error('Counts not right aligned '+JSON.stringify({resting,right}));
 await cat.hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[aria-label="删除分类 对齐核查"]')).opacity==='1');
 await count.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});const shifted=(await count.boundingBox()).x+(await count.boundingBox()).width;
 if(Math.abs(resting-shifted-28)>1)throw Error('Hover did not shift count 28px');
 await page.screenshot({path:'output/ui-0.1.27/categories-hover.png'});await page.mouse.move(1150,650);await count.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});
 if(Math.abs((await count.boundingBox()).x+(await count.boundingBox()).width-right)>1)throw Error('Count did not return');
 await cat.click();await page.mouse.move(1150,650);await count.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});if(Math.abs((await count.boundingBox()).x+(await count.boundingBox()).width-right)>1)throw Error('Mouse click focus keeps count shifted');await page.getByRole('button',{name:'书库',exact:true}).click();
 await page.screenshot({path:'output/ui-0.1.27/categories-normal.png'});
 await strip.click();await page.locator('.userPanel').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})))});await page.screenshot({path:'output/ui-0.1.27/user-profile.png'});await page.getByRole('button',{name:'云同步',exact:true}).click();await page.locator('.userPanel').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});await page.screenshot({path:'output/ui-0.1.27/user-sync.png'});await page.getByRole('dialog').getByRole('button',{name:'关闭用户设置',exact:true}).click();
 await setting({appTheme:'light',startPage:'library',density:'comfortable',profileName:'自定义昵称',avatarDataUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#88AA99"/></svg>')});await page.reload();await page.locator('.appShell[data-ready=true]').waitFor();
 if(await strip.locator('strong').innerText()!=='自定义昵称'||!(await strip.locator('.avatar').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('data:image/svg+xml'))throw Error('Custom profile overwritten');
 const widths=[];for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:850});if(width<=820)await page.getByRole('button',{name:'打开导航',exact:true}).click();await strip.click();const panel=page.locator('.userPanel');
  for(const tab of ['个人资料','云同步']){await panel.getByRole('button',{name:tab,exact:true}).click();const box=await panel.evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:el.scrollWidth>el.clientWidth+2}));if(box.left<0||box.right>width+1||box.overflow)throw Error('Panel overflow '+JSON.stringify({width,tab,box}));}
  await panel.getByRole('button',{name:'关闭用户设置',exact:true}).click();if(width<=820)await page.locator('.scrim').click({position:{x:width-5,y:60}});widths.push(width);
 }
 await page.setViewportSize({width:1280,height:800});await setting({appTheme:'light',startPage:'library',density:'comfortable',profileName:'Papery 读者',avatarDataUrl:'/brand/default-avatar-v2.png'});await page.reload();await page.locator('.appShell[data-ready=true]').waitFor();
 return {result:'PASS',normalCountsAligned:true,hoverShiftPixels:resting-shifted,wholeStripTargets:4,defaultAvatarMigration:true,customProfilePreserved:true,widths};
}
