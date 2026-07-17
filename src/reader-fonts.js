const READER_FONT = "LXGW WenKai Lite";
let readerFontCss = "";

function collectFontRules() {
  if (readerFontCss) return readerFontCss;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.type === CSSRule.FONT_FACE_RULE && rule.cssText.includes(READER_FONT)) {
          readerFontCss += `${rule.cssText}\n`;
        }
      }
    } catch {
      // 跨域样式表不可读取时忽略，不影响本地内置字体。
    }
  }
  return readerFontCss;
}

export function injectReaderFonts(contents) {
  const css = collectFontRules();
  if (css) contents.addStylesheetCss(css, "papery-reader-fonts");
}
