export const DRIVE_AUTH_PAGE="https://mu-wan.github.io/papery-epub-reader/drive-auth.html?v=0.1.6";
export const DRIVE_AUTH_ORIGIN="https://mu-wan.github.io";
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(text:string)=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const text=new TextEncoder();
let pending:{state:string;key:CryptoKey;expires:number}|null=null;
export function cancelDriveLogin(){pending=null}
export async function startDriveLogin(clientId:string){
  if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId.trim()))throw new Error('请填写 Google Web 应用客户端 ID');
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
  const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const state=encode(crypto.getRandomValues(new Uint8Array(32)));
  pending={state,key:pair.privateKey,expires:Date.now()+600000};
  return `${DRIVE_AUTH_PAGE}#${encode(text.encode(JSON.stringify({clientId:clientId.trim(),state,pub})))}`;
}
export async function finishDriveLogin(input:string){
  if(!pending||pending.expires<Date.now()){pending=null;throw new Error('授权已过期或不属于本次连接，请重新点击“使用 Google 连接”');}
  let raw=input.trim();
  if(raw.startsWith('papery://')){const url=new URL(raw);if(url.hostname!=='drive-auth')throw new Error('无效的授权返回地址');raw=url.hash.slice(1);}
  if(raw.length>16000)throw new Error('授权结果无效');
  const envelope=JSON.parse(new TextDecoder().decode(decode(raw)));
  const session=pending;
  if(envelope.state!==session.state)throw new Error('授权结果不属于本次连接，请重新连接');
  const pub=await crypto.subtle.importKey('jwk',envelope.pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const key=await crypto.subtle.deriveKey({name:'ECDH',public:pub},session.key,{name:'AES-GCM',length:256},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:text.encode(session.state)},key,decode(envelope.data));
  const result=JSON.parse(new TextDecoder().decode(plain));
  if(typeof result.access_token!=='string'||!result.access_token||!Number.isFinite(result.expires_in)||result.expires_in<=0)throw new Error('Google 返回了无效的授权结果');
  if(pending!==session)throw new Error('授权已取消，请重新连接');
  pending=null;
  return {access_token:result.access_token,expires_in:Math.min(result.expires_in,3600)};
}
