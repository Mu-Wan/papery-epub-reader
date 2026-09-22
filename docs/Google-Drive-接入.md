# Google Drive 同步接入

本版本包含 Drive 同步客户端、独立登录服务和同步设置界面。尚未配置 Google OAuth，因此安装后默认“仅保存在本机”，不会自动上传书籍。

## 配置 Google

1. 在 Google Cloud 项目中启用 Google Drive API，配置 OAuth 同意屏幕。个人测试阶段将使用的 Google 账号加入测试用户。
2. 创建“Web 应用”OAuth 客户端，记录客户端 ID 和客户端密钥。
3. 将登录服务部署在自己的 HTTPS 域名根路径，例如 `https://sync.example.com/`，设置授权重定向 URI 为 `https://sync.example.com/callback`。
4. 在服务器设置 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`PUBLIC_URL`。运行 `node sync-service/server.mjs`，通过 HTTPS 反向代理转发到 `127.0.0.1:8788`。
5. 在 Papery 左下角同步入口填写 OAuth 客户端 ID 和登录服务地址，选择“使用 Google 连接”，在系统浏览器授权，然后返回阅读器。
6. 先在存有书籍的设备执行“立即同步”，再在另一台设备使用同一个 Google 账号连接并同步。

密钥只配置在服务器，不能填入阅读器、提交到仓库或打入 EXE/APK。登录服务支持 `PORT` 和逗号分隔的 `ALLOWED_ORIGINS` 配置，默认允许 Tauri 的 Windows / Android 来源及本地开发来源。

## 同步规则

- 同步书籍原文件、进度、笔记、书签、分类、每本书的排版与阅读会话；应用外观、登录信息和其他设备配置不上传。
- 按每条记录的最后修改时间合并。同一本书往回阅读后的新位置会覆盖较旧的靠后位置。
- 删除标记一起同步，旧设备重新上线不会直接恢复已删除的书和笔记。
- 每个设备写入独立的新快照，避免两个设备互相覆盖同一个云端文件；本设备保留当前快照及两份历史快照。
- 文件保存在 Google Drive 应用数据空间，不会出现在普通“我的云端硬盘”文件列表里。
- 上传使用分段传输；网络、授权或远端文件错误时，不清空本地书库。可再次执行同步。
- 当前为完整书库快照同步，较大的 PDF 书库会增加传输流量与云端空间占用。首次同步建议使用稳定网络。
- 访问令牌只保存在运行内存中。关闭应用或令牌过期后重新连接；“自动同步”仅在已授权、联网且停留书库时每分钟执行，避免阅读中被远端位置打断。

## 没有登录服务时

可先使用“偏好设置 → 导出全部数据 / 加载备份”迁移数据。联调人员可以在同步面板输入拥有 `https://www.googleapis.com/auth/drive.appdata` 权限的短期访问令牌；该入口不保存令牌，也不代表完成了正式 Google 登录配置。

## 验证范围

同步合并、倒退进度、删除保护、无效数据拒绝通过自动测试。Google API 客户端通过拦截请求的本地服务模拟测试；未使用真实账号进行云端验收。完成上述 OAuth 配置后仍需用两个真实设备进行一次账号授权及上传、下载验收。

## 官方资料

- [Google Drive 应用专用数据](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google OAuth Web 授权码流程](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Drive 分段上传](https://developers.google.com/workspace/drive/api/guides/manage-uploads)

## 已有 ID 和密钥但没有服务地址

Google 不会生成登录服务地址。当前采用自建服务，没有公共托管地址。请按 [服务部署说明](../sync-service/README.md) 部署交付包内的服务；提供 Docker Compose、HTTPS 代理和 config.example。软件同步面板内也有相同步骤、自动生成的 callback 地址、服务检查和常见错误解释。只在 Windows 临时联调时可用 localhost:8788，手机必须使用可访问的 HTTPS 服务。

## 网页授权与当前安装版的区别

网站若使用 Google Identity Services 的 token 模式，可以仅用 Web 客户端 ID，在“已获授权的 JavaScript 来源”登记网站来源，并添加测试用户、启用 Drive API。来源只含协议、主机和端口，不包含路径。参考：https://developers.google.com/identity/oauth2/web/guides/use-token-model

当前 Papery EXE / APK 尚未采用这种网页弹窗授权，而是系统浏览器加登录服务的授权码流程，所以仍需配置登录服务和重定向 URI。不能把 tauri.localhost 当作已部署的公共网站，以为填写 JavaScript 来源后就能直接登录。两种情况已经在偏好设置的数据备份下方分开说明。
