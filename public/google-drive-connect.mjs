const $=id=>document.getElementById(id);
const enc=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const dec=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
const encoder=new TextEncoder();
const setStatus=(message,state='')=>{$('status').textContent=message;$('status').className=state};
const connect=$('connect');
let request;
let tokenClient;
let promptOpen=false;
let finishing=false;

async function finish(response){
  if(finishing)return;
  finishing=true;
  try{
    if(response.error||!response.access_token)throw new Error(response.error||'Google 授权没有完成。');
    if(!google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.appdata'))throw new Error('尚未授予 Papery 所需的 Drive 应用数据权限，请重新授权。');
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
    const appKey=await crypto.subtle.importKey('jwk',request.pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const key=await crypto.subtle.deriveKey({name:'ECDH',public:appKey},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const expiresIn=Number(response.expires_in);
    if(!Number.isFinite(expiresIn)||expiresIn<=0)throw new Error('Google 返回了无效的授权期限，请重新连接。');
    const payload=JSON.stringify({access_token:response.access_token,expires_in:expiresIn});
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(request.state)},key,encoder.encode(payload));
    const packet=enc(encoder.encode(JSON.stringify({state:request.state,pub:await crypto.subtle.exportKey('jwk',pair.publicKey),iv:enc(iv),data:enc(new Uint8Array(data))})));
    $('code').value=packet;
    $('return').href='papery://drive-auth#'+packet;
    $('result').hidden=false;
    connect.hidden=true;
    $('connect-title').textContent='Google 授权已完成';
    $('main-hint').remove();
    setStatus('连接信息已加密，可以安全返回 Papery。','ok');
    window.setTimeout(()=>{window.location.href=$('return').href},650);
  }catch(error){
    promptOpen=false;
    finishing=false;
    connect.disabled=false;
    setStatus(error instanceof Error?error.message:'连接未完成，请重新授权。','warn');
  }
}

function openGoogle(){
  if(!tokenClient||promptOpen)return;
  promptOpen=true;
  connect.disabled=true;
  setStatus('正在打开 Google 官方账号窗口…');
  try{
    tokenClient.requestAccessToken({prompt:'select_account'});
  }catch{
    promptOpen=false;
    connect.disabled=false;
    setStatus('没有打开 Google 授权窗口。请允许浏览器弹出窗口后重试。','warn');
  }
}

try{
  const raw=location.hash.slice(1);
  history.replaceState(null,'',location.pathname+location.search);
  if(!raw||raw.length>6000)throw new Error('请从 Papery 阅读器的同步面板发起连接。');
  request=JSON.parse(new TextDecoder().decode(dec(raw)));
  const validClient=typeof request.clientId==='string'&&/^[\w-]+\.apps\.googleusercontent\.com$/.test(request.clientId);
  const validState=typeof request.state==='string'&&/^[\w-]{43}$/.test(request.state);
  const validKey=request.pub?.kty==='EC'&&request.pub?.crv==='P-256'&&/^[A-Za-z0-9_-]{43}$/.test(request.pub?.x||'')&&/^[A-Za-z0-9_-]{43}$/.test(request.pub?.y||'');
  if(!validClient||!validState||!validKey)throw new Error('连接请求无效或已过期，请回到 Papery 重新发起。');
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';
  script.async=true;
  script.referrerPolicy='no-referrer';
  script.onerror=()=>{connect.disabled=true;setStatus('无法连接 Google 授权服务。请检查网络后回到 Papery 重试。','warn')};
  script.onload=()=>{
    try{
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:request.clientId,
        scope:'https://www.googleapis.com/auth/drive.appdata',
        include_granted_scopes:false,
        error_callback:error=>{
          promptOpen=false;
          connect.disabled=false;
          const message=error?.type==='popup_failed_to_open'
            ?'浏览器未打开 Google 授权窗口。请允许弹出窗口，再点“继续到 Google”。'
            :'Google 授权窗口未完成。可以重新选择账号，或检查 Google Cloud 中的来源设置。';
          setStatus(message,'warn');
        },
        callback:response=>{promptOpen=false;void finish(response)}
      });
      connect.disabled=false;
      setStatus('正在打开 Google 官方账号窗口；若未弹出，请点下方按钮继续。');
      window.setTimeout(openGoogle,0);
    }catch{
      connect.disabled=true;
      setStatus('无法准备 Google 授权。请检查客户端 ID 和网络连接。','warn');
    }
  };
  connect.addEventListener('click',openGoogle);
  document.head.appendChild(script);
}catch(error){
  connect.disabled=true;
  setStatus(error instanceof Error?error.message:'连接请求无效，请回到 Papery 重新发起。','warn');
}

window.addEventListener('focus',()=>{
  if(!promptOpen||finishing)return;
  window.setTimeout(()=>{
    if(promptOpen&&!finishing){
      promptOpen=false;
      connect.disabled=false;
      setStatus('Google 授权窗口已关闭或尚未完成。准备好后可再次选择账号。','warn');
    }
  },700);
});

$('copy').addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText($('code').value);
    $('copy').textContent='已复制，回到 Papery 粘贴';
  }catch{
    $('code').focus();
    $('code').select();
    setStatus('已选中连接码，请复制后回到 Papery 粘贴。','warn');
  }
});
