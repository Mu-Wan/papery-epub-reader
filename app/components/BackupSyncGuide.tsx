"use client";
import { DRIVE_AUTH_ORIGIN } from "../lib/drive-auth";

export function BackupSyncGuide({onConnect}:{onConnect?:()=>void}) {
  const copyOrigin=async(event:React.MouseEvent<HTMLButtonElement>)=>{
    const button=event.currentTarget;
    try{await navigator.clipboard.writeText(DRIVE_AUTH_ORIGIN);button.textContent="已复制"}
    catch{window.prompt("请复制此地址",DRIVE_AUTH_ORIGIN)}
  };
  return <section className="backupSyncGuide">
    <h3>Google Drive 同步</h3>
    <p className="guideLead">只需设置一次，之后在每台设备使用同一个客户端 ID 和 Google 账号即可。客户端密钥不用填写，也不要发送给任何人。</p>
    <div className="guideSteps">
      <article><b>1</b><div><strong>创建 Web 应用客户端</strong><p>打开 <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud → 客户端</a>，创建“Web 应用”。在“已获授权的 JavaScript 来源”中添加：</p><div className="syncCallback"><code>{DRIVE_AUTH_ORIGIN}</code><button className="uiButton" onClick={copyOrigin}>复制</button></div><p className="guideHint">只填这一项，不加项目路径，也不加结尾斜杠。无需填写重定向 URI。</p></div></article>
      <article><b>2</b><div><strong>启用 Drive 同步权限</strong><p>在 Google Auth Platform 的“目标对象”中把自己的账号加入测试用户；在“数据访问权限”中添加 <code>drive.appdata</code>。然后到 <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a> 页面点击“启用”。</p><p className="guideHint">客户端密钥不用填写，也不要放进安装包。</p></div></article>
      <article><b>3</b><div><strong>连接 Papery 并同步</strong><p>复制以 <code>.apps.googleusercontent.com</code> 结尾的客户端 ID，填入上方并点击“使用 Google 连接”。浏览器会尝试直接打开 Google 官方授权窗口；若浏览器拦截，在 Papery 连接页点“继续到 Google”，再选择账号并允许访问。授权后 Papery 会尝试自动返回；若没有返回，点击“返回 Papery”或粘贴连接码。</p><p className="guideHint">其他设备使用同一个客户端 ID 和 Google 账号连接，然后点击“立即同步”。建议先在已有书籍的设备同步。</p></div></article>
    </div>
    <details><summary>遇到“来源不匹配”怎么办？</summary><p>Google 要求来源完全等于 <code>https://mu-wan.github.io</code>。如果填成了 <code>https://mu-wan.github.io/papery-epub-reader</code>、带了结尾斜杠，或只填了 localhost，都会失败。修改 Google Cloud 后重新点击“使用 Google 连接”即可。</p></details>
    <p className="guideHint">Google 登录和授权由 Google 官方窗口处理。Papery 不接收密码；授权结果仅在本次连接中加密传回，不保存客户端密钥。授权时保持 Papery 和同步面板打开，超过 10 分钟后请重新连接。</p>
    {onConnect&&<button className="uiButton full" onClick={onConnect}>打开 Google Drive 同步</button>}
  </section>;
}
