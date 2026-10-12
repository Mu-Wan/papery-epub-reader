import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ensureReaderCompatibility} from '../app/lib/reader-compat.mjs';
import {epubNavigation,epubChapterIndex} from '../app/lib/epub-navigation.ts';
import {resolveReaderPreferences} from '../app/lib/reader-preferences.ts';
import {defaultReaderSettings} from '../app/lib/reader-types.ts';
const oldScope=()=>{const scope=vm.runInNewContext('({Object,Map,Array,Promise})');delete scope.Object.groupBy;delete scope.Map.groupBy;delete scope.Array.prototype.findLast;delete scope.Array.prototype.findLastIndex;delete scope.Array.prototype.at;delete scope.Promise.withResolvers;ensureReaderCompatibility(scope);return scope};
test('Old WebView EPUB grouping supports DOM-style iterables, symbols and prototype-like keys',()=>{
 const {Object:O}=oldScope(),symbol=Symbol('group');const values=new Set(['__proto__','constructor',symbol,'__proto__']);const result=O.groupBy(values,value=>value);
 assert.equal(O.getPrototypeOf(result),null);assert.deepEqual(result.__proto__,['__proto__']);assert.deepEqual(result.constructor,['constructor']);assert.deepEqual(result[symbol],[symbol]);assert.throws(()=>O.groupBy([],null),TypeError);
});
test('Old WebView Map grouping retains object identity and callback indexes',()=>{
 const {Map:M}=oldScope(),a={},b={},seen=[];const result=M.groupBy([a,b,a],(item,index)=>{seen.push(index);return item});assert.deepEqual(result.get(a),[a,a]);assert.deepEqual(result.get(b),[b]);assert.deepEqual(seen,[0,1,2]);
});
test('Old WebView reverse searches include sparse entries and negative array indexes',()=>{
 const {Array:A}=oldScope(),values=[1,,3];assert.equal(A.prototype.findLastIndex.call(values,v=>v===undefined),1);assert.equal(A.prototype.findLast.call(values,v=>v<3),1);assert.equal(A.prototype.at.call(values,-1),3);assert.equal(A.prototype.at.call(values,Infinity),undefined);assert.equal(A.prototype.at.call(values,-10),undefined);
});
test('Old WebView promise resolvers settle normally and native implementations stay intact',async()=>{
 const scope=oldScope(),deferred=scope.Promise.withResolvers();deferred.resolve('ready');assert.equal(await deferred.promise,'ready');const before=scope.Object.groupBy;ensureReaderCompatibility(scope);assert.equal(scope.Object.groupBy,before);
});
test('EPUB directory selects the current target when chapter labels repeat',()=>{
 const toc=epubNavigation([{label:'正文',href:'one.xhtml'},{label:'正文',href:'two.xhtml'},{label:'正文',href:'two.xhtml#middle'}],[]);
 assert.equal(epubChapterIndex(toc,{label:'正文',href:'two.xhtml#middle'},'two.xhtml'),2);assert.equal(epubChapterIndex(toc,undefined,'two.xhtml'),1);
});
test('Global typography overrides old book layouts while each TXT rule and PDF display mode survive',()=>{
 const rule={mode:'simple',name:'本书章节',chapter:'第*章'};
 const result=resolveReaderPreferences(defaultReaderSettings,{fontSize:27,fontFamily:'sans',spread:'double'},{fontSize:17,txtChapterRule:rule},'TXT',true);assert.equal(result.fontSize,27);assert.equal(result.fontFamily,'sans');assert.equal(result.spread,'single');assert.equal(result.txtChapterRule,rule);
 const pdf=resolveReaderPreferences(defaultReaderSettings,{fontSize:27,horizontalMargin:7},{pdfMode:'original',horizontalMargin:120},'PDF',false);assert.equal(pdf.horizontalMargin,120);assert.equal(pdf.pdfMode,'original');
});
