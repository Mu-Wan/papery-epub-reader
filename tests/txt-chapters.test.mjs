import test from 'node:test';
import assert from 'node:assert/strict';
import {compileChapterPattern,recognizeTxtChapters} from '../public/vendor/txt-chapter-rules.mjs';
import {recoverReadingProgress} from '../app/lib/reading-journal.ts';
import {sameReadingAnchor} from '../app/lib/reading-anchor.ts';
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
