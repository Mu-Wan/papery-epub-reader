# Papery 阅读器

面向 Windows 与 Android 的跨端阅读器前端，支持 TXT、EPUB、PDF。当前项目可直接作为网站运行，也保留了迁移至 Tauri 2 WebView 的清晰边界。

## 已实现

- TXT 分页阅读、EPUB 排版渲染、PDF Canvas 渲染
- 鼠标点击、键盘方向键 / PageUp / PageDown / Space 与移动端横向手势翻页
- 字号、行距、暖纸 / 明亮 / 夜间主题调节
- 书库、分类、书名作者搜索、阅读进度、书签、划线与笔记界面
- 阅读时长、阅读字数、阅读天数、类型分布等统计界面
- IndexedDB 保存本地书籍文件；D1 保存书籍、进度、笔记、偏好与阅读会话；R2 保存原始文件
- 标题栏、菜单、弹窗、下拉、滑块、滚动条、进度条全部自定义
- 桌面一屏式布局与 Android 窄屏响应式布局

## 本地运行

环境要求：Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 代码结构

- `app/page.tsx`：书库、阅读、笔记、数据分析及主要交互
- `app/components/DocumentReader.tsx`：TXT / EPUB / PDF 阅读内核
- `app/lib/local-library.ts`：IndexedDB 本地书库
- `app/api/library/route.ts`：进度、笔记、偏好、会话持久化接口
- `app/api/files/route.ts`：书籍文件上传与读取接口
- `db/schema.ts`：D1 数据表结构
- `drizzle/`：数据库迁移文件

## Tauri 2 接入说明

前端无需重做。将构建产物接入 Tauri 后，建议仅替换两层能力：

1. 使用 `tauri-plugin-sql` 替换 D1 接口，实现 SQLite 离线持久化。
2. 使用 Tauri 文件系统 API 替换 R2 上传，将原始书籍保存到应用数据目录。

阅读内核、界面组件、键盘与手势交互可直接复用。桌面窗口按钮可在 Tauri 中绑定 `minimize`、`toggleMaximize` 与 `close` 命令。
