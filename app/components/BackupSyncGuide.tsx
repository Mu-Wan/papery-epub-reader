"use client";

export function BackupSyncGuide({onConnect}:{onConnect:()=>void}) {
  return <section className="backupSyncGuide">
    <h3>Google Drive 同步如何配置</h3>
    <p>先完成 Google 项目配置，再按实际使用的平台连接。客户端 ID 可填写在应用中；客户端密钥不需要提供给他人。</p>
    <ol>
      <li>打开 <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud → 客户端</a>，在同一个项目内创建“Web 应用”客户端，保存客户端 ID。</li>
      <li>进入 Google Auth Platform → 目标对象（Audience）。应用处于测试状态时，把实际登录的 Google 账号加入“测试用户”。在“数据访问权限”添加 <code>https://www.googleapis.com/auth/drive.appdata</code>。</li>
      <li>在同一项目中打开 <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a>，点击“启用”。</li>
    </ol>
    <p><strong>网页授权方案：</strong>采用 Google 网页授权组件的网站，还需在客户端的“已获授权的 JavaScript 来源”填写网站来源，例如 <code>https://reader.example.com</code>；本地开发可填写 <code>http://localhost:3000</code>。来源只含协议、域名和端口，不含路径。此方案由网页接收短期访问令牌，不需要把客户端密钥放在网页中。</p>
    <p><strong>当前 Papery EXE / APK：</strong>使用系统浏览器加登录服务完成授权，不能仅靠填写 JavaScript 来源完成连接。需要部署附带的登录服务，并在 Google 客户端的“已获授权的重定向 URI”填入 <code>https://登录服务域名/callback</code>。然后在应用中填写客户端 ID 和服务根地址，检查服务并连接。详细部署步骤位于下方入口。</p>
    <p>首次先在有书的设备“立即同步”，再在另一设备用同一 Google 账号同步。关闭应用或令牌过期后需要重新授权。云端书库存放在应用专用隐藏空间，不会出现在普通云盘文件列表中。没有登录服务时，可先用上方备份导入导出。</p>
    <button className="uiButton full" onClick={onConnect}>打开 Google Drive 同步与接入步骤</button>
  </section>;
}
