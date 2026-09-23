async (page) => {
 await page.goto('http://localhost:3100');
 await page.getByRole('button',{name:/读者 仅保存在本机/}).click();
 await page.context().route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:(options)=>({requestAccessToken:()=>options.callback({access_token:'papery-local-integration-test',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})})}}};`}));
 await page.getByLabel('OAuth 客户端 ID',{exact:true}).fill('test.apps.googleusercontent.com');
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('button',{name:'使用 Google 连接',exact:true}).click();
 const popup=await popupPromise;
 await popup.getByRole('button',{name:'选择 Google 账号',exact:true}).click();
 await popup.getByRole('link',{name:'返回 Papery 完成连接'}).waitFor();
 const code=await popup.getByLabel('加密连接码',{exact:true}).inputValue();
 if(code.includes('papery-local-integration-test'))throw Error('Token was not encrypted');
 await page.getByLabel('连接码',{exact:true}).fill(code);
 await page.getByRole('button',{name:'完成连接',exact:true}).click();
 await page.getByText('已连接 Google Drive，可以立即同步',{exact:true}).waitFor();
 await popup.close();
 return {hostedPage:'reachable',googleAuthorization:'mocked',encryptedReturn:'passed',loginServiceRequired:false};
}
