const $=id=>document.getElementById(id);
const enc=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const dec=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const encoder=new TextEncoder();
let request;
try{
 request=JSON.parse(new TextDecoder().decode(dec(location.hash.slice(1))));
 history.replaceState(null,'',location.pathname);
 if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(request.clientId)||!/^[\w-]{43}$/.test(request.state)||request.pub?.crv!=='P-256')throw Error();
 $('client').textContent=`客户端：${request.clientId}`;
 const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='no-referrer';
 script.onerror=()=>{$('status').textContent='无法加载 Google，请检查网络后从阅读器重新连接。'};
 script.onload=()=>{
  const client=google.accounts.oauth2.initTokenClient({client_id:request.clientId,scope:'https://www.googleapis.com/auth/drive.appdata',include_granted_scopes:false,
   error_callback:()=>{$('status').textContent='登录窗口未能完成授权，可以再次点击连接。';$('connect').disabled=false},
   callback:async(response)=>{try{
    if(response.error||!response.access_token)throw Error(response.error||'授权未完成');
    if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.appdata'))throw Error('未授予 Drive 应用数据权限，请重新授权');
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
    const appKey=await crypto.subtle.importKey('jwk',request.pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const key=await crypto.subtle.deriveKey({name:'ECDH',public:appKey},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(request.state)},key,encoder.encode(JSON.stringify({access_token:response.access_token,expires_in:Number(response.expires_in)})));
    const packet=enc(encoder.encode(JSON.stringify({state:request.state,pub:await crypto.subtle.exportKey('jwk',pair.publicKey),iv:enc(iv),data:enc(new Uint8Array(data))})));
    $('code').value=packet;$('return').href=`papery://drive-auth#${packet}`;$('result').hidden=false;$('connect').hidden=true;$('status').textContent='授权完成，请点击“返回 Papery 完成连接”。';
   }catch(error){$('status').textContent=`连接未完成：${error.message}`;$('connect').disabled=false}}
  });
  $('connect').disabled=false;$('status').textContent='点击下方按钮，选择 Google 账号并允许访问 Papery 应用数据。';
  $('connect').onclick=()=>{$('connect').disabled=true;client.requestAccessToken({prompt:'consent'})};
 };
 document.head.appendChild(script);
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);$('copy').textContent='已复制，请返回阅读器'}catch{$('code').select();$('status').textContent='请手动复制选中的连接码。'}};
}catch{$('status').textContent='请从 Papery 阅读器的 Google Drive 同步面板发起连接。直接打开此页面无法授权。';$('connect').hidden=true}
