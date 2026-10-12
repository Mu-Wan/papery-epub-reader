import type { BookFormat, ReaderSettings } from "./reader-types";

export const READER_DEFAULTS_KEY = "reader-defaults";

/** Typography and saved TXT recognition are shared; PDF mode belongs to each book. */
export function resolveReaderPreferences(defaults: ReaderSettings, profile: Partial<ReaderSettings> | null, book: Partial<ReaderSettings> | null, format: BookFormat, mobile: boolean): ReaderSettings {
  const merged = { ...defaults, ...book, ...profile, txtChapterRule:profile?.txtChapterRule??book?.txtChapterRule, pdfMode:book?.pdfMode??profile?.pdfMode??defaults.pdfMode };
  if(format==="PDF"&&merged.pdfMode!=="text") {merged.horizontalMargin=book?.horizontalMargin??defaults.horizontalMargin;merged.verticalMargin=book?.verticalMargin??defaults.verticalMargin;}
  for(const [field,min,max] of [["fontSize",14,32],["lineHeight",1.3,2.6],["paragraphSpacing",0,36],["verticalMargin",0,300],["horizontalMargin",2,300]] as const){
    const value=merged[field];merged[field]=Number.isFinite(value)?Math.max(min,Math.min(max,value)):defaults[field];
  }
  if(!["system","lxgw","serif","sans"].includes(merged.fontFamily))merged.fontFamily=defaults.fontFamily;
  if(!["paginated","scrolled"].includes(merged.flow))merged.flow=defaults.flow;
  if(!["single","double"].includes(merged.spread))merged.spread=defaults.spread;
  if(!["plain","paper","soft"].includes(merged.paperTexture))merged.paperTexture=defaults.paperTexture;
  if(!/^#[0-9a-f]{6}$/i.test(merged.pageColor))merged.pageColor=defaults.pageColor;
  if (mobile) merged.spread = "single";
  if (format !== "PDF") {
    if (merged.horizontalMargin > 30) merged.horizontalMargin = Math.min(30, Math.round(merged.horizontalMargin / 9));
    merged.horizontalMargin = Math.max(2, merged.horizontalMargin);
    if (merged.verticalMargin > 18) merged.verticalMargin = Math.min(18, Math.round(merged.verticalMargin / 8));
  }
  return merged;
}
