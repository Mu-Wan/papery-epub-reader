# Papery Google 登录服务

Google 控制台生成的是客户端 ID 和密钥，不会提供“登录服务地址”。本目录是需要自行运行的登录服务；**本版本没有公共托管服务**。没有服务器、域名时可先用阅读器内的备份导入导出迁移数据。

## 电脑和手机共用 HTTPS 服务

准备一台可连接 Google 的服务器，安装 Docker Engine 和 Docker Compose；准备一个域名，将 DNS A 记录指向服务器公网 IP（如有 AAAA 记录也须正确）。在服务器安全组和防火墙放行 TCP 80、443。不必开放 8788。

1. 在 Google Cloud 项目启用 Google Drive API。Google Auth Platform → 客户端中创建 **Web 应用**客户端，记录 ID 和密钥。已有此类型客户端可继续使用；桌面或 Android 类型不适用于本服务。
2. 在“数据访问权限”添加 `https://www.googleapis.com/auth/drive.appdata`。在“目标对象 / Audience”处，将要使用的账号加入测试用户（测试状态下）。
3. 将本目录上传到服务器。复制 `config.example` 为 `.env`，编辑三个值：

   ```ini
   SYNC_DOMAIN=sync.实际域名.com
   GOOGLE_CLIENT_ID=实际的Web客户端ID.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=实际客户端密钥
   ```

   域名不带 https:// 和路径。密钥只留在服务器，不发给他人、不写入阅读器、不提交源码库。
4. 在此目录运行 `docker compose up -d --build`。附带 Caddy 会申请和续期 HTTPS 证书，需要 DNS 解析生效、80/443 可达。浏览器打开 `https://sync.实际域名.com/health`，应看到 `service: papery-auth` 和客户端 ID，不含密钥。启动失败可运行 `docker compose logs --tail=80` 排查。
5. Google Web 客户端设置 → **已获授权的重定向 URI** 添加 `https://sync.实际域名.com/callback` 并保存。不是 JavaScript 来源；协议、域名和路径须完全一致。
6. 阅读器内填客户端 ID，服务地址填 `https://sync.实际域名.com/`（不带 callback）。点“检查登录服务”，再点“使用 Google 连接”。手机填同样的 HTTPS 地址。
7. 有书的设备先同步，再在另一台设备用同一个 Google 账号同步。

## 只在 Windows 电脑临时联调

需要 Node.js 22。在本目录复制 `config.example` 为 `.env`，保留 ID、密钥，另加 `PUBLIC_URL=http://localhost:8788/`。运行 `node --env-file=.env server.mjs`。Google 重定向 URI 填 `http://localhost:8788/callback`，Windows 阅读器服务地址填 `http://localhost:8788/`。终端须保持运行。手机 localhost 指向手机自身，且正式 APK 只允许 HTTPS；此方式不用于手机。

## 常见问题与当前范围

- `redirect_uri_mismatch`：Google 重定向地址须与 `/health` 返回的 callback 完全一致。
- `access_denied`：检查测试用户、数据权限及 Google 项目访问限制。
- `Origin denied`：默认允许 Windows / Android Tauri 和 localhost:3000；自定义网页需设置 `ALLOWED_ORIGINS`，多个来源用英文逗号分隔。
- 服务只临时中转授权，不保存 Google 密码、令牌或书籍。保持单实例运行（登录会话存于内存）；重启会使未完成的登录失效，重新连接即可。
- 令牌只保留在阅读器本次运行内存中，关闭应用或授权过期后重新连接，当前没有长期免登录。
- 书库在 Drive 隐藏的应用数据空间中。完整书库快照会增加大 PDF 的传输流量；可先导出本地备份。
- 已完成模拟 API 联调，未使用真实 Google 账号验收。部署模板尚未部署到公网；完成以上配置后仍需实际授权测试。

参考：[Google Web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)、[Drive 应用数据](https://developers.google.com/workspace/drive/api/guides/appdata)。
