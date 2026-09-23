# Papery 阅读器

让阅读回到书本本身。Papery 是一款面向 **Windows 与 Android** 的本地阅读器，支持 **EPUB、PDF、TXT**，提供书库管理、阅读位置记忆、标注笔记与可选的 Google Drive 同步。

[下载安装包](https://github.com/Mu-Wan/papery-epub-reader/releases/latest) · [项目主页](https://mu-wan.github.io/papery-epub-reader/) · [反馈问题](https://github.com/Mu-Wan/papery-epub-reader/issues)

## 下载

| 平台 | 安装文件 | 要求 |
| --- | --- | --- |
| Windows | [EXE 安装包](https://github.com/Mu-Wan/papery-epub-reader/releases/download/papery-v0.1.5/Papery-Reader-0.1.5-Windows-x64-Setup.exe) | x64，使用 WebView2 |
| Android | [APK 安装包](https://github.com/Mu-Wan/papery-epub-reader/releases/download/papery-v0.1.5/Papery-Reader-0.1.5-Android-arm64.apk) | Android 7.0+，arm64 |

Android 包使用项目现有测试签名。安装文件与 SHA256 校验值在 [Release](https://github.com/Mu-Wan/papery-epub-reader/releases/tag/papery-v0.1.5) 中提供。

## 阅读与书库

- **EPUB**：可调字体、字号、行距、主题，支持分页与滚动阅读、目录、位置记忆。
- **PDF**：按原始页面渲染，支持缩放、目录和实际页码定位。
- **TXT**：本地导入、排版和阅读位置记忆。
- **书库**：优先显示真实封面，缺少封面时使用文字封面；支持搜索、分类和阅读进度。
- **笔记**：划线、标注、书签与笔记，便于回到对应内容。
- **本地优先**：不开启同步也能阅读；提供完整备份导入导出。

首次启动默认昵称为“读者”，无预设头像、无示例书籍。点击“导入书籍”添加第一本书，在“偏好设置 → 个人资料”修改昵称和头像。升级不会主动清空已有本地数据。

## 阅读操作

分页模式下使用左右方向键、PageUp / PageDown、空格、鼠标滚轮或正文左右区域翻页；手机支持横向滑动。正文中间区域和右上角按钮可显示或隐藏工具栏。滚动模式与 PDF 使用连续滚动。

EPUB / TXT 显示随内容定位的“阅读位置”；PDF 显示实际页码。排版、窗口大小和书籍内容会影响可重排格式的屏幕分页。

## Google Drive：只需客户端 ID

不需要填写客户端密钥，不需要部署登录服务。详细步骤也在软件 **“偏好设置 → 数据备份”下方**。

1. 在 [Google Cloud 客户端](https://console.cloud.google.com/auth/clients) 创建 **Web 应用**客户端。
2. 在“已获授权的 JavaScript 来源”添加 **`https://mu-wan.github.io`**。只填来源，不加路径；本方案无需重定向 URI。
3. Google Auth Platform → 目标对象（Audience），测试状态下添加自己的 Google 账号为测试用户；数据访问权限添加 `https://www.googleapis.com/auth/drive.appdata`。
4. 在同一项目启用 [Google Drive API](https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com)。
5. 将客户端 ID 填入阅读器，点击“使用 Google 连接”，在系统浏览器授权，再点击“返回 Papery 完成连接”。浏览器未返回时可粘贴页面提供的加密连接码。
6. 先在有书的设备同步，再在另一设备使用同一客户端 ID 和 Google 账号同步。

授权期间保持应用及同步面板打开。关闭应用或授权过期后需重新连接。书库存放在 Drive 的应用专用隐藏空间；完整快照同步会增加大型 PDF 书库的流量。首次同步前可先导出本地备份。

更多说明见 [Google Drive 接入与常见问题](docs/Google-Drive-接入.md)。

## 开发

环境：Node.js 22.13+，原生构建另需 Rust；Android 另需 Java、Android SDK 和 NDK。

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Windows 安装包：`npx tauri build --bundles nsis`。

Android 安装包：`npx tauri android build --apk --target aarch64 --ci`。

原生构建默认重新生成前端。仅在确认 out 为最新结果时使用 `PAPERY_PREBUILT=1`。

## 项目结构

- `app/`：界面、阅读内核、本地存储和同步。
- `public/drive-auth.html`、`drive-auth.mjs`：GitHub Pages 托管的静态 Google 授权页。
- `site/`：项目介绍与下载首页。
- `src-tauri/`：Windows、Android 工程。
- `patches/`：EPUB 引擎兼容补丁，安装依赖时自动应用。
- `tests/`：回归测试；本地测试书不随源码或安装包分发。
- `docs/`：使用及配置说明。

## 当前验证范围

前端生产构建、类型检查及 7 项核心测试通过；浏览器完成了空书库、授权结果加密回传与模拟 Drive 上传、下载、失败保留数据的验证。真实 Google 账号授权、云端跨设备同步仍需配置后验收。最终 EXE / APK 已构建，未进行安装后的完整验收。

## 反馈

通过 [Issues](https://github.com/Mu-Wan/papery-epub-reader/issues) 提供平台、版本、书籍格式与复现步骤。请勿上传私人书籍、客户端密钥或授权令牌。

代码许可见 [LICENSE](LICENSE)。
