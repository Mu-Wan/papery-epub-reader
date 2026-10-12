import test from 'node:test';
import assert from 'node:assert/strict';
import {compileChapterPattern,recognizeTxtChapters,defaultSimpleOptions} from '../app/lib/txt-chapter-rules.mjs';
import {recoverReadingProgress} from '../app/lib/reading-journal.ts';
import {sameReadingAnchor} from '../app/lib/reading-anchor.ts';
import {resolveReaderPreferences} from '../app/lib/reader-preferences.ts';
import {defaultReaderSettings} from '../app/lib/reader-types.ts';

test('Guided simple recognition covers mixed Chinese, full-width, financial, English and Roman headings without changing anchors',()=>{
 const titles=['序章','【第壹佰章】 起点','第１２３章 夜雨','第 50 节 风起','正文 第一回 天光','第一卷 归途','卷二 新路','上卷','Chapter IV: Rain','Chapter One: Dawn','Chapter123. Light','PART II','Volume 2: Road','Book III','001、天光','一、云开','（三）归来','1.2 小节','1.2.3Further Study','终章','番外（二）','附录 A','Epilogue'];
 const text=titles.map(t=>`  ${t}\n普通正文，不应成为章节。\n`).join('');
 const chapters=recognizeTxtChapters(text,{mode:'simple',chapterPattern:'',simple:defaultSimpleOptions});
 assert.deepEqual(chapters.map(c=>c.title),titles);for(const c of chapters)assert.equal(text.slice(c.offset,c.offset+c.title.length),c.title);
 assert.equal(chapters.find(c=>c.title==='第一卷 归途').level,0);assert.equal(chapters.find(c=>c.title==='Chapter IV: Rain').level,1);
});
test('Guided recognition filters dates, decimal-only data, prose using volume measure words and overlong body lines',()=>{
 const titles=['2026-10-12','2026/10/12','12.7','314.159','62.8318','第一部落在山谷中。','第一册书已经看完了','第一章已经讲完了。','I have read Chapter 1 today.','序言介绍了全书的结构','001. '+('正文'.repeat(100))];
 assert.deepEqual(recognizeTxtChapters(titles.join('\n'),{mode:'auto'}),[]);
 const selected={...defaultSimpleOptions,chinese:false,english:false,numeric:false,special:false,volumes:false};
 assert.deepEqual(recognizeTxtChapters('第一章\nChapter 2\n序章\n001、标题',{mode:'simple',chapterPattern:'故事*',simple:selected}),[]);
 assert.equal(recognizeTxtChapters('故事 雨落\n第一章',{mode:'simple',chapterPattern:'故事*',simple:selected}).length,1);
});
test('The saved TXT default overrides legacy per-book rules and automatic reset also overrides them',()=>{
 const legacy={name:'legacy',mode:'regex',chapterPattern:'^old$'},rule={name:'simple',mode:'simple',chapterPattern:'',simple:defaultSimpleOptions};
 assert.equal(resolveReaderPreferences(defaultReaderSettings,{txtChapterRule:rule},{txtChapterRule:legacy},'TXT',false).txtChapterRule,rule);
 const auto={name:'auto',mode:'auto',chapterPattern:''};assert.equal(resolveReaderPreferences(defaultReaderSettings,{txtChapterRule:auto},{txtChapterRule:legacy},'TXT',false).txtChapterRule,auto);
});
test('Simple patterns are anchored and treat regex punctuation literally; Unicode and wildcard matches preserve offsets',()=>{
 const text='前言\n  第一卷 起点\n第一章 天光\n正文\n第二章 下雨\n第二卷 归途\n第三章 归来\n';
 const chapters=recognizeTxtChapters(text,{mode:'simple',chapterPattern:'第*章*',volumePattern:'第*卷*'});
 assert.deepEqual(chapters.map(c=>[c.title,c.level]),[['第一卷 起点',0],['第一章 天光',1],['第二章 下雨',1],['第二卷 归途',0],['第三章 归来',1]]);for(const c of chapters)assert.equal(text.slice(c.offset,c.offset+c.title.length),c.title);
 assert.equal(compileChapterPattern('Chapter (1)*','simple').test('Chapter (1) 标题'),true);assert.equal(compileChapterPattern('Chapter (1)*','simple').test('Chapter 1 标题'),false);
});
test('Regex supports chapter/volume rules, rejects invalid expressions, caps long body lines and does not alter text offsets',()=>{
 const text='卷一 起点\n001. 开场\n正文\n002. 小雨\n'+('003. 正文'.repeat(200))+'\n';
 const chapters=recognizeTxtChapters(text,{mode:'regex',chapterPattern:'^\\d{3}\\. .+$',volumePattern:'^卷[一二三].*$'});assert.equal(chapters.length,3);assert.equal(chapters[2].offset,text.indexOf('002. 小雨'));assert.throws(()=>recognizeTxtChapters(text,{mode:'regex',chapterPattern:'('}),/格式不正确/);
});
test('A later title/cover edit does not supersede the last reading position; stale page writes and malformed journals are ignored',()=>{
 const record={progress:10,currentLocation:'chapter-1',progressUpdatedAt:100,updatedAt:300};
 assert.equal(recoverReadingProgress(record,JSON.stringify({p:80,l:'chapter-50-middle',t:200})).currentLocation,'chapter-50-middle');
 assert.equal(recoverReadingProgress(record,JSON.stringify({p:1,l:'stale',t:99})).currentLocation,'chapter-1');
 for(const raw of ['bad',JSON.stringify({p:Infinity,l:'x',t:400}),JSON.stringify({p:-1,l:'x',t:400})])assert.equal(recoverReadingProgress(record,raw).progress,10);
});
test('A bookmark stays selected when only progress estimation changes',()=>{
 assert.equal(sameReadingAnchor(JSON.stringify({type:'epub',cfi:'point',fraction:.5}),JSON.stringify({type:'epub',cfi:'point',fraction:.5000001})),true);
 assert.equal(sameReadingAnchor(JSON.stringify({type:'epub',cfi:'point'}),JSON.stringify({type:'epub',cfi:'other'})),false);
});
