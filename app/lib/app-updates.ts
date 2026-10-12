export type UpdatePlatform = "windows-x64" | "android-arm64";
export type UpdateSource = "Gitee" | "GitHub";
export type AppRelease = { version: string; notes: string; source: UpdateSource; page: string; downloads: Partial<Record<UpdatePlatform,string>>; hashes:Partial<Record<UpdatePlatform,string>>; checksums?:string };
export const UPDATE_SOURCES = [
  { name: "Gitee" as const, url: "https://gitee.com/api/v5/repos/mu-wan/papery-epub-reader/releases?per_page=20" },
  { name: "GitHub" as const, url: "https://api.github.com/repos/Mu-Wan/papery-epub-reader/releases?per_page=20" },
];
const MAX_BYTES = 512 * 1024;
type Row = Record<string,unknown>;
const row = (value:unknown):Row => value && typeof value==="object" && !Array.isArray(value) ? value as Row : {};
export function releaseVersion(tag:unknown):string|null {
  if(typeof tag!=="string")return null;
  const match=/^(?:papery-)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  return match&&match.slice(1).every(n=>Number.isSafeInteger(Number(n))) ? match.slice(1).join(".") : null;
}
export function compareVersions(a:string,b:string):number {
  const left=releaseVersion(a),right=releaseVersion(b);
  if(!left||!right)throw new Error("版本格式无效");
  const x=left.split(".").map(Number),y=right.split(".").map(Number);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
function trustedUrl(value:unknown,source:UpdateSource):string|null {
  if(typeof value!=="string")return null;
  try { const u=new URL(value),base=source==="Gitee"?"gitee.com":"github.com";
    const path=source==="Gitee"?"/mu-wan/papery-epub-reader/":"/Mu-Wan/papery-epub-reader/";
    if(u.protocol!=="https:"||u.hostname!==base||u.port||u.username||u.password||!u.pathname.toLowerCase().startsWith(path.toLowerCase()))return null;
    return u.href;
  }catch{return null;}
}
export function parseReleases(input:unknown,source:UpdateSource):AppRelease[] {
  if(!Array.isArray(input))throw new Error("更新源返回格式无效");
  const result:AppRelease[]=[];
  for(const item of input){
    const release=row(item),version=releaseVersion(release.tag_name);
    if(!version||release.draft||release.prerelease)continue;
    const page=trustedUrl(release.html_url,source)||`https://${source==="Gitee"?"gitee.com/mu-wan":"github.com/Mu-Wan"}/papery-epub-reader/releases/tag/${encodeURIComponent(String(release.tag_name))}`;
    const assets=Array.isArray(release.assets)?release.assets:row(release.assets).links;
    const downloads:AppRelease["downloads"]={},hashes:AppRelease["hashes"]={};let checksums:string|undefined;
    for(const value of Array.isArray(assets)?assets:[]){
      const asset=row(value),name=typeof asset.name==="string"?asset.name:"",url=trustedUrl(asset.browser_download_url??asset.url,source);
      if(url){try{const parts=new URL(url).pathname.split("/");if(decodeURIComponent(parts.at(-1)!)!==name||decodeURIComponent(parts.at(-2)!)!==release.tag_name||!new URL(url).pathname.includes("/releases/download/"))continue;}catch{continue;}}
      if(url&&name==="SHA256SUMS.txt")checksums=url;
      if(!url||!name.startsWith(`Papery-${version}-`)&&!name.startsWith(`Papery-Reader-${version}-`))continue;
      const target=/-Windows-x64-Setup\.exe$/.test(name)?"windows-x64":/-Android-arm64\.apk$/.test(name)?"android-arm64":null;
      if(target){downloads[target]=url;const digest=typeof asset.digest==="string"&&/^sha256:[0-9a-f]{64}$/i.test(asset.digest)?asset.digest.slice(7).toLowerCase():null;if(digest)hashes[target]=digest;}
    }
    result.push({version,source,page,downloads,hashes,checksums,notes:typeof release.body==="string"?release.body.slice(0,16000):""});
  }
  return result.sort((a,b)=>compareVersions(b.version,a.version));
}
export async function readUpdateJson(response:Response):Promise<unknown>{
  if(!response.ok)throw new Error(`更新源暂不可用（${response.status}）`);
  if(Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("更新信息过大");
  if(!response.body)throw new Error("更新信息为空");
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error("更新信息过大");parts.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function publicUpdateFetch(url:string,init:RequestInit):Promise<Response>{
  if(typeof window!=="undefined"&&"__TAURI_INTERNALS__" in window){const {fetch}=await import("@tauri-apps/plugin-http");return fetch(url,{...init,connectTimeout:8000});}
  return fetch(url,init);
}
export async function checkAppUpdate(platform:UpdatePlatform|null,fetcher:(url:string,init:RequestInit)=>Promise<Response>=publicUpdateFetch,timeoutMs=10000):Promise<AppRelease>{
  for(const source of UPDATE_SOURCES){
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const request=(async()=>{const response=await fetcher(source.url,{signal:controller.signal,headers:{Accept:"application/json"},credentials:"omit",cache:"no-store"});const releases=parseReleases(await readUpdateJson(response),source.name);const found=releases.find(release=>platform?!!release.downloads[platform]:Object.keys(release.downloads).length>0);if(!found)throw new Error("暂无可用安装包");return found})();
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("连接超时"))},timeoutMs)});
      return await Promise.race([request,timeout]);
    }catch{/* A failed or malformed mirror falls back to the official origin. */}finally{if(timer)clearTimeout(timer);controller.abort()}
  }
  throw new Error("暂时无法检查更新，请确认网络后重试。书库与阅读不受影响。");
}
export function parseInstallerHash(text:string,fileName:string):string{
  const line=text.split(/\r?\n/).find(line=>line.replace(/^[a-f\d]{64}\s+\*?/i,"").trim()===fileName);
  const match=line&&/^([a-f\d]{64})\s+/i.exec(line);
  if(!match)throw new Error("此安装包尚未提供有效校验，请稍后重新检查更新。");return match[1].toLowerCase();
}
export async function updateInstallerHash(release:AppRelease,platform:UpdatePlatform,signal:AbortSignal):Promise<string>{
  if(release.hashes[platform])return release.hashes[platform]!;
  if(!release.checksums||!release.downloads[platform])throw new Error("此版本尚未提供完整安装包，请稍后重试。");
  const response=await publicUpdateFetch(release.checksums,{signal,credentials:"omit",cache:"no-store"});
  if(!response.ok||!response.body)throw new Error("无法读取安装包信息，请重试。");
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw new Error("安装包信息无效");parts.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const data=new Uint8Array(size);let at=0;for(const p of parts){data.set(p,at);at+=p.length;}
  return parseInstallerHash(new TextDecoder().decode(data),decodeURIComponent(new URL(release.downloads[platform]!).pathname.split("/").pop()!));
}
export function deviceUpdatePlatform(ua:string):UpdatePlatform|null{
  if(/Android/i.test(ua))return "android-arm64";
  if(/Windows/i.test(ua)&&!/(?:ARM|aarch64)/i.test(ua))return "windows-x64";
  return null;
}
export function plainReleaseNotes(notes:string):string{
  return notes.replace(/!\[[^\]]*\]\([^)]*\)/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/^#{1,6}\s+/gm,"").replace(/\*\*|__/g,"").replace(/<[^>]*>/g,"").trim();
}
