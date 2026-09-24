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
 script.onerror=()=>{$('status').className='status warn';$('status').textContent='无法加载 Google 授权组件，请检查网络后重新连接。'};
 script.onload=()=>{
  const client=google.accounts.oauth2.initTokenClient({client_id:request.clientId,scope:'https://www.googleapis.com/auth/drive.appdata',include_granted_scopes:false,
   error_callback:(error)=>{$('status').className='status warn';$('status').textContent=error?.type==='popup_failed_to_open'?'浏览器拦截了授权窗口，请允许弹出窗口后再试。':'Google 没有接受当前网页来源。请把 https://mu-wan.github.io 原样加入“已获授权的 JavaScript 来源”，不要加项目路径。';$('connect').disabled=false},
   callback:async(response)=>{try{
    if(response.error||!response.access_token)throw Error(response.error||'授权未完成');
    if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.appdata'))throw Error('未授予 Drive 应用数据权限，请重新授权');
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
    const appKey=await crypto.subtle.importKey('jwk',request.pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const key=await crypto.subtle.deriveKey({name:'ECDH',public:appKey},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(request.state)},key,encoder.encode(JSON.stringify({access_token:response.access_token,expires_in:Number(response.expires_in)})));
    const packet=enc(encoder.encode(JSON.stringify({state:request.state,pub:await crypto.subtle.exportKey('jwk',pair.publicKey),iv:enc(iv),data:enc(new Uint8Array(data))})));
    $('code').value=packet;$('return').href=`papery://drive-auth#${packet}`;$('result').hidden=false;$('connect').hidden=true;$('status').className='status ok';$('status').textContent='Google 授权完成，请点击“返回 Papery 完成连接”。';
   }catch(error){$('status').className='status warn';$('status').textContent=`连接未完成：${error.message}`;$('connect').disabled=false}}
  });
  $('connect').disabled=false;$('status').className='status';$('status').textContent='准备好了。点击下方按钮，选择 Google 账号并允许访问 Papery 应用数据。';
  $('connect').onclick=()=>{$('connect').disabled=true;client.requestAccessToken({prompt:'consent'})};
 };
 document.head.appendChild(script);
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);$('copy').textContent='已复制，请返回阅读器'}catch{$('code').select();$('status').textContent='请手动复制选中的连接码。'}};
}catch{$('status').className='status warn';$('status').textContent='请从 Papery 阅读器的 Google Drive 同步面板发起连接。直接打开此页面无法授权。';$('connect').hidden=true}
