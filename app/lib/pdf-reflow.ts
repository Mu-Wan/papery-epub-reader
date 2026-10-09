export type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean; dir?: string };
type Line = { text: string; x: number; right: number; y: number; height: number };

function cleanPdfText(value: string) {
  return value.replace(/\u0000|\u00ad/g, "").replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "")
    .replace(/\s+(?=[，。；：！？、）】])/gu, "");
}

const standaloneLine=(value:string)=>/^\d{1,4}$/.test(value.trim())
  || /^(?:\d+(?:\.\d+){2,}\s*[^\d.]|\d+\.\d+\s+\D|\d+[、.)]\s|[一二三四五六七八九十]+[、.]|[•●▪◦]\s|第.+[章节]\s)/u.test(value.trim());

function joinText(left: string, right: string, space: boolean) {
  if (!left) return right;
  if (/\s$/.test(left) || /^\s/.test(right)) return left + right;
  // Chinese glyph runs should not acquire spaces; separate Latin words.
  return left + (space && /[\p{L}\p{N}.,;:!?)]$/u.test(left) && /^[\p{L}\p{N}]/u.test(right)
    && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(left)
    && !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(right) ? " " : "") + right;
}

/** Recover lines from glyph coordinates, preserving paragraph gaps and common two-column layouts. */
export function pdfPageText(items: PdfTextItem[]): string {
  const runs = items.filter(item => item.str?.trim() && item.transform?.length === 6).map(item => ({
    text: cleanPdfText(item.str!), x: item.transform![4], y: item.transform![5],
    height: Math.max(1, item.height || Math.hypot(item.transform![2], item.transform![3]) || 12),
    width: Math.max(0, item.width || 0), dir: item.dir,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  const bands: typeof runs[] = [];
  for (const run of runs) {
    const band=bands.at(-1),first=band?.[0];
    if(first&&Math.abs(first.y-run.y)<Math.min(first.height,run.height)*.45)band!.push(run);
    else bands.push([run]);
  }
  const orderedRuns=bands.flatMap(band=>band.sort((a,b)=>band.every(item=>item.dir==="rtl")?b.x-a.x:a.x-b.x));
  const lines: Line[] = [];
  for (const run of orderedRuns) {
    const line = lines.at(-1);
    const gap=line?(run.dir==="rtl"?line.x-run.x-run.width:run.x-line.right):0;
    if (line && Math.abs(line.y - run.y) < Math.min(line.height, run.height) * .45
      && gap < Math.max(line.height, run.height) * 2) {
      line.text = joinText(line.text, run.text, gap > run.height * .12);
      line.right = Math.max(line.right, run.x + run.width);
      line.x = Math.min(line.x,run.x);
    } else lines.push({ text: run.text, x: run.x, right: run.x + run.width, y: run.y, height: run.height });
  }
  if (!lines.length) return "";
  // A repeated gutter separates columns; full-width headings stay above their columns.
  const cuts = [...new Set(lines.map(line => line.x))].sort((a, b) => a - b);
  let ordered = lines;
  for (const cut of cuts) {
    const left = lines.filter(line => line.right < cut - line.height);
    const right = lines.filter(line => line.x >= cut);
    const spanning = lines.filter(line => !left.includes(line) && !right.includes(line));
    if (left.length >= 3 && right.length >= 3 && spanning.every(line => line.y > Math.max(left[0].y, right[0].y))) {
      ordered = [...spanning, ...left, ...right]; break;
    }
  }
  // Infer the document's ordinary baseline spacing instead of treating generous
  // line spacing as a paragraph break. PDF glyph height is not its line height.
  const distances=ordered.slice(1).flatMap((line,index)=>{
    const previous=ordered[index],gap=previous.y-line.y;
    return gap>Math.max(line.height,previous.height)*.7&&Math.abs(line.height-previous.height)<Math.max(line.height,previous.height)*.25?[gap]:[];
  }).sort((a,b)=>a-b);
  const lineSpacing=distances.length?distances[Math.floor((distances.length-1)*.25)]:0;
  const paragraphs: string[] = [];
  let paragraph = "", previous: Line | undefined;
  const leftEdge = Math.min(...lines.map(line => line.x));
  const rightEdge = Math.max(...lines.map(line => line.right));
  for (const line of ordered) {
    const gap = previous ? previous.y - line.y : 0;
    const fontHeight=previous?Math.max(line.height,previous.height):line.height;
    const boundary = previous && (gap < -line.height
      || gap > Math.max(fontHeight*1.5,lineSpacing*1.4)
      || Math.abs(line.height-previous.height)>fontHeight*.25
      || standaloneLine(line.text)||standaloneLine(previous.text)
      || line.x-leftEdge>line.height*1.2&&line.x-previous.x>line.height*1.2
      || /[。！？.!?][”"’']?$/.test(previous.text.trim())&&previous.right-previous.x<(rightEdge-leftEdge)*.7);
    if (boundary && paragraph) { paragraphs.push(paragraph.trim()); paragraph = ""; }
    paragraph = joinText(paragraph, line.text.trim(), true); previous = line;
  }
  if (paragraph) paragraphs.push(paragraph.trim());
  return paragraphs.map(cleanPdfText).join("\n\n");
}

/** Recover existing notes after whitespace/paragraph cleanup changes text offsets. */
export function resolvePdfQuote(text:string,quote:string,expected:number){
  const positions:number[]=[];let normalized="";
  for(let index=0;index<text.length;index++){if(!/[\s\u00ad]/.test(text[index])){normalized+=text[index];positions.push(index);}}
  const needle=quote.replace(/[\s\u00ad]/g,"");if(!needle)return null;
  let cursor=0,best:{start:number;end:number}|null=null;
  while(cursor<normalized.length){const found=normalized.indexOf(needle,cursor);if(found<0)break;
    const start=positions[found],end=positions[found+needle.length-1]+1;
    if(!best||Math.abs(start-expected)<Math.abs(best.start-expected))best={start,end};cursor=found+1;
  }
  return best;
}

export type PdfReflowText = { text: string; starts: number[]; lengths: number[]; readable: boolean };
export function buildPdfReflow(pages: string[]): PdfReflowText {
  let text = "";
  const starts: number[] = [], lengths: number[] = [];
  for (const page of pages) {
    starts.push(text.length);
    const value = page.trim() || "此页没有可提取的文字，请切换原版页面查看。";
    lengths.push(value.length); text += value + "\n\n";
  }
  return { text, starts, lengths, readable: pages.some(page => /[\p{L}\p{N}]/u.test(page)) };
}
export function pdfReflowPage(data: PdfReflowText, offset: number) {
  let low = 0, high = data.starts.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (data.starts[mid] <= offset) low = mid; else high = mid - 1; }
  return low + 1;
}
