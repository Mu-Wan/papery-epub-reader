import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {annotationPaint} from '../app/lib/annotation-color.ts';

// Test the actual TXT helpers without changing the EPUB/PDF implementation or
// booting a browser. TypeScript's parser preserves the production function body.
const source=fs.readFileSync(new URL('../app/components/DocumentReader.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('DocumentReader.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['decodeTxt','parseTxt','paragraphsForRange','buildTxtSections','escapeHtml','renderMarkedText','textAnchorContext','matchingPrefix','matchingSuffix','resolveTextOffset'];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');
const compiled=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {decodeTxt,parseTxt,paragraphsForRange,buildTxtSections,renderMarkedText,textAnchorContext,resolveTextOffset}=new Function('annotationPaint',`${compiled};return {${names.join(',')}}`)(annotationPaint);

test('TXT decodes UTF-8/BOM, UTF-16 and GB18030 without losing Chinese text',()=>{
  const buffer=bytes=>Uint8Array.from(bytes).buffer;
  assert.equal(decodeTxt(buffer(Buffer.from('\uFEFF第一章\n正文'))),'第一章\n正文');
  assert.equal(decodeTxt(buffer([255,254,...Buffer.from('第一章','utf16le')])),'第一章');
  assert.equal(decodeTxt(buffer([254,255,0x7b,0x2c,0x4e,0,0x7a,0xe0])),'第一章');
  assert.equal(decodeTxt(buffer([0xb5,0xda,0xd2,0xbb,0xd5,0xc2])),'第一章');
});

test('Whole TXT content, chapter offsets and section ranges remain contiguous',()=>{
  const book=Array.from({length:18},(_,i)=>`第${i+1}章\r\n${'中文段落。'.repeat(2500)}\r\n`).join('');
  const parsed=parseTxt(book),sections=buildTxtSections(parsed.normalized,parsed.chapters);
  assert.equal(parsed.chapters.length,18);assert.equal(sections[0].start,0);assert.equal(sections.at(-1).end,parsed.normalized.length);
  for(let i=1;i<sections.length;i++)assert.equal(sections[i].start,sections[i-1].end);
  assert.equal(sections.map(s=>parsed.normalized.slice(s.start,s.end)).join(''),parsed.normalized);
  const paragraphs=paragraphsForRange(parsed.normalized,0,sections[0].end);
  for(const p of paragraphs)assert.equal(parsed.normalized.slice(p.start,p.end),p.text);
});

test('TXT progress and note anchors survive reflow, repeated quotes and shifted content',()=>{
  const text='开场文字。\n甲段重复文字。\n乙段重复文字。\n结束。';
  const start=text.indexOf('重复文字',text.indexOf('乙段')),end=start+4,context=textAnchorContext(text,start,end);
  for(const locator of [{type:'txt',offset:start,...context},{type:'txt',start,end,...context}]){
    assert.equal(resolveTextOffset(text,locator),start);
    assert.equal(resolveTextOffset('新增前言。\n'+text,locator),start+6);
  }
  assert.equal(resolveTextOffset(text,{offset:100000}),text.length);
  assert.equal(resolveTextOffset(text,{offset:-100}),0);
});

test('TXT marks preserve exact text, editable note IDs and search cues, including overlap',()=>{
  const raw='中文<&>笔记与搜索',marks=[{start:0,end:7,style:'highlight',color:'#6DAFDF',nonce:0,id:'note-1'},{start:3,end:9,style:'search',color:'#ffb347',nonce:12}];
  const html=renderMarkedText(raw,marks);
  assert.ok(html.includes('data-annotation-id="note-1"'));assert.ok(html.includes('tabindex="0"'));assert.ok(html.includes('data-search-cue="12"'));
  const decoded=html.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  assert.equal(decoded,raw);
});
