import faces from "./reader-font-manifest.json";
/** Complete original glyph coverage, split into independently loaded offline faces. */
export function readerFontCss():string {
  return faces.map(face=>`@font-face{font-family:"LXGW WenKai";font-style:normal;font-weight:300 500;font-display:swap;src:url("${typeof window==="undefined"?face.url:new URL(face.url,window.location.href).href}") format("woff2");unicode-range:${face.range}}`).join("\n");
}
