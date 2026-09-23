import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDriveLogin,finishDriveLogin,cancelDriveLogin} from '../app/lib/drive-auth.ts';
const encode=b=>Buffer.from(b).toString('base64url');
async function packet(url,stateOverride){
 const request=JSON.parse(Buffer.from(new URL(url).hash.slice(1),'base64url').toString());
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveKey']);
 const pub=await crypto.subtle.importKey('jwk',request.pub,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const key=await crypto.subtle.deriveKey({name:'ECDH',public:pub},pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(request.state)},key,new TextEncoder().encode(JSON.stringify({access_token:'test-token',expires_in:3600})));
 return encode(JSON.stringify({state:stateOverride||request.state,pub:await crypto.subtle.exportKey('jwk',pair.publicKey),iv:encode(iv),data:encode(data)}));
}
test('Browser authorization accepts only its encrypted one-time result',async()=>{
 const url=await startDriveLogin('test.apps.googleusercontent.com');
 assert.equal(new URL(url).origin,'https://mu-wan.github.io');
 await assert.rejects(()=>finishDriveLogin('bad'),/./);
 await assert.rejects(async()=>finishDriveLogin(await packet(url,'wrong-state')),/本次连接/);
 const code=await packet(url);
 const result=await finishDriveLogin('papery://drive-auth#'+code);
 assert.equal(result.access_token,'test-token');
 await assert.rejects(()=>finishDriveLogin(code),/过期/);
});
test('Cancelled or superseded authorization cannot connect',async()=>{
 const old=await startDriveLogin('test.apps.googleusercontent.com');
 await startDriveLogin('test.apps.googleusercontent.com');
 await assert.rejects(async()=>finishDriveLogin(await packet(old)),/本次连接/);
 cancelDriveLogin();
 await assert.rejects(async()=>finishDriveLogin(await packet(old)),/过期/);
 await assert.rejects(()=>startDriveLogin('not-a-client'),/客户端/);
});
