const READER_FONT = "LXGW WenKai";
let readerFontCss = "";

function absoluteFontRule(rule, base) {
  return rule.cssText.replace(/url\(["']?([^"')]+)["']?\)/g, (_, source) => {
    try { return `url("${new URL(source, base).href}")`; } catch { return `url("${source}")`; }
  });
}

function collectSheet(sheet) {
  for (const rule of sheet.cssRules || []) {
    if (rule.type === CSSRule.FONT_FACE_RULE && rule.cssText.includes(READER_FONT)) {
      readerFontCss += `${absoluteFontRule(rule, sheet.href || location.href)}\n`;
    }
    if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) collectSheet(rule.styleSheet);
  }
}

function collectFontRules() {
  if (readerFontCss) return readerFontCss;
  for (const sheet of document.styleSheets) {
    try {
      collectSheet(sheet);
    } catch {
      // 跨域样式表不可读取时忽略，不影响本地内置字体。
    }
  }
  return readerFontCss;
}

export async function injectReaderFonts(contents) {
  const css = collectFontRules();
  if (css) contents.addStylesheetCss(css, "papery-reader-fonts");
  const text = contents.document.body?.textContent || "页间";
  await contents.document.fonts?.load(`18px "${READER_FONT}"`, text);
}
