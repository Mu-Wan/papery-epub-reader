"use client";
import { DRIVE_AUTH_ORIGIN, DRIVE_AUTH_PAGE } from "../lib/drive-auth";
export function BackupSyncGuide({onConnect}:{onConnect?:()=>void}) {
 return <section className="backupSyncGuide"><h3>Google Drive 同步如何配置</h3><p>只需配置一次 Google 项目，然后在各设备填写同一个客户端 ID。无需客户端密钥，也不需要部署服务。</p><ol>
 <li>打开 <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud → 客户端</a>，选择项目，创建“Web 应用”客户端。</li>
 <li>在“已获授权的 JavaScript 来源”添加下方地址并保存。只填写来源，不附带 /papery-epub-reader/ 或其他路径；本方案不需要填写重定向 URI。</li></ol>
 <div className="syncCallback"><span>复制到“已获授权的 JavaScript 来源”</span><code>{DRIVE_AUTH_ORIGIN}</code><button className="uiButton full" onClick={async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(DRIVE_AUTH_ORIGIN);button.textContent="已复制"}catch{window.prompt("请复制此地址",DRIVE_AUTH_ORIGIN)}}}>复制允许来源</button></div>
 <ol start={3}><li>Google Auth Platform → 目标对象（Audience），测试状态下将实际登录的 Google 账号加入“测试用户”。在“数据访问权限”添加 <code>https://www.googleapis.com/auth/drive.appdata</code>。</li>
 <li>在同一项目打开 <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a>，点击“启用”。</li>
 <li>复制客户端 ID（以 .apps.googleusercontent.com 结尾），填写到阅读器“Google Drive 同步”中。客户端密钥不用填写，也不用发给任何人。</li>
 <li>点击“使用 Google 连接”，在系统浏览器的授权页点击“选择 Google 账号”，同意后点击“返回 Papery 完成连接”。若浏览器没有返回，复制页面上的加密连接码，粘贴到阅读器中。授权期间请保持阅读器和同步面板打开。</li>
 <li>先在有书的设备点“立即同步”，再在另一设备使用同一客户端 ID、同一 Google 账号连接并同步。</li></ol>
 <p>授权页面：<a href={DRIVE_AUTH_PAGE} target="_blank" rel="noreferrer">Papery Google 授权页</a>。Windows、Android 均通过该固定页面授权，不需要登记 tauri.localhost 或手机地址。</p>
 <details><summary>连接失败怎么办</summary><p>提示 origin_mismatch：核对允许来源是否完全一致，保存后稍等再试。提示 access_denied：检查测试用户及授权权限。弹窗打不开：允许浏览器弹窗。无法加载 Google：检查网络。关闭应用、关闭同步面板或超过 10 分钟后，应重新发起授权。令牌过期后重新连接；云端书籍在应用专用隐藏空间中，不显示在普通文件列表。</p></details>
 {onConnect&&<button className="uiButton full" onClick={onConnect}>打开 Google Drive 同步</button>}</section>;
}
