import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lookupTerms,lookupSelection,normalizeLookupText} from '../app/lib/selection-lookup.ts';
const folder='public/dictionary/zh-v1',known=new Set(JSON.parse(fs.readFileSync(folder+'/index.json','utf8')));
test('Bundled simplified Chinese dictionary has real definitions and a declared data license',()=>{
 const manifest=JSON.parse(fs.readFileSync(folder+'/manifest.json','utf8'));assert.ok(known.size>60000);assert.equal(manifest.words,known.size);assert.equal(manifest.language,'zh-Hans');assert.equal(manifest.traditionalAliases,false);assert.ok(manifest.gzipBytes<4*1024*1024);assert.match(fs.readFileSync(folder+'/LICENSE.txt','utf8'),/Attribution-ShareAlike 4.0/);
 for(const word of ['清晨','草木','散步','电流','压力','鳞次栉比','树']){const shard=JSON.parse(fs.readFileSync(folder+'/'+(word.codePointAt(0)%128).toString(16).padStart(2,'0')+'.json','utf8'));assert.ok(shard[word]?.[1]?.length,word);assert.ok(shard[word][1].every(s=>/\p{Script=Han}/u.test(s)&&!s.includes('NOTITLECONVERT')&&!s.includes('的發音和釋義')));}
});

test('Simplified definitions retain provenance links without bundling traditional query aliases',()=>{
 for(const [simple,traditional] of [['电流','電流'],['树','樹'],['阅读','閱讀'],['压力','壓力']]){assert.ok(known.has(simple));assert.ok(!known.has(traditional));const shard=JSON.parse(fs.readFileSync(folder+'/'+(simple.codePointAt(0)%128).toString(16).padStart(2,'0')+'.json','utf8'));assert.match(shard[simple][0],/^https:\/\/zh\.wiktionary\.org\/wiki\/[\x20-\x7e]+$/);assert.ok(shard[simple][1].every(s=>!/[電樹讀壓義體語學]/.test(s)));}
});
test('Automatic segmentation preserves idioms, removes duplicates and ignores function words',()=>{
 const words=lookupTerms('清晨在草木之间散步，清晨。鳞次栉比 风驰电掣。Paper & Light 123',known);assert.ok(words.includes('草木'));assert.ok(words.includes('清晨'));assert.ok(words.includes('散步'));assert.ok(words.includes('鳞次栉比'));assert.ok(words.includes('风驰电掣'));assert.equal(words.length,new Set(words).size);assert.ok(!words.includes('在')&&!words.includes('123'));assert.deepEqual(lookupTerms('的',known),['的']);assert.deepEqual(lookupTerms('123…📚',known),[]);
});
test('Older WebViews need no Intl.Segmenter and text is Unicode-safe and bounded',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');try{Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true});assert.deepEqual(lookupTerms('清晨 草木 清晨',known),['清晨','草木']);}finally{Object.defineProperty(Intl,'Segmenter',descriptor)}
 assert.equal(normalizeLookupText('  清晨\n 草木  '),'清晨 草木');assert.equal(normalizeLookupText('a'.repeat(1200)).length,500);assert.doesNotThrow(()=>lookupTerms('a'.repeat(499)+'📚',known));assert.ok(!/\ud800/.test(normalizeLookupText('词语\ud800含义')));
});
test('Lookup uses only local shards, retries failures and reuses its index',async()=>{
 const original=globalThis.fetch,requests=[];let fail=true;
 globalThis.fetch=async(url,options)=>{requests.push(url);assert.match(url,/^\/dictionary\/zh-v1\/(?:index|[0-7][0-9a-f])\.json$/);assert.equal(options.redirect,'error');if(fail){fail=false;return{ok:false}}return{ok:true,json:async()=>JSON.parse(fs.readFileSync('public'+url,'utf8'))}};
 try{await assert.rejects(lookupSelection('草木'));const result=await lookupSelection('清晨草木散步，电流，鳞次栉比');assert.ok(result.every(entry=>entry.meanings.length));assert.equal(result.find(e=>e.word==='电流').sourceUrl,'https://zh.wiktionary.org/wiki/%E9%9B%BB%E6%B5%81');const count=requests.length;await lookupSelection('清晨草木');assert.equal(requests.length,count);assert.deepEqual(await lookupSelection(' '),[]);}finally{globalThis.fetch=original}
});
