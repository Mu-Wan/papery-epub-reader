# Google Drive 同步

Papery 使用 Google 官方网页授权，不需要自建登录服务。设置时只把客户端 ID 填入 Papery；客户端密钥不需要，也不要放进应用或发送给他人。

## 一次性设置

1. 打开 [Google Cloud 客户端](https://console.cloud.google.com/auth/clients)，选择项目并创建 **Web 应用**客户端。
2. 在客户端的“已获授权的 JavaScript 来源”中添加 <code>https://mu-wan.github.io</code>。只填域名，不加项目路径，也不加结尾斜杠。无需填写重定向 URI。
3. 在 Google Auth Platform 的“目标对象”中，把要登录的 Google 账号加入“测试用户”。在“数据访问权限”中添加 <code>https://www.googleapis.com/auth/drive.appdata</code>。
4. 在同一 Google Cloud 项目中启用 [Google Drive API](https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com)。

## 在 Papery 连接

1. 打开“偏好设置 → 数据备份 → Google Drive 同步”，粘贴以 <code>.apps.googleusercontent.com</code> 结尾的客户端 ID。
2. 点击“使用 Google 连接”。浏览器会打开 Papery 的安全连接页，并尝试直接启动 Google 官方授权窗口；若浏览器拦截弹窗，点击该页的“继续到 Google”，再选择账号并授权。
3. 授权完成后，Papery 会尝试自动返回。若浏览器没有打开应用，点击授权页中的“返回 Papery 完成连接”；仍无法返回时，复制加密连接码，粘贴回阅读器并点击“完成连接”。
4. 连接成功后点击“立即同步”。其他设备填写同一客户端 ID，使用同一 Google 账号连接，再执行同步。建议先在已有书籍的设备同步。

Papery 打开连接页后会立即尝试启动 Google 官方账号窗口；浏览器若拦截弹窗，点页面中的“继续到 Google”即可。账号密码由 Google 处理；Papery 只申请应用专用空间权限，不会读取云盘中的其他文件。授权结果在回传时使用一次性密钥加密，不保存到磁盘。

## 常见问题

- 来源不匹配：已获授权的 JavaScript 来源须完全等于 <code>https://mu-wan.github.io</code>。保存配置后重新连接。
- access_denied：检查测试用户、数据访问权限、所用账号及组织限制。
- Google 授权窗口没有打开：允许浏览器弹出窗口，再点一次“继续到 Google”。
- 连接码过期或面板关闭：回到阅读器重新发起连接。
- 令牌只保留在内存中，关闭应用或令牌过期后需重新连接。当前不提供长期免登录。
- 书籍存入 Drive 应用专用隐藏空间，不会出现在普通文件列表中。

## 数据与安全

同步书籍原文件、阅读位置、笔记、书签、分类、每本书的排版与阅读记录。较新的修改覆盖旧记录，删除标记会同步到其他设备。同步以完整书库快照为单位，大 PDF 书库会增加流量；首次同步前可先导出本地备份。

授权页由 GitHub Pages 静态托管，Google Identity Services 负责账号授权，没有服务端中转。回传内容使用一次性 ECDH / AES-GCM 加密，并绑定发起连接的应用会话；页面和应用均不保存客户端密钥。
