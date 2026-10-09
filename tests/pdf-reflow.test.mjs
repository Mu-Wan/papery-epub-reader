import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPageText, buildPdfReflow, pdfReflowPage, resolvePdfQuote } from '../app/lib/pdf-reflow.ts';
const run=(str,x,y,width=str.length*10)=>({str,transform:[10,0,0,10,x,y],width,height:10});
test('Widely spaced PDF lines reflow as a paragraph, keeping true paragraph gaps and headings',()=>{
  const lines=[run('第一行接着往下阅读',10,200,200),run('第二行仍属于同一段',10,176,200),run('第三行也不能提前换段。',10,152,200),run('新段落正文开始',30,128,180),run('本段的下一行',10,104,200),run('1.2.4新的章节标题',10,70,140),run('标题下面的正文内容',10,46,200)];
  assert.equal(pdfPageText(lines),'第一行接着往下阅读第二行仍属于同一段第三行也不能提前换段。\n\n新段落正文开始本段的下一行\n\n1.2.4新的章节标题\n\n标题下面的正文内容');
});
test('Embedded physical line breaks and spaced Chinese glyphs do not impose a fixed right margin',()=>{
  assert.equal(pdfPageText([run('这是一段\n\r\n正常文字，南湖电 机组。',10,100,200)]),'这是一段正常文字，南湖电机组。');
  assert.equal(pdfPageText([run('ordinary\nEnglish\u00ad words',10,100,200)]),'ordinary English words');
});
test('Whitespace cleanup recovers existing notes and repeated quotes nearest to their saved offset',()=>{
  const text='前一段文字。\n\n这段文字继续阅读。\n\n这段文字继续阅读。';
  const expected=text.lastIndexOf('这段');
  assert.deepEqual(resolvePdfQuote(text,'这段文字\n继续 阅读。',expected-2),{start:expected,end:text.length});
  assert.equal(resolvePdfQuote(text,'不存在的选段',0),null);
});
test('PDF reflow joins Chinese glyphs and Latin words, preserving paragraph gaps',()=>{
  assert.equal(pdfPageText([run('阅读',10,100),run('模式',30,100),run('继续',10,86),run('另一段',10,50)]),'阅读模式继续\n\n另一段');
  assert.equal(pdfPageText([run('Hello',10,100,25),run('world',40,100,25),run('continues',10,86,45)]),'Hello world continues');
});
test('Two-column PDFs read down the first column before the second, below a spanning heading',()=>{
  const items=[run('Title',10,140,280)];
  for(let i=0;i<3;i++){items.push(run(`left${i}`,10,100-i*14,35),run(`right${i}`,200,100-i*14,40));}
  const text=pdfPageText(items);
  assert.ok(text.indexOf('left2')<text.indexOf('right0'),text);
  assert.ok(text.startsWith('Title'));
});
test('Baseline rounding and producer item order do not reverse words in the same PDF line',()=>{
  assert.equal(pdfPageText([run('second',55,100.1,40),run('first',10,100,35)]),'first second');
  assert.equal(pdfPageText([{...run('שלום',70,100,25),dir:'rtl'},{...run('עולם',30,100,25),dir:'rtl'}]),'שלום עולם');
});
test('Blank scan pages keep their original page mapping and an all-scan document stays unsupported',()=>{
  const data=buildPdfReflow(['正文一','', '正文三']);
  assert.equal(data.readable,true);
  assert.equal(pdfReflowPage(data,data.starts[2]),3);
  assert.equal(pdfReflowPage(data,data.starts[1]),2);
  assert.equal(pdfReflowPage(data,data.starts[1]-1),1);
  assert.equal(pdfReflowPage(data,9999),3);
  assert.equal(buildPdfReflow(['','']).readable,false);
});
