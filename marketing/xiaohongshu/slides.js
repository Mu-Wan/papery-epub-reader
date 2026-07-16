const assets = {
  bookshelf: "assets/bookshelf-v104.png",
  green: "assets/reading-green-v104.png",
  warm: "assets/reading-warm-v104.png",
};

const appWindow = (src, extra = "") => `
  <div class="app-window ${extra}">
    <div class="window-line"><i></i><i></i><i></i><span>页间 · EPUB 阅读器</span></div>
    <img src="${src}" alt="页间应用界面" />
  </div>
`;

const slides = [
  {
    content: `
      <div class="hero-copy">
        <span class="overline">我做了一个</span>
        <h1>只有 <em>8.28 MB</em><br />的 EPUB 阅读器</h1>
        <p>安静、轻巧、本地优先。</p>
        <div class="pills"><b>免费</b><b>开源</b><b>Windows</b></div>
      </div>
      ${appWindow(assets.bookshelf, "hero-shot")}
    `,
  },
  {
    content: `
      <div class="ghost-number">01</div>
      <div class="heading">
        <span class="sticker">为什么做它？</span>
        <h2>阅读软件越来越多<br />我想要的却越来越少</h2>
        <p>不是重新发明轮子，只是把真正会用的功能留下来。</p>
      </div>
      <div class="quiet-list">
        <div><b>没有账号</b><span>打开就能读</span></div>
        <div><b>没有广告</b><span>不打断注意力</span></div>
        <div><b>没有云端</b><span>书留在电脑里</span></div>
      </div>
    `,
  },
  {
    content: `
      <div class="heading compact">
        <span class="sticker">首页 · 书架</span>
        <h2>把 19 本书<br />放回一个安静的书架</h2>
        <p>导入 EPUB，封面、书名和作者自动排好。</p>
      </div>
      ${appWindow(assets.bookshelf, "shelf-shot")}
      <div class="callout callout-a">＋ 添加 EPUB</div>
      <div class="callout callout-b">点封面直接读</div>
    `,
  },
  {
    theme: "dark",
    content: `
      <div class="heading compact inverse">
        <span class="sticker dark-sticker">阅读页</span>
        <h2>双栏排版<br />终于像在读一本书</h2>
      </div>
      ${appWindow(assets.green, "reading-shot")}
      <div class="control-pills"><b>滚轮</b><b>← 方向键 →</b><b>两侧点击</b></div>
    `,
  },
  {
    content: `
      <div class="heading compact">
        <span class="sticker">排版 · 刚刚够用</span>
        <h2>字号、行距、四周边距<br />还有纸张颜色</h2>
        <p>常用的，都放在一张面板里。</p>
      </div>
      ${appWindow(assets.warm, "settings-shot")}
      <div class="swatches"><i></i><i></i><i></i><i></i></div>
    `,
  },
  {
    content: `
      <div class="heading compact">
        <span class="sticker">轻量版</span>
        <h2>不安装<br />双击就能用</h2>
      </div>
      <div class="metrics">
        <div><strong>8.28</strong><span>MB</span><small>单个 EXE</small></div>
        <div><strong>0</strong><span>安装</span><small>解压步骤也没有</small></div>
        <div><strong>1</strong><span>文件</span><small>拷走就能继续读</small></div>
      </div>
      <div class="tech">TAURI <i></i> WEBVIEW2 <i></i> EPUB.JS</div>
    `,
  },
  {
    content: `
      <div class="heading compact">
        <span class="sticker">本地优先</span>
        <h2>你的书<br />只留在你的电脑里</h2>
        <p>书架、阅读位置和排版偏好都在本地保存。</p>
      </div>
      <div class="privacy-flow">
        <div class="book-box">EPUB</div><div class="arrow"><span>本地导入</span></div><div class="reader-box">页间</div>
      </div>
      <div class="privacy-list"><div>×<b>无账号</b></div><div>×<b>无上传</b></div><div>×<b>无追踪</b></div></div>
    `,
  },
  {
    theme: "dark",
    content: `
      <div class="code-mark">&lt;/&gt;</div>
      <div class="heading inverse">
        <span class="sticker dark-sticker">FREE & OPEN SOURCE</span>
        <h2>免费使用<br />源码也一起放出</h2>
        <p>基于 Tauri + epub.js，欢迎自己改，也欢迎一起完善。</p>
      </div>
      <div class="repo-card"><span>GitHub</span><b>页间 · EPUB Reader</b><small>仓库链接见置顶评论</small></div>
      <div class="license">MIT LICENSE</div>
    `,
  },
  {
    content: `
      <div class="closing-logo">页</div>
      <div class="heading centered">
        <span class="sticker">最后</span>
        <h2>如果你也只想<br /><em>安静地读一本书</em></h2>
        <p>这款小工具，也许正好适合你。</p>
      </div>
      <div class="cta"><b>评论区留「阅读器」</b><span>下载地址和源码地址放在置顶评论</span></div>
      <div class="pills centered-pills"><b>免费</b><b>无广告</b><b>开源</b></div>
    `,
  },
];
