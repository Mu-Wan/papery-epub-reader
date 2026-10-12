import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { WebDavClient, davRoot, davAuthorization, parseDavListing, readDavBody } from "../app/lib/webdav-client.ts";
import { runWebDavSync, DAV_CHUNK_SIZE } from "../app/lib/webdav-engine.ts";
import { mergeSnapshots, validateSnapshot } from "../app/lib/sync-merge.ts";
import { resolveReaderPreferences } from "../app/lib/reader-preferences.ts";
import { defaultReaderSettings } from "../app/lib/reader-types.ts";
import { epubNavigation } from "../app/lib/epub-navigation.ts";
globalThis.DOMParser = new JSDOM("").window.DOMParser;
const config = { url:"https://nas.test/dav/",folder:"Papery",username:"读者",password:"应用密码",remember:false,autoSync:false };
const empty = () => ({format:"papery-backup",version:1,exportedAt:"",books:[],annotations:[],settings:[],categories:[],sessions:[],tombstones:{}});
const xml = (href,collection=false,status=200) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype>${collection?"<d:collection/>":""}</d:resourcetype></d:prop><d:status>HTTP/1.1 ${status} OK</d:status></d:propstat></d:response>`;
const multistatus = items => `<d:multistatus xmlns:d="DAV:">${items}</d:multistatus>`;
function server(){
 const files=new Map(),folders=new Set(["/dav/"]),calls=[];
 const fetcher=async(url,init)=>{
  const path=new URL(url).pathname;calls.push({path,method:init.method,headers:init.headers});
  assert.equal(init.headers.Authorization,davAuthorization(config.username,config.password));assert.equal(init.redirect,"error");
  const response=(status,body)=>new Response(body,{status});
  if(init.method==="MKCOL"){if(folders.has(path)||files.has(path.replace(/\/$/,"")))return response(405);if(!folders.has(path.replace(/[^/]+\/$/,"")))return response(409);folders.add(path);return response(201);}
  if(init.method==="PROPFIND"){if(!folders.has(path))return response(404);const children=init.headers.Depth==="0"?[]:[...files.keys()].filter(key=>key.startsWith(path)&&!key.slice(path.length).includes("/"));return response(207,multistatus(xml(path,true)+children.map(key=>xml(key)).join("")));}
  if(init.method==="HEAD")return response(files.has(path)?200:404);
  if(init.method==="GET")return response(files.has(path)?200:404,files.get(path));
  if(init.method==="PUT"){assert.equal(init.headers["If-None-Match"],"*");if(files.has(path))return response(412);files.set(path,typeof init.body==="string"?init.body:new Uint8Array(await init.body.arrayBuffer()));return response(201);}
  if(init.method==="DELETE"){files.delete(path);return response(204);}
  throw Error(init.method);
 };
 return {files,folders,calls,client:new WebDavClient(config,fetcher),fetcher};
}
function device(id,server,initial=empty(),blobs=new Map()){
 let snapshot=initial,localBlobs=blobs,applied=0;
 return {get snapshot(){return snapshot},get blobs(){return localBlobs},get applied(){return applied},edit:fn=>{snapshot=fn(snapshot)},sync:()=>runWebDavSync({client:server.client,deviceId:id,readLocal:async()=>({snapshot:structuredClone(snapshot),blobs:localBlobs}),applyLocal:async(next,nextBlobs)=>{snapshot=next;localBlobs=nextBlobs;applied++},merge:mergeSnapshots,validate:validateSnapshot},()=>{})};
}
const book = (id,time=10) => ({id,title:`书${id}`,author:"作者",format:"TXT",category:"未分类",progress:0,updatedAt:time,blob:"data:application/octet-stream;base64,"});
test("EPUB without a navigation document retains chapter navigation; nested IDs stay distinct",()=>{
 const toc=epubNavigation([],[{id:"cover",linear:"no"},{id:"chapter.xhtml"},{href:"part-two.xhtml"}]);assert.equal(toc.length,2);assert.equal(JSON.parse(toc[1].locator).href,"part-two.xhtml");
 const nested=epubNavigation([{label:"父节点",subitems:[{id:"same",href:"a",label:"A"}]},{href:"b",id:"same",label:"B"}],[]);assert.equal(new Set(nested.map(t=>t.id)).size,2);assert.equal(nested[0].level,1);
});
test("Reader defaults inherit into new books; shared typography wins and mobile does not mutate desktop",()=>{
 const profile={...defaultReaderSettings,fontSize:25,spread:"double",flow:"scrolled"};
 assert.equal(resolveReaderPreferences(defaultReaderSettings,profile,null,"EPUB",false).fontSize,25);
 assert.equal(resolveReaderPreferences(defaultReaderSettings,profile,{fontSize:17},"TXT",false).fontSize,25);
 assert.equal(resolveReaderPreferences(defaultReaderSettings,profile,null,"EPUB",true).spread,"single");assert.equal(profile.spread,"double");
 const legacy=resolveReaderPreferences(defaultReaderSettings,null,{horizontalMargin:90,verticalMargin:40},"TXT",false);assert.equal(legacy.horizontalMargin,10);assert.equal(legacy.verticalMargin,5);
 const invalid=resolveReaderPreferences(defaultReaderSettings,null,{fontSize:NaN,lineHeight:Infinity,flow:"bad",pageColor:"bad",fontFamily:"bad"},"EPUB",false);assert.equal(invalid.fontSize,19);assert.equal(invalid.flow,"paginated");assert.equal(invalid.pageColor,defaultReaderSettings.pageColor);
});
test("DAV root preserves escaped endpoints and Unicode folders; rejects path traversal and embedded credentials",()=>{
 assert.equal(davRoot({url:"https://nas.test/a%20b",folder:"书库/备份"}),"https://nas.test/a%20b/%E4%B9%A6%E5%BA%93/%E5%A4%87%E4%BB%BD/");
 for(const folder of ["../x","%2E%2E","%2f","x\\y","/"])assert.throws(()=>davRoot({...config,folder}));
 for(const url of ["file:///x","https://user:pw@nas.test/","https://nas.test/?token=abc","bad"])assert.throws(()=>davRoot({...config,url}));
 assert.equal(Buffer.from(davAuthorization("读者","应用密码").slice(6),"base64").toString(),"读者:应用密码");assert.throws(()=>davAuthorization("user:other","pw"));
});
test("PROPFIND supports namespace aliases, ignores foreign/nested/failed responses and refuses entity declarations",()=>{
 const content=multistatus(xml("/dav/Papery/a.json")+xml("https://evil.test/dav/Papery/b.json")+xml("/dav/Papery/books/part.bin")+xml("/dav/Papery/no.json",false,404)+xml("/dav/Papery/%2Fescape")+xml("/dav/Papery/",true)).replaceAll("d:","x:").replace('xmlns:d=', 'xmlns:x=');
 assert.deepEqual(parseDavListing(content,config.url+config.folder+"/"),["a.json"]);
 assert.throws(()=>parseDavListing("<!DOCTYPE foo>"+content,config.url));assert.throws(()=>parseDavListing("<html/>",config.url));
});
test("Nested dedicated folders are created in order; a same-name file cannot be used as a collection",async()=>{
 const s=server();await new WebDavClient({...config,folder:"bookshelf/读书"},s.fetcher).ensureFolders();assert.ok(s.folders.has("/dav/bookshelf/%E8%AF%BB%E4%B9%A6/books/"));
 s.files.set("/dav/Papery",new Uint8Array([1]));await assert.rejects(s.client.ensureFolders(),/不存在/);
});
test("DAV failures preserve status meaning; bounded downloads cancel oversized bodies",async()=>{
 for(const [status,message]of [[401,/密码/],[403,/权限/],[507,/空间/],[302,/跳转/],[500,/500/]]){
  const client=new WebDavClient(config,async()=>new Response(null,{status}));await assert.rejects(client.list(),message);
 }
 const c=new WebDavClient(config,async()=>new Response(null,{status:412}));assert.equal(await c.put("a.json","{}"),false);
 await assert.rejects(readDavBody(new Response(new Uint8Array(9)),8),/超过/);
 await assert.rejects(readDavBody(new Response("x",{headers:{"content-length":"100"}}),8),/超过/);
 const network=new WebDavClient(config,async()=>{throw new TypeError("failed")});await assert.rejects(network.list(),/跨域/);
});
test("Two devices merge books/notes/preferences and incremental sync sends no unchanged book bytes",async()=>{
 const s=server(),a=empty();a.books=[book("a")];a.settings=[{key:"reader-defaults",value:{fontSize:25},updatedAt:9},{key:"sync:webdav-config",value:{password:"NEVER_UPLOAD"},updatedAt:99}];a.annotations=[{id:"note",bookId:"a",updatedAt:8}];
 const first=device("device-a",s,a,new Map([["a",new Blob(["中文正文"])]]));assert.equal((await first.sync()).uploadedParts,1);
 const second=device("device-b",s);await second.sync();assert.equal(await second.blobs.get("a").text(),"中文正文");assert.equal(second.snapshot.annotations.length,1);assert.equal(second.snapshot.settings[0].key,"reader-defaults");
 assert.equal((await first.sync()).uploadedParts,0);assert.ok(![...s.files.values()].some(v=>typeof v==="string"&&v.includes("NEVER_UPLOAD")));
 second.edit(next=>({...next,books:next.books.map(b=>({...b,progress:72,updatedAt:30}))}));await second.sync();await first.sync();assert.equal(first.snapshot.books[0].progress,72);
 first.edit(next=>({...next,books:next.books.map(b=>({...b,progress:12,updatedAt:40}))}));await first.sync();await second.sync();assert.equal(second.snapshot.books[0].progress,12);
});
test("Split transfers never send more than 4 MiB and reconstruct files exactly",async()=>{
 const s=server(),snapshot=empty(),bytes=new Uint8Array(DAV_CHUNK_SIZE+33);bytes.fill(37);bytes[bytes.length-1]=91;snapshot.books=[book("big")];
 const a=device("big-a",s,snapshot,new Map([["big",new Blob([bytes])]]));assert.equal((await a.sync()).uploadedParts,2);
 for(const value of s.files.values())if(typeof value!=="string")assert.ok(value.length<=DAV_CHUNK_SIZE);
 const b=device("big-b",s);await b.sync();assert.deepEqual(new Uint8Array(await b.blobs.get("big").arrayBuffer()),bytes);
});
test("Deletion tombstones converge without resurrecting books or notes",async()=>{
 const s=server(),initial=empty();initial.books=[book("a")];initial.annotations=[{id:"n",bookId:"a",updatedAt:9}];
 const a=device("a",s,initial,new Map([["a",new Blob(["a"])]])),b=device("b",s);await a.sync();await b.sync();
 b.edit(next=>({...next,books:[],tombstones:{"books:a":50}}));await b.sync();await a.sync();assert.equal(a.snapshot.books.length,0);assert.equal(a.snapshot.annotations.length,0);
});
test("Corrupted remote chunks fail before local apply or manifest publication",async()=>{
 const s=server(),initial=empty();initial.books=[book("a")];const a=device("a",s,initial,new Map([["a",new Blob(["source"])]]));await a.sync();
 const chunk=[...s.files.keys()].find(name=>name.endsWith(".bin"));s.files.set(chunk,new Uint8Array([1,2]));const before=s.files.size,b=device("b",s);
 await assert.rejects(b.sync(),/校验/);assert.equal(b.applied,0);assert.equal(s.files.size,before);
});
test("Edits during upload survive the final local merge and old versions are retained only for own device",async()=>{
 const s=server(),initial=empty();initial.books=[book("a")];const a=device("a",s,initial,new Map([["a",new Blob(["source"])]]));
 const put=s.client.put.bind(s.client);let changed=false;s.client.put=async(...args)=>{if(!changed){changed=true;a.edit(next=>({...next,books:next.books.map(b=>({...b,progress:77,updatedAt:90}))}))}return put(...args)};
 await a.sync();assert.equal(a.snapshot.books[0].progress,77);
 const b=device("b",s);await b.sync();for(let i=0;i<4;i++)await a.sync();
 assert.equal([...s.files.keys()].filter(name=>name.includes("v1-a-")).length,3);assert.equal([...s.files.keys()].filter(name=>name.includes("v1-b-")).length,1);
});
