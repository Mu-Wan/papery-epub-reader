import type { TocItem } from "./reader-types";
type Entry = { id?: string; label?: string; href?: string; subitems?: Entry[]; children?: Entry[] };
/** Labels may repeat across volumes; navigation targets identify the chapter. */
export function epubChapterIndex(toc:TocItem[],item?:{href?:string;label?:string},sectionHref?:string):number {
  const hrefs=toc.map(entry=>{try{return JSON.parse(entry.locator).href as string|undefined}catch{return undefined}});
  if(item?.href){const exact=hrefs.indexOf(item.href);if(exact>=0)return exact;}
  if(sectionHref){const base=(href:string)=>{try{return decodeURI(href.split("#")[0])}catch{return href.split("#")[0]}};const section=hrefs.findIndex(href=>href&&base(href)===base(sectionHref));if(section>=0)return section;}
  const label=item?.label?.trim();return Math.max(0,label?toc.findIndex(entry=>entry.label===label):0);
}
/** Some valid EPUBs have a spine but no navigation document. */
export function epubNavigation(items: Entry[], sections: { id?: string; href?: string; linear?: string }[]): TocItem[] {
  const toc: TocItem[] = [], used = new Set<string>();
  const walk = (entries: Entry[], level = 0, parent = "toc") => entries.forEach((entry, index) => {
    const path = `${parent}-${index}`, candidate = entry.id || path, id = used.has(candidate) ? path : candidate;
    if (typeof entry.href === "string" && entry.href) { used.add(id); toc.push({ id, label: entry.label?.trim() || "未命名章节", level, locator: JSON.stringify({ type: "epub", href: entry.href }) }); }
    walk(entry.subitems || entry.children || [], level + 1, path);
  });
  walk(items || []);
  if (toc.length) return toc;
  for (const section of sections || []) if (section.linear !== "no" && (section.href || section.id)) toc.push({ id: `spine-${toc.length}`, label: `章节 ${toc.length + 1}`, level: 0, locator: JSON.stringify({ type: "epub", href: section.href || section.id }) });
  return toc;
}
