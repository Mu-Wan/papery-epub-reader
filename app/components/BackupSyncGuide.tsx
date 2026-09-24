"use client";

import { DRIVE_AUTH_CALLBACK, DRIVE_AUTH_ORIGIN } from "../lib/drive-auth";

export function BackupSyncGuide({ onConnect }: { onConnect?: () => void }) {
  const copy = async (value: string, button: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(value);
      const oldLabel = button.textContent;
      button.textContent = "已复制";
      window.setTimeout(() => { button.textContent = oldLabel || "复制"; }, 1500);
    } catch {
      window.prompt("请复制此地址", value);
    }
  };

  return <section className="backupSyncGuide">
    <h3>Google Drive 同步设置</h3>
    <p className="guideLead">Papery 使用 Google 官方授权。客户端 ID 是公开标识；客户端密钥不需要填写，也不要发给任何人。</p>
    <div className="guideSteps">
      <article><b>1</b><div>
        <strong>创建 Web 应用客户端</strong>
        <p>打开 <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud → OAuth 客户端</a>，选择“Web 应用”。在“已获授权的 JavaScript 来源”中添加浏览器版来源：</p>
        <div className="syncCallback"><code>{DRIVE_AUTH_ORIGIN}</code><button className="uiButton" onClick={event => void copy(DRIVE_AUTH_ORIGIN, event.currentTarget)}>复制</button></div>
        <p>再在“已获授权的重定向 URI”中添加下面这条完整地址。路径必须一致，不要加版本号或末尾斜杠：</p>
        <div className="syncCallback"><code>{DRIVE_AUTH_CALLBACK}</code><button className="uiButton" onClick={event => void copy(DRIVE_AUTH_CALLBACK, event.currentTarget)}>复制</button></div>
        <p className="guideHint">来源只写域名；重定向地址要包含完整路径。安装版点击连接后会直接打开 Google 官方授权页面，再通过这条地址安全返回。</p>
      </div></article>
      <article><b>2</b><div>
        <strong>添加测试账号和 Drive 权限</strong>
        <p>打开 Google Auth Platform 的“目标对象”，选择外部测试，并把要使用的 Google 邮箱加入“测试用户”。在“数据访问权限”中添加 <code>https://www.googleapis.com/auth/drive.appdata</code>。</p>
        <p className="guideHint">测试模式下，只有测试名单中的账号能完成授权。公开发布前，Google 可能要求完成 OAuth 应用验证。</p>
      </div></article>
      <article><b>3</b><div>
        <strong>启用 Google Drive API</strong>
        <p>打开 <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a> 页面，选择同一个 Cloud 项目并点击“启用”。</p>
      </div></article>
      <article><b>4</b><div>
        <strong>连接并同步</strong>
        <p>复制以 <code>.apps.googleusercontent.com</code> 结尾的客户端 ID，填入上方并点击“使用 Google 连接”。Google 授权页会直接打开；选择账号并允许后，Papery 自动返回并开始同步。</p>
        <p className="guideHint">其他设备使用同一个客户端 ID 和 Google 账号。授权令牌只保存在当前运行内存中；关闭应用或授权到期后，需要重新连接。书籍文件、阅读进度、标注、笔记、书签、分类、排版、个人资料和阅读统计都会同步。</p>
      </div></article>
    </div>
    <details><summary>授权时遇到错误</summary>
      <p><strong>redirect_uri_mismatch：</strong>确认重定向地址逐字等于上方地址，包含 <code>google-drive-callback.html</code>，不带版本号、参数或尾部斜杠。</p>
      <p><strong>origin_mismatch：</strong>确认 JavaScript 来源只填写 <code>{DRIVE_AUTH_ORIGIN}</code>，不要添加项目路径。</p>
      <p><strong>access_denied：</strong>将当前登录邮箱加入 Google Auth Platform 的测试用户，并确认已授予 Drive 应用数据权限。</p>
      <p><strong>API 未启用：</strong>确认 Google Drive API 已在同一个 Cloud 项目中启用。</p>
    </details>
    <p className="guideHint">Papery 不会请求或保存 Google 密码、客户端密钥或长期刷新令牌。安装包不内置客户端 ID；每位用户在同步设置中自行填写。</p>
    {onConnect && <button className="uiButton full" onClick={onConnect}>打开 Google Drive 同步</button>}
  </section>;
}
