async (page) => {
  const snapshots = new Map();
  let incoming = [], pendingName = '', fail = false, chunks = 0;
  await page.route('https://www.googleapis.com/**', async route => {
    const request = route.request(), url = {pathname:request.url().split('?' )[0].replace('https://www.googleapis.com','')};
    const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'Location','content-type':'application/json'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(fail)return route.fulfill({status:403,headers,body:'{}'});
    if(request.headers().authorization!=='Bearer papery-local-integration-test')throw new Error('Missing access token');
    if(url.pathname==='/drive/v3/files')return route.fulfill({status:200,headers,body:JSON.stringify({files:[...snapshots].map(([id,value])=>({id,name:value.name,modifiedTime:new Date().toISOString()}))})});
    if(request.method()==='GET')return route.fulfill({status:200,headers,body:JSON.stringify(snapshots.get(url.pathname.split('/').at(-1)).data)});
    if(request.method()==='POST'){pendingName=JSON.parse(request.postData()).name;incoming=[];return route.fulfill({status:200,headers:{...headers,Location:'https://www.googleapis.com/upload-session'},body:'{}'});}
    if(request.method()==='PUT'){
      incoming.push(request.postDataBuffer());chunks++;
      const range=/bytes (\d+)-(\d+)\/(\d+)/.exec(request.headers()['content-range']);
      const done=Number(range[2])+1===Number(range[3]);
      if(done){const data=JSON.parse(incoming[0].constructor.concat(incoming).toString());snapshots.set('file-'+snapshots.size,{name:pendingName,data});}
      return route.fulfill({status:done?200:308,headers,body:'{}'});
    }
    return route.fulfill({status:204,headers});
  });
  await page.getByText('临时授权接入（用于联调）',{exact:true}).click();
  await page.getByLabel('临时访问令牌',{exact:true}).fill('papery-local-integration-test');
  await page.getByRole('button',{name:'使用临时授权',exact:true}).click();
  await page.getByRole('button',{name:'立即同步',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.syncStatus')?.textContent.includes('同步完成'));
  const first=[...snapshots.values()][0].data;
  if(first.books.length!==2)throw new Error('Not all local books uploaded');
  const remote=JSON.parse(JSON.stringify(first));
  remote.books.push({id:'qa-remote-book',title:'同步回归样本',author:'自动测试',format:'TXT',category:'未分类',progress:0,updatedAt:Date.now(),blob:'data:text/plain;base64,SGVsbG8gd29ybGQ='});
  snapshots.set('remote',{name:`papery-sync-v1-remote-${Date.now()}.json`,data:remote});
  await page.getByRole('button',{name:'立即同步',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.syncStatus')?.textContent.includes('同步完成：3 本书'));
  fail=true;
  await page.getByRole('button',{name:'立即同步',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.syncStatus')?.textContent.includes('403'));
  const message=await page.locator('.syncStatus').innerText();
  await page.getByRole('button',{name:'断开连接',exact:true}).click();
  await page.locator('.syncPanel').getByRole('button',{name:'关闭同步设置',exact:true}).click();
  if(await page.getByRole('heading',{name:'同步回归样本',exact:true}).count()!==1)throw new Error('Remote book did not survive error');
  await page.unroute('https://www.googleapis.com/**');
  return {uploadedBooks:first.books.length,downloadedBooks:3,uploadChunks:chunks,networkFailure:message,realGoogleRequests:0};
}
