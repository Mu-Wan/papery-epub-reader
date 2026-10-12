/** Gitee OpenAPI v5: https://gitee.com/api/v5/swagger */
import { readFile, stat } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const version = process.argv[2];
const checkOnly = version === '--check';
if (!checkOnly && !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('用法：node scripts/publish-gitee.mjs 0.1.53 [安装包目录]，或 --check');
  process.exit(1);
}
const base = 'https://gitee.com/api/v5/repos/mu-wan/papery-epub-reader';
let token = process.env.GITEE_TOKEN;
if (!token && process.platform === 'win32') {
  try {
    const credentialEnv = { ...process.env };
    // Windows PowerShell must resolve its own security module when called from pwsh 7.
    delete credentialEnv.PSModulePath;
    token = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference='Stop';$p=Join-Path $env:LOCALAPPDATA 'Papery/release/gitee-token.dpapi';$s=ConvertTo-SecureString ((Get-Content -LiteralPath $p -Raw -Encoding UTF8).Trim());$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}"
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env: credentialEnv }).trim();
  } catch { /* A missing credential is reported below without dumping output. */ }
}
if (!token) {
  console.error('尚未配置令牌。请运行 scripts/set-gitee-token.ps1，或设置 GITEE_TOKEN。');
  process.exit(1);
}

async function api(path, { method = 'GET', fields, file } = {}) {
  const url = new URL(`${base}${path}`);
  let body;
  if (method === 'GET') url.searchParams.set('access_token', token);
  else if (file) {
    body = new FormData();
    body.set('access_token', token);
    body.set('file', await openAsBlob(file), basename(file));
  } else body = new URLSearchParams({ ...fields, access_token: token });
  // Never print request URLs, bodies, or arbitrary API error responses containing credentials.
  let response;
  try { response = await fetch(url, { method, body, signal: AbortSignal.timeout(file ? 600000 : 45000) }); }
  catch { throw new Error(`Gitee 请求失败：${method} ${path}。请检查网络后重试。`); }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Gitee 返回 HTTP ${response.status}：${method} ${path}。`);
  return response.json();
}
async function digest(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function verifyAsset(asset, expectedHash, expectedSize) {
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:') throw new Error('附件下载地址必须使用 HTTPS。');
  const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`公开附件下载失败：HTTP ${response.status}。`);
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
  if (size !== expectedSize || hash.digest('hex') !== expectedHash) throw new Error(`附件校验失败：${asset.name}。`);
}

try {
  const repo = await api('');
  if (!repo) throw new Error('未找到 Papery Gitee 仓库。');
  if (checkOnly) console.log('令牌已读取，Papery 仓库 API 可访问。实际写入权限将在发行版上传时验证。');
  else {
  const dir = resolve(process.argv[3] || `output/release-${version}`);
  const names = [`Papery-${version}-Windows-x64-Setup.exe`, `Papery-${version}-Android-arm64.apk`, 'SHA256SUMS.txt'];
  const files = await Promise.all(names.map(async name => ({ name, path: join(dir, name), size: (await stat(join(dir, name))).size, hash: await digest(join(dir, name)) })));
  const sums = await readFile(join(dir, 'SHA256SUMS.txt'), 'utf8');
  for (const file of files.slice(0, 2)) {
    if (!sums.split(/\r?\n/).some(line => line.trim() === `${file.hash}  ${file.name}`)) throw new Error(`本地校验清单不匹配：${file.name}。`);
  }
  const notes = await readFile(join(dir, '更新汇总.md'), 'utf8');
  const tag = `papery-v${version}`;
  const remoteTag = execFileSync('git', ['ls-remote', 'gitee', `refs/tags/${tag}`], { encoding: 'utf8', windowsHide: true }).trim();
  if (!remoteTag) throw new Error(`Gitee 尚未同步标签 ${tag}，请先推送代码和标签。`);
  let release = await api(`/releases/tags/${encodeURIComponent(tag)}`);
  if (!release) release = await api('/releases', { method: 'POST', fields: { tag_name: tag, name: `Papery Reader ${version}`, body: notes, target_commitish: 'main', prerelease: 'false' } });
  if (!release?.id) throw new Error('发行版创建失败。');
  const assets = await api(`/releases/${release.id}/attach_files`) || [];
  for (const file of files) {
    const existing = assets.filter(asset => asset.name === file.name);
    if (existing.length > 1) throw new Error(`发行版中存在重名附件：${file.name}。请先人工检查。`);
    const asset = existing[0] || await api(`/releases/${release.id}/attach_files`, { method: 'POST', file: file.path });
    if (!asset?.browser_download_url) throw new Error(`附件上传失败：${file.name}。`);
    await verifyAsset(asset, file.hash, file.size);
    console.log(`已上传并通过公开下载校验：${file.name}`);
  }
  console.log(`Gitee 发行版已就绪：https://gitee.com/mu-wan/papery-epub-reader/releases/tag/${tag}`);
  }
} catch (error) {
  // All errors created above are controlled messages; do not leak fetch/exec error objects.
  const message = String(error?.message || '发布失败。').replaceAll(token, '[令牌已隐藏]');
  console.error(message); process.exitCode = 1;
}
