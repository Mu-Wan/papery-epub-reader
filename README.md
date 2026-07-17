# 页间 · EPUB / TXT 阅读器

一个安静、轻巧、本地优先的阅读器。Windows 可使用单文件便携版，安卓与统信 UOS 可通过浏览器安装 PWA。

![页间书架](docs/assets/screenshots/bookshelf.png)

## 在线体验

- [打开页间 PWA](https://mu-wan.github.io/papery-epub-reader/)
- 安卓、统信 UOS 与桌面 Chromium 均可使用“安装到桌面”
- 安装后可离线打开；书籍仍只保存在当前设备的浏览器中

## v1.1.0 功能

- 本地导入 EPUB 与 TXT，自动读取封面、书名和作者
- TXT 支持 UTF-8、BOM、GBK / GB18030，并自动识别常见中文章节
- 鼠标滚轮、左右方向键或点击页面两侧翻页
- 支持字号、行距、四周边距、中文字体、纸色与纸张质感
- 按窗口宽度自动切换双栏或单栏排版
- 书架、在读与已完成分区，书卡显示真实阅读进度
- 可创建书盒整理书籍；删除书盒不会删除其中的书
- 最近一年阅读热力图，仅在书籍打开且应用位于前台时计时
- 版本化 ZIP 备份，包含书籍、文件、书盒、进度与阅读统计
- 无账号、无广告、无遥测，不上传书籍

## Windows 便携版

[下载最新 Windows 便携版](https://github.com/Mu-Wan/papery-epub-reader/releases/latest)

下载 `Papery-Reader-v1.1.0.exe` 后双击即可运行，无需安装。系统要求为 Windows 10 / 11，并启用 Microsoft Edge WebView2 Runtime；多数现代 Windows 系统已自带。

## 数据与备份

- Windows 版和 PWA 都把书籍与阅读数据保存在本机
- 浏览器可能拒绝持久存储，看到提示时请定期从“管理”导出备份
- “合并恢复”保留本机内容，并采用较新的书籍状态
- “覆盖恢复”会先清空本机书架，操作前会再次确认
- 当前版本不提供账号或云同步，可用备份文件在设备间手动迁移

## 本地开发

需要 Node.js 22、Rust 和 Tauri 的 Windows 构建环境。

```powershell
npm install
npm run dev
```

构建 PWA：

```powershell
npm run build:web
```

构建 Windows 便携版：

```powershell
npm run package:tauri
```

生成的便携版位于 `release` 目录。

## 技术栈

- [Tauri](https://tauri.app/)
- [epub.js](https://github.com/futurepress/epub.js/)
- Vite / PWA
- IndexedDB

## 隐私与内容说明

页间不包含账号、云同步、遥测或广告模块。项目只提供阅读器代码，不包含书源或电子书文件；请只阅读通过合法渠道获得的内容。

## 许可证

[MIT License](LICENSE)
