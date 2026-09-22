"use client";

export function DriveSetupGuide({authUrl}:{authUrl:string}) {
  let callback="https://sync.example.com/callback";
  try { callback=new URL("/callback",authUrl).href; } catch {}
  return <details className="driveSetupGuide">
    <summary>只有客户端 ID 和密钥？按这里完成设置</summary>
    <p><strong>登录服务地址不是 Google 提供的。</strong>它是运行 Papery 登录服务的网站地址。当前版本采用自行部署方式，尚未提供公共登录服务；只有 ID 和密钥还不能连接。</p>
    <ol>
      <li><strong>确认 Google 客户端类型。</strong>在 Google Cloud 的 Google Auth Platform → 客户端，使用“Web 应用”类型。已创建桌面或 Android 类型时，另建一个 Web 客户端。启用 Google Drive API，在“数据访问权限”添加 <code>https://www.googleapis.com/auth/drive.appdata</code>；测试状态下，在“目标对象 / Audience”添加实际登录账号为测试用户。</li>
      <li><strong>部署随交付提供的登录服务。</strong>解压“Google 登录服务”压缩包，按其中 README 操作。需要一台可访问 Google 的服务器和指向它的域名。在服务的 .env 文件填写 <code>GOOGLE_CLIENT_ID</code>、<code>GOOGLE_CLIENT_SECRET</code> 和域名 <code>SYNC_DOMAIN</code>，然后运行 <code>docker compose up -d --build</code>。附带的 HTTPS 代理会申请证书，服务器须开放 80、443 端口。部署成功后的地址，例如 https://sync.example.com，就是下方需要填写的“登录服务地址”。</li>
      <li><strong>填写 Google 回调地址。</strong>进入 Web 客户端的“已获授权的重定向 URI”，添加下方完整地址并保存。此处不是“已获授权的 JavaScript 来源”。域名、协议和路径必须完全一致。</li>
    </ol>
    <div className="syncCallback"><span>根据登录服务地址生成的回调地址</span><code>{callback}</code></div>
    <ol start={4}>
      <li><strong>回到阅读器连接。</strong>下方填同一个客户端 ID，以及服务的根地址（不带 /callback）。密钥只写入服务器，不填写在阅读器中。先点“检查登录服务”，成功后点“使用 Google 连接”，在系统浏览器完成授权。</li>
      <li><strong>两台设备同步。</strong>先在有书的设备点“立即同步”，再在另一台设备填同样的配置，用同一个 Google 账号连接并同步。手机需要可访问的 HTTPS 地址；localhost 指的是手机自身，不能用作电脑服务地址。</li>
    </ol>
    <p>没有服务器或域名时，暂时用“偏好设置 → 数据备份”迁移书库。此版本授权仅保留在运行内存中，关闭应用或令牌过期后需重新连接。</p>
    <details><summary>常见错误怎么处理</summary><p><strong>redirect_uri_mismatch：</strong>检查 Google 重定向 URI 是否和上面完全相同。<br/><strong>access_denied：</strong>检查测试用户及授权权限。<br/><strong>无法连接服务：</strong>确认服务已启动、HTTPS 证书有效、域名正确；可在浏览器打开服务地址后的 /health。<br/><strong>客户端不匹配：</strong>阅读器与服务 .env 必须使用同一个客户端 ID。<br/><strong>云盘里看不到书：</strong>书库存入应用专用隐藏空间，不在普通文件列表显示。</p></details>
  </details>;
}
