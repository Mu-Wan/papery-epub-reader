import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { releaseVersion,compareVersions,parseReleases,readUpdateJson,checkAppUpdate,deviceUpdatePlatform,plainReleaseNotes,parseInstallerHash } from "../app/lib/app-updates.ts";
const gitee="https://gitee.com/mu-wan/papery-epub-reader/releases/download/",github="https://github.com/Mu-Wan/papery-epub-reader/releases/download/";
const release=(version="0.1.53",base=gitee)=>({tag_name:`papery-v${version}`,body:"更新内容",assets:[{name:`Papery-${version}-Windows-x64-Setup.exe`,browser_download_url:`${base}papery-v${version}/Papery-${version}-Windows-x64-Setup.exe`},{name:`Papery-${version}-Android-arm64.apk`,browser_download_url:`${base}papery-v${version}/Papery-${version}-Android-arm64.apk`}]});
test("Checksum manifests match exact installer names; unrelated entries cannot validate a download",()=>{
 const hash="ab".repeat(32),name="Papery-0.1.53-Android-arm64.apk";
 assert.equal(parseInstallerHash(`${hash}  ${name}\r\n`,name),hash);assert.equal(parseInstallerHash(`${hash} *${name}\n`,name),hash);assert.throws(()=>parseInstallerHash(`${hash}  wrong.apk`,name),/尚未提供/);
});
test("Numeric stable versions ignore historic v1 tags with no Papery installer and reject prereleases",()=>{
 assert.equal(releaseVersion("papery-v0.1.53"),"0.1.53");assert.equal(compareVersions("0.1.9","0.1.50"),-1);assert.equal(compareVersions("0.2.0","0.1.99"),1);
 for(const value of ["v0.01.2","0.1.53-beta","garbage","0.1.53.1","9999999999999999999.1.2"])assert.equal(releaseVersion(value),null);
 const result=parseReleases([release("0.1.9"),{...release("0.1.54"),prerelease:true},{...release("0.1.55"),draft:true},release()],"Gitee");assert.deepEqual(result.map(r=>r.version),["0.1.53","0.1.9"]);
});
test("Only correct official HTTPS installers are selected; filenames must match exact release",()=>{
 const r=release();r.assets.push({name:"Papery-0.1.53-Android-arm64.apk",browser_download_url:"https://evil.test/file.apk"},{name:"Papery-0.1.53-Windows-x64-Setup.exe",browser_download_url:`https://user:secret@gitee.com/mu-wan/papery-epub-reader/file.exe`},{name:"Papery-0.1.530-Windows-x64-Setup.exe",browser_download_url:`${gitee}papery-v0.1.53/wrong.exe`});
 const selected=parseReleases([r],"Gitee")[0];assert.equal(selected.downloads["android-arm64"],r.assets[1].browser_download_url);assert.equal(selected.downloads["windows-x64"],r.assets[0].browser_download_url);
 assert.throws(()=>parseReleases({message:"rate limited"},"GitHub"));
});
test("Gitee and GitHub public API formats map to platform installers",async()=>{
 const fixture=JSON.parse(await readFile(new URL("./fixtures/gitee-release.json",import.meta.url),"utf8"));
 const parsed=parseReleases(fixture,"Gitee")[0];assert.equal(parsed.version,"0.1.50");assert.match(parsed.downloads["windows-x64"],/\.exe$/);assert.match(parsed.downloads["android-arm64"],/\.apk$/);
 assert.equal(parseReleases([release("0.1.53",github)],"GitHub")[0].source,"GitHub");
});
test("Timeout, malformed 200 response, unavailable metadata and missing installer fall back",async()=>{
 for(const mode of ["timeout","html","404","empty","no-installer"]){let calls=0;
 const result=await checkAppUpdate("android-arm64",async()=>{calls++;if(calls===2)return Response.json([release("0.1.53",github)]);if(mode==="timeout")return new Promise(()=>{});if(mode==="html")return new Response("<html>login</html>");if(mode==="404")return new Response("missing",{status:404});if(mode==="no-installer")return Response.json([{...release(),assets:[]}]);return Response.json([])},15);
 assert.equal(result.source,"GitHub");assert.equal(calls,2);
 }
});
test("Two failed sources report an error, never latest; bounded metadata rejects declared and streaming oversize",async()=>{
 await assert.rejects(()=>checkAppUpdate("windows-x64",async()=>new Response("error",{status:503})),/无法检查更新/);
 await assert.rejects(()=>readUpdateJson(new Response("[]",{headers:{"Content-Length":"9999999"}})),/过大/);
 await assert.rejects(()=>readUpdateJson(new Response("x".repeat(512*1024+1))),/过大/);
});
test("Device mapping avoids wrong desktop architecture; notes are plain text",()=>{
 assert.equal(deviceUpdatePlatform("Android 16; SM-X710"),"android-arm64");assert.equal(deviceUpdatePlatform("Windows NT 10.0; Win64; x64"),"windows-x64");assert.equal(deviceUpdatePlatform("Windows NT 10.0; ARM64"),null);assert.equal(deviceUpdatePlatform("Macintosh"),null);
 assert.equal(plainReleaseNotes("## 更新\n**改进** [阅读](https://a.test) <script>bad</script>"),"更新\n改进 阅读 bad");
});
