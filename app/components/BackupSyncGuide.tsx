"use client";
import { DRIVE_AUTH_ORIGIN, DRIVE_AUTH_PAGE } from "../lib/drive-auth";

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
      <article><b>1</b><div><strong>创建 Google Web 客户端</strong><p>打开 <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud → 客户端</a>，创建“Web 应用”。在“已获授权的 JavaScript 来源”中填写：</p><div className="syncCallback"><code>{DRIVE_AUTH_ORIGIN}</code><button className="uiButton" onClick={copyOrigin}>复制</button></div><p className="guideHint">只填这一行，不要加 <code>/papery-epub-reader</code> 路径，也不要加结尾斜杠。</p></div></article>
      <article><b>2</b><div><strong>完成 Google 项目设置</strong><p>在 Audience 中把自己的 Google 账号加入“测试用户”；在“数据访问权限”添加 <code>drive.appdata</code>；再到 <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a> 页面点击“启用”。</p><p className="guideHint">只需要客户端 ID，不需要客户端密钥；本方案不需要填写重定向 URI。</p></div></article>
      <article><b>3</b><div><strong>回到 Papery 连接</strong><p>把以 <code>.apps.googleusercontent.com</code> 结尾的客户端 ID 填入上方，点击“使用 Google 连接”，在浏览器中选择账号并授权。授权完成后返回 Papery；另一台设备重复连接，再点击“立即同步”。</p></div></article>
    </div>
    <details><summary>遇到“来源不匹配”怎么办？</summary><p>Google 要求来源完全等于 <code>https://mu-wan.github.io</code>。如果填成了 <code>https://mu-wan.github.io/papery-epub-reader</code>、带了结尾斜杠，或只填了 localhost，都会失败。修改 Google Cloud 后重新点击“使用 Google 连接”即可。</p></details>
    <p className="guideHint">授权页是 Papery 为桌面端和手机端准备的浏览器页面，会继续打开 Google 官方授权窗口；它不保存密码或令牌。关闭应用、同步面板或等待超过 10 分钟后，需要重新发起连接。</p>
    <p className="guideHint"><a href={DRIVE_AUTH_PAGE} target="_blank" rel="noreferrer">打开授权页说明</a></p>
    {onConnect&&<button className="uiButton full" onClick={onConnect}>打开 Google Drive 同步</button>}
  </section>;
}
