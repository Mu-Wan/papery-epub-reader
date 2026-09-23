# Google Drive 同步配置

本版本只需 Google Web 客户端 ID，不需要客户端密钥、登录服务地址或部署包。

1. 打开 https://console.cloud.google.com/auth/clients ，选择一个项目，创建“Web 应用”客户端。
2. 在“已获授权的 JavaScript 来源”添加 **https://mu-wan.github.io** 并保存。只填该来源，不加 /papery-epub-reader/ 路径。本方案使用 Google 网页 token 模式，不需要重定向 URI。
3. Google Auth Platform → 目标对象（Audience），测试状态下把实际登录账号加入测试用户。在数据访问权限添加 `https://www.googleapis.com/auth/drive.appdata`。
4. 在同一项目启用 Google Drive API：https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com 。
5. 复制客户端 ID（以 .apps.googleusercontent.com 结尾），在 Papery → 偏好设置 → 数据备份下方打开 Google Drive 同步，填写 ID。
6. 点击“使用 Google 连接”，系统浏览器打开固定授权页面：https://mu-wan.github.io/papery-epub-reader/drive-auth.html 。点击“选择 Google 账号”，允许后点击“返回 Papery 完成连接”。
7. 浏览器未返回时，复制页面提供的加密连接码，粘贴到阅读器并点“完成连接”。授权期间保持应用及同步面板打开；超过 10 分钟后重新连接。
8. 先在有书的设备点“立即同步”，另一设备使用同一客户端 ID、同一 Google 账号连接并同步。

## 常见问题

- origin_mismatch：允许来源须完全等于 https://mu-wan.github.io，保存配置后稍等再重试。
- access_denied：检查测试用户与数据权限，以及账号或组织限制。
- Google 授权组件无法加载：检查网络能否访问 Google，允许浏览器弹窗。
- 关闭应用、关闭同步面板后连接码失效：重新发起授权即可。
- 令牌只保留在内存中，关闭应用或令牌过期后需重新连接。当前不提供长期免登录。
- 书籍存入 Drive 应用专用隐藏空间，不在普通文件列表显示。

## 数据规则与安全

同步书籍原文件、位置、笔记、书签、分类、每本书排版与阅读记录。较新的修改覆盖旧记录，删除标记同步到其他设备。使用完整书库快照，大 PDF 书库会增加流量。断网和授权失败不会清空本地书库，首次同步可先导出备份。

授权页面使用 Google Identity Services；没有服务端中转。回传内容以一次性 ECDH / AES-GCM 加密，绑定发起连接的应用会话；页面和应用不保存客户端密钥。真实 Google 账号授权需要完成上述控制台配置后验收。

参考：https://developers.google.com/identity/oauth2/web/guides/use-token-model
