// Isolated reader components; never starts the application or a native device.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { ZipWriter, BlobWriter, TextReader, BlobReader, configure } from '@zip.js/zip.js';
const dir=path.resolve('output/diagnostics/reader-media');
fs.mkdirSync(dir,{recursive:true});
const pdf=(scan=false,count=6)=>{
 const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${count} >>`];
 for(let i=0;i<count;i++){
  const stream=scan?'0.8 g 40 40 400 650 re f':Array.from({length:30},(_,j)=>`BT /F1 12 Tf 40 ${710-j*24} Td (Page ${i+1} line ${j+1}. Original fixture words for adjustable reading.) Tj ET`).join('\n');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 750] /Resources << /Font << /F1 ${3+count*2} 0 R >> >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let data='%PDF-1.4\n';const offsets=[0];
 objects.forEach((value,i)=>{offsets.push(data.length);data+=`${i+1} 0 obj\n${value}\nendobj\n`});
 const xref=data.length;data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(value=>`${String(value).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 fs.writeFileSync(path.join(dir,count>6?'large.pdf':scan==='large'?'large.pdf':scan==='chinese'?'chinese.pdf':scan?'scan.pdf':'text.pdf'),data);
};pdf();pdf(true);pdf(false,400);
// Original Chinese PDF with 2.25x baseline spacing and real paragraph indents.
const chineseParagraphs=[
 '清晨沿着河岸散步，树影落在水面，微风轻轻翻过一页。'.repeat(8)+'检索目标在这一段中间，文字应该按阅读窗口宽度自然换行。',
 '午后坐在窗边阅读，桌上的茶渐渐凉了，纸张留下温暖的颜色。'.repeat(4),
 '1.2.4新的阅读章节',
 '新的章节保留独立标题，下面的正文继续按照字体和边距排版。'.repeat(3),
];
let chineseStream='',baseline=850;
for(const paragraph of chineseParagraphs){
 for(let offset=0;offset<paragraph.length;offset+=28){
  const line=paragraph.slice(offset,offset+28),hex=Buffer.from(line,'utf16le').swap16().toString('hex');
  chineseStream+=`BT /F1 16 Tf ${offset===0?82:50} ${baseline} Td <${hex}> Tj ET\n`;baseline-=36;
 }baseline-=20;
}
const chars=[...new Set(chineseParagraphs.join(''))];
const unicode='/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /PaperyUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n'+Array.from({length:Math.ceil(chars.length/100)},(_,i)=>{const group=chars.slice(i*100,(i+1)*100);return group.length+' beginbfchar\n'+group.map(char=>{const hex=Buffer.from(char,'utf16le').swap16().toString('hex');return '<'+hex+'> <'+hex+'>'}).join('\n')+'\nendbfchar\n'}).join('')+'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
const chineseObjects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 1000] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${chineseStream.length} >>\nstream\n${chineseStream}endstream`,'<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>','<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 >>',`<< /Length ${unicode.length} >>\nstream\n${unicode}\nendstream`,'<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /Ascent 880 /Descent -120 /CapHeight 880 /ItalicAngle 0 /StemV 80 >>'];
let chinesePdf='%PDF-1.4\n';const chineseOffsets=[0];
chineseObjects.forEach((obj,i)=>{chineseOffsets.push(chinesePdf.length);chinesePdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
const chineseXref=chinesePdf.length;chinesePdf+='xref\n0 9\n0000000000 65535 f \n'+chineseOffsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${chineseXref}\n%%EOF`;
fs.writeFileSync(path.join(dir,'chinese.pdf'),chinesePdf);fs.writeFileSync(path.join(dir,'chinese-paragraphs.json'),JSON.stringify(chineseParagraphs));
configure({useWebWorkers:false});
const zip=new ZipWriter(new BlobWriter('application/epub+zip'));
for(const [name,text] of Object.entries({
 'mimetype':'application/epub+zip',
 'META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'book.opf':'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">media-check</dc:identifier><dc:title>原创插图测试</dc:title><dc:language>zh</dc:language></metadata><manifest><item id="a" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="sprite" href="sprite.svg" media-type="image/svg+xml"/><item id="b" href="second.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
 'sprite.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><g id="dot"><circle cx="40" cy="40" r="30" fill="#78b98a"/></g></svg>',
 'second.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title><style>html,body,p,span,h1{background:white;color:black}</style></head><body style="background:white"><h1>第二章 原创夜读测试</h1>'+Array.from({length:30},(_,i)=>'<p><span>新的章节也应保持相同纸色与清晰文字，河岸上的灯光倒映在水中。第 '+i+' 段。</span></p>').join('')+'</body></html>',
 'chapter.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>原创插图测试</title></head><body><h1>插图测试</h1><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80"><image href="images/%E5%9B%BE%20%231.png" width="80" height="80"/><use href="sprite.svg#dot" x="80"/></svg><picture><source srcset="images/%E5%9B%BE%20%231.png 1x, images/%E5%9B%BE%20%231.png 2x"/><img src="images/%E5%9B%BE%20%231.png" width="80" height="80"/></picture>'+Array.from({length:100},(_,i)=>`<p>插图兼容性与快速翻页测试第 ${i} 段。这是原创样本文字，用于检查连续点击、选中文字和阅读位置，不包含书籍摘录。河岸边的树影落在水面，微风轻轻翻过一页。</p>`).join('')+'</body></html>',
}))await zip.add(name,new TextReader(text));
await zip.add('images/图 #1.png',new BlobReader(new Blob([fs.readFileSync('public/brand/papery-128.png')])));
fs.writeFileSync(path.join(dir,'images.epub'),Buffer.from(await (await zip.close()).arrayBuffer()));
const entry=`import React,{useState,useCallback} from 'react';import{createRoot}from'react-dom/client';import{DocumentReader}from'../../../app/components/DocumentReader';import{defaultReaderSettings,defaultAppPreferences}from'../../../app/lib/reader-types';import{themedReaderSettings}from'../../../app/lib/app-theme';import{useAppTheme}from'../../../app/components/use-app-theme';import{readReaderSource}from'../../../app/lib/reader-source';import{saveLocalBook,loadLocalBooks}from'../../../app/lib/local-library';
let controls={};window.fixture={location:null,api:null,events:0,selection:null,open:async(format='PDF',scan=false)=>{const blob=await(await fetch(format==='EPUB'?'images.epub':scan==='large'?'large.pdf':scan==='chinese'?'chinese.pdf':scan?'scan.pdf':'text.pdf')).blob();const source=URL.createObjectURL(blob);window.fixture.file={blob,source,format};controls.open({blob,source,format});},reopen:()=>controls.open(window.fixture.file),reopenStored:async()=>{const record=(await loadLocalBooks()).find(b=>b.id==='isolated-media');const file={blob:record.blob,source:URL.createObjectURL(record.blob),format:record.format};window.fixture.file=file;controls.open(file);},close:()=>controls.open(null),settings:patch=>controls.settings(patch),preferences:patch=>controls.preferences(patch),go:page=>window.fixture.api.goTo(JSON.stringify({type:'pdf',page})),next:()=>window.fixture.api.next(),restoreBytes:async()=>{const{blob,source}=window.fixture.file;URL.revokeObjectURL(source);const first=await readReaderSource(source,blob);structuredClone(first,{transfer:[first]});return(await readReaderSource(source,blob)).byteLength;},persist:async()=>{const{blob}=window.fixture.file;await saveLocalBook({id:'isolated-media',title:'fixture',author:'fixture',format:window.fixture.file.format,blob,category:'test',progress:0,updatedAt:1});return(await loadLocalBooks()).find(b=>b.id==='isolated-media').blob.size;}};
function Harness(){const[file,setFile]=useState(null),[epoch,setEpoch]=useState(0),[settings,setSettings]=useState({...defaultReaderSettings,fontFamily:'serif'}),[notes,setNotes]=useState([]),[preferences,setPreferences]=useState({...defaultAppPreferences,appTheme:'light'});const theme=useAppTheme(preferences),effectiveSettings=themedReaderSettings(settings,theme.dark);controls={open:value=>{setFile(value);setEpoch(x=>x+1)},settings:patch=>setSettings(s=>({...s,...patch})),preferences:patch=>setPreferences(p=>({...p,...patch}))};const onApi=useCallback(api=>{window.fixture.api=api},[]),onLocation=useCallback(loc=>{window.fixture.location=loc;window.fixture.events++},[]),onToc=useCallback(toc=>{window.fixture.toc=toc},[]),onSelection=useCallback(selection=>{window.fixture.selection=selection;setNotes([{id:'test-note',bookId:'isolated',locator:selection.locator,quote:selection.quote,style:'highlight',note:'',color:'#ffd36b',chapterTitle:'',progress:0,createdAt:1,updatedAt:1}]);},[]),onAnnotation=useCallback(note=>{window.fixture.edited=note.id},[]);return <div className={"appShell app-"+(theme.dark?"dark":"light")} style={theme.tokens} data-mobile={innerWidth<821?"true":undefined} data-compact-layout={innerWidth<821?"true":undefined}><div className={"readerPage texture-"+settings.paperTexture+(theme.dark?" readerDark":"")} data-reading-ui="hidden" style={{height:'100vh',backgroundColor:effectiveSettings.pageColor}}><div className="readingStage" onClick={e=>{if(file?.format==='EPUB'||e.target.closest('button')||window.getSelection().toString())return;const x=e.clientX/window.innerWidth;if(x>.75)window.fixture.api?.next();else if(x<.25)window.fixture.api?.prev();}}>{file&&<DocumentReader key={epoch} source={file.source} sourceBlob={file.blob} format={file.format} bookId="isolated" settings={effectiveSettings} initialLocation={window.fixture.location?.locator} annotations={notes} onApi={onApi} onLocation={onLocation} onToc={onToc} onSelection={onSelection} onAnnotation={onAnnotation}/>}</div></div></div>};createRoot(document.getElementById('root')).render(<Harness/>);`;
fs.writeFileSync(path.join(dir,'entry.tsx'),entry);
await build({entryPoints:[path.join(dir,'entry.tsx')],bundle:true,format:'esm',target:'es2022',jsx:'automatic',outfile:path.join(dir,'bundle.js')});
let css=['globals','papery-ui','reader-repairs','mobile-repairs','epub-references','control-repairs','collection-repairs','appearance-and-shelves'].map(name=>fs.readFileSync(`app/${name}.css`,'utf8')).join('\n');
fs.writeFileSync(path.join(dir,'style.css'),css.replace(/@import\s+["']tailwindcss["'];/g,'')+'\nhtml,body,#root{margin:0;width:100%;height:100%;overflow:hidden}.appShell{display:block;min-height:0}.readerPage{position:relative;width:100%}.readingStage{position:absolute;inset:0;height:100%;box-sizing:border-box}');
fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="style.css"/><div id="root"></div><script type="module" src="bundle.js"></script></html>');
for(const folder of ['vendor','paper'])fs.cpSync('public/'+folder,path.join(dir,folder),{recursive:true});
console.log('Prepared isolated media component fixture: '+dir);
