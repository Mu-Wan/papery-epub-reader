export type WebDavConfig = { url: string; folder: string; username: string; password: string; autoSync: boolean; remember: boolean };
export type DavFetch = (url: string, init: RequestInit) => Promise<Response>;
const PROPS = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>';
export const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;

export function davRoot(config: Pick<WebDavConfig, "url" | "folder">): string {
  let url: URL;
  try { url = new URL(config.url.trim()); } catch { throw new Error("请填写完整的 WebDAV 地址"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("WebDAV 地址需使用 HTTP 或 HTTPS，且不包含账号、查询参数或片段");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const parts = (config.folder.trim() || "Papery").split("/").filter(Boolean).map(part => {
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { throw new Error("同步文件夹名称无效"); }
    if ([".", ".."].includes(decoded) || /[\\/\u0000-\u001f]/.test(decoded)) throw new Error("同步文件夹名称无效");
    return encodeURIComponent(decoded);
  });
  if (!parts.length) throw new Error("请填写独立的同步文件夹名称");
  return url.href + parts.join("/") + "/";
}

export function davAuthorization(username: string, password: string): string {
  if (!username.trim() || username.includes(":") || /[\r\n]/.test(username)) throw new Error("请填写有效的 WebDAV 用户名");
  const bytes = new TextEncoder().encode(`${username.trim()}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

/** Only immediate DAV children of this collection can become request targets. */
export function parseDavListing(xml: string, directory: string): string[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("服务器返回的目录格式不正确");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "multistatus" || doc.documentElement.namespaceURI !== "DAV:") throw new Error("服务器没有返回有效的 WebDAV 目录");
  const base = new URL(directory), names = new Set<string>();
  for (const node of Array.from(doc.getElementsByTagNameNS("DAV:", "response"))) {
    const successful = Array.from(node.getElementsByTagNameNS("DAV:", "propstat")).filter(p => /\s2\d\d(?:\s|$)/.test(p.getElementsByTagNameNS("DAV:", "status")[0]?.textContent || ""));
    if (!successful.length || successful.some(p => p.getElementsByTagNameNS("DAV:", "collection").length)) continue;
    const href = node.getElementsByTagNameNS("DAV:", "href")[0]?.textContent?.trim();
    if (!href) continue;
    let url: URL;
    try { url = new URL(href, base); } catch { continue; }
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) continue;
    let name: string;
    try { name = decodeURIComponent(url.pathname.slice(base.pathname.length)); } catch { continue; }
    if (!name || /[\\/\u0000-\u001f]/.test(name) || name === "." || name === "..") continue;
    names.add(name);
  }
  return [...names].sort();
}

export async function readDavBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("同步文件超过允许大小，本地数据已保留"); }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.length;
      if (size > maxBytes) throw new Error("同步文件超过允许大小，本地数据已保留");
      parts.push(result.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export class WebDavClient {
  readonly root: string;
  private readonly auth: string;
  private readonly folders: string[];
  private readonly fetcher: DavFetch;
  constructor(config: WebDavConfig, fetcher: DavFetch) {
    this.fetcher = fetcher;
    this.root = davRoot(config); this.auth = davAuthorization(config.username, config.password);
    const endpoint = new URL(config.url.trim()); if (!endpoint.pathname.endsWith("/")) endpoint.pathname += "/";
    const suffix = this.root.slice(endpoint.href.length).split("/").filter(Boolean);
    this.folders = suffix.map((_, index) => endpoint.href + suffix.slice(0, index + 1).join("/") + "/");
  }
  private url(path: string): string {
    if (path.split("/").some(part => part === ".." || part === ".") || /[?#\\]/.test(path)) throw new Error("同步路径无效");
    return this.root + path.split("/").map(encodeURIComponent).join("/");
  }
  private async request<T>(method: string, path: string, body: BodyInit | undefined, headers: Record<string, string>, accept: number[], consume: (response: Response) => Promise<T>, target = this.url(path)): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ["GET", "PUT"].includes(method) ? 180_000 : 20_000);
    try {
      const response = await this.fetcher(target, { method, body, headers: { ...headers, Authorization: this.auth }, signal: controller.signal, redirect: "error", credentials: "omit", cache: "no-store" });
      if (!accept.includes(response.status)) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw new Error("账号、密码错误或没有访问权限");
        if ([301, 302, 307, 308].includes(response.status)) throw new Error("服务器地址发生跳转，请填写跳转后的完整 WebDAV 地址");
        if (response.status === 404) throw new Error("WebDAV 目录或同步文件不存在，请检查地址");
        if (response.status === 507) throw new Error("WebDAV 存储空间不足，本地数据已保留");
        throw new Error(`WebDAV 请求失败（${response.status}），本地数据已保留`);
      }
      return await consume(response);
    } catch (error) {
      if (controller.signal.aborted) throw new Error("WebDAV 连接超时，本地数据已保留");
      if (error instanceof TypeError || !(error instanceof Error)) throw new Error("连接失败，请检查服务器地址、网络和证书。浏览器版还需服务器允许跨域访问。");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async list(): Promise<string[]> { return this.request("PROPFIND", "", PROPS, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, [207], async r => parseDavListing(new TextDecoder().decode(await readDavBody(r, MAX_MANIFEST_BYTES)), this.root)); }
  async ensureFolders(): Promise<void> {
    const create = async (url: string) => {
      const status = await this.request("MKCOL", "", undefined, {}, [201, 405], async r => { await r.body?.cancel(); return r.status; }, url);
      if (status === 405) await this.request("PROPFIND", "", PROPS, { Depth: "0", "Content-Type": "application/xml; charset=utf-8" }, [207], async r => {
        const xml = new TextDecoder().decode(await readDavBody(r, MAX_MANIFEST_BYTES));
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("服务器返回的目录格式不正确");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const valid = Array.from(doc.getElementsByTagNameNS("DAV:", "propstat")).some(p => /\s2\d\d(?:\s|$)/.test(p.getElementsByTagNameNS("DAV:", "status")[0]?.textContent || "") && p.getElementsByTagNameNS("DAV:", "collection").length);
        if (!valid) throw new Error("同步路径不存在或已被同名文件占用");
      }, url);
    };
    for (const folder of this.folders) await create(folder);
    await create(this.root + "books/");
  }
  async exists(path: string): Promise<boolean> { return this.request("HEAD", path, undefined, {}, [200, 404], async r => { await r.body?.cancel(); return r.status === 200; }); }
  async get(path: string, maxBytes: number): Promise<Uint8Array> { return this.request("GET", path, undefined, {}, [200], r => readDavBody(r, maxBytes)); }
  async put(path: string, body: Blob | string): Promise<boolean> { return this.request("PUT", path, body, { "Content-Type": typeof body === "string" ? "application/json; charset=utf-8" : "application/octet-stream", "If-None-Match": "*" }, [200, 201, 204, 412], async r => { await r.body?.cancel(); return r.status !== 412; }); }
  async remove(path: string): Promise<void> { await this.request("DELETE", path, undefined, {}, [200, 204, 404], async r => { await r.body?.cancel(); }); }
}
