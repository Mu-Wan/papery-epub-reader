# Papery 阅读器

Windows / Android 本地阅读器，支持 EPUB、PDF、TXT。书籍和阅读数据保存在本机 IndexedDB，可导入导出备份，也可配置 Google Drive 同步。

## 运行与构建

需要 Node.js 22.13+。安装依赖：`npm install`；开发预览：`npm run dev`；类型检查：`npm run typecheck`；回归测试：`npm test`；生成静态前端：`npm run build`。

Windows 安装包：`npx tauri build --bundles nsis`。Android：配置 Java、Android SDK、NDK 后执行 `npx tauri android build --apk --target aarch64 --ci`。原生构建默认重建前端，只有明确设置 PAPERY_PREBUILT=1 才复用 out。

## 使用

- EPUB / TXT 分页模式：键盘方向键、PageUp / PageDown、空格、左右区域点击及鼠标滚轮翻页；手机使用横向滑动。中间区域点击切换工具栏，右上角保留明确的工具栏按钮。
- 滚动模式和 PDF 使用连续滚动。PDF 显示实际页码；可重排的 EPUB / TXT 显示阅读位置。
- 优先提取书本封面，PDF 使用首页；没有封面时显示文字封面。
- Google Drive 当前为自行部署登录服务的接入方式，没有默认公共服务；详见 [接入说明](docs/Google-Drive-接入.md) 和 [服务部署步骤](sync-service/README.md)。客户端密钥只配置在服务端。

## 文件

- app/：书库、阅读内核、本地存储与同步。
- sync-service/：Google 登录服务、Docker Compose 和配置模板。
- tests/books/：人工测试样书，不包含在安装包中。
- patches/：阅读引擎修复，安装依赖时自动应用。
- releases/0.1.4/：本次 EXE、APK 和交付说明。
- docs/目录说明.md：目录用途与整理范围。
- db/、drizzle/、worker/：保留的网页后端代码；原生阅读器默认使用本机存储。

## 0.1.4 首次启动与同步说明

新安装默认昵称“读者”、无头像、空书库，不生成示例书。偏好设置提供个人资料入口；现有用户数据不会因升级而清空。数据备份下方包含 Google 客户端、JavaScript 来源、测试用户、Drive API 的配置流程，并明确区分网页授权与当前 EXE / APK 的登录服务回调方式。
