const A = "assets/";

const summary = [
  { kicker: "我做了一个", title: "不登录、不订阅<br>也没有广告的<br><em>本地阅读器</em>", body: "现在，Windows / Android / Linux / PWA 都能用。", tags: ["免费", "开源", "EPUB + TXT"], image: A + "desktop-home.png", layout: "cover" },
  { kicker: "01 · 书架", title: "书可以摆着<br>也可以收进书盒", body: "EPUB + TXT · 阅读进度 · 在读 · 已完成 · 拖动排序", image: A + "desktop-home.png", kind: "desktop", layout: "screen" },
  { kicker: "02 · 手机端", title: "三列书架<br>触屏重新排版", body: "半年热力图 · 原生安全区 · 自绘菜单", image: A + "mobile-home.jpg", kind: "phone", layout: "phone-card" },
  { kicker: "03 · 阅读", title: "电脑双栏<br>手机滑动翻页", body: "滚轮 · 方向键 · 两侧点击 · 上下/左右滑动", image: A + "desktop-reader.png", kind: "desktop", layout: "screen" },
  { kicker: "04 · 排版", title: "字体、边距<br>纸色、纸质", body: "字号 · 行距 · 上下边距 · 左右边距 · 霞鹜文楷", image: A + "desktop-settings.png", kind: "desktop", layout: "screen" },
  { kicker: "05 · 阅读足迹", title: "每天读了多久<br>热力图会记住", body: "前台阅读计时 · 进度 · 已读完 · 书盒", image: A + "mobile-home.jpg", kind: "phone-crop", layout: "phone-card" },
  { kicker: "下载与开源", title: "页间 v1.1.4", body: "<b>开源地址</b><br>Mu-Wan/papery-epub-reader<br><br><b>夸克网盘</b><br>pan.quark.cn/s/c81f4777fbf8", note: "Windows / Android / Linux / PWA", layout: "closing download" },
];

const update = [
  { kicker: "页间 v1.1.4", title: "手机端<br><em>补完整了</em>", body: "Android APK + PWA 同步更新", tags: ["免费", "开源", "本地优先"], image: A + "mobile-home.jpg", kind: "phone", layout: "cover phone-cover" },
  { kicker: "01 · 阅读", title: "上下左右滑动<br>沉浸 + 页码", body: "目录 · 返回手势 · 系统安全区", image: A + "desktop-reader.png", kind: "desktop", layout: "screen" },
  { kicker: "02 · 书架", title: "一行三本<br>半年热力图", body: "书盒 · 进度 · 已完成 · 自绘菜单", image: A + "mobile-home.jpg", kind: "phone", layout: "phone-card" },
  { kicker: "03 · 排版", title: "上下、左右边距<br>分开调", body: "霞鹜文楷 · 字号 · 行距 · 纸色 · 纸质", image: A + "mobile-settings.jpg", kind: "phone", layout: "phone-card" },
  { kicker: "下载与开源", title: "页间 v1.1.4", body: "<b>开源地址</b><br>Mu-Wan/papery-epub-reader<br><br><b>夸克网盘</b><br>pan.quark.cn/s/c81f4777fbf8", note: "旧版可直接覆盖安装；卸载前请先导出备份。", layout: "closing download" },
];

const sets = { summary, update };
