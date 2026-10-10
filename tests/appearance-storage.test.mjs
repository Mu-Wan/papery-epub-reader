import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTheme,colorContrast,themedReaderSettings,themePresets,canvasPresets} from '../app/lib/app-theme.ts';
import {defaultAppPreferences,defaultReaderSettings} from '../app/lib/reader-types.ts';
import {spineGap,spineMetrics,spineRows} from '../app/lib/book-spines.ts';
import {orderedShelfBooks,defaultShelfView} from '../app/lib/library-groups.ts';
import {validPdfReflowCache,PDF_REFLOW_VERSION} from '../app/lib/pdf-reflow-cache.ts';
import {readBlobBytes} from '../app/lib/blob-bytes.ts';
import {fingerprintBuffer} from '../app/lib/reader-resources.mjs';
test('Theme text stays readable for all presets and extreme custom accents in day/night',()=>{
 for(const dark of [false,true])for(const color of [...themePresets.map(p=>p.color),'#ffffff','#000000','#00ff00','#ff00ff','#777777']){
  const t=resolveTheme({...defaultAppPreferences,themePreset:'custom',customAccent:color},dark).tokens;
  for(const [ink,bg]of [['--ink','--canvas'],['--secondary','--surface'],['--accent-ink','--accent-soft'],['--on-accent','--accent'],['--on-solid','--solid']])assert.ok(colorContrast(t[ink],t[bg])>=4.5,`${dark} ${color} ${ink}`);
 }
});
test('System appearance reacts while fixed preferences and saved paper survive',()=>{
 assert.equal(resolveTheme(defaultAppPreferences,true).dark,true);assert.equal(resolveTheme({...defaultAppPreferences,appTheme:'light'},true).dark,false);
 assert.equal(themedReaderSettings(defaultReaderSettings,true).pageColor,'#222729');assert.equal(themedReaderSettings(defaultReaderSettings,false).pageColor,'#F0E6D2');
 assert.equal(themedReaderSettings({...defaultReaderSettings,followTheme:false},true).pageColor,'#222729');
});
test('Shelf packing preserves identity and sequence across empty, dense, narrow and wide rows',()=>{
 const books=Array.from({length:80},(_,i)=>({id:`b${i}`,title:`书${i}`}));
 for(const mobile of [false,true])for(const width of [80,320,800,2400]){const rows=spineRows(books,width,mobile);assert.deepEqual(rows.flat(),books);for(const row of rows)assert.ok(row.reduce((s,b,i)=>s+spineMetrics(b,mobile).width+spineGap(row[i-1],b,mobile),0)<=width);}
 assert.deepEqual(spineRows([],300),[]);assert.ok(new Set(books.map(b=>spineMetrics(b).height)).size>10);assert.ok(new Set(books.map(b=>spineMetrics(b).width)).size>10);
});
test('Canvas and accent controls are independent; derived surfaces keep readable text',()=>{
 for(const dark of [false,true])for(const color of [...canvasPresets.map(p=>p.color),'#000000','#ffffff','#00ff00','#ff00ff','#777777','#ffff00','#ff0000','#0000ff']){
  const preferences={...defaultAppPreferences,appTheme:dark?'dark':'light',canvasPreset:'custom',customCanvas:color};
  const a=resolveTheme(preferences,false),b=resolveTheme({...preferences,themePreset:'grove'},false);
  assert.equal(a.canvas,b.canvas);assert.notEqual(a.accent,b.accent);
  for(const [ink,bg]of [['--ink','--canvas'],['--ink','--surface'],['--secondary','--surface'],['--muted','--surface-muted'],['--on-solid','--solid']])assert.ok(colorContrast(a.tokens[ink],a.tokens[bg])>=4.5,`${dark} ${color} ${ink} ${bg}`);
  for(const ink of ['--ink','--secondary','--muted'])for(const bg of ['--canvas','--surface','--surface-muted','--surface-inset','--sidebar','--accent-wash'])assert.ok(colorContrast(a.tokens[ink],a.tokens[bg])>=4.5,`${dark} ${color} ${ink} on ${bg}`);
  assert.notEqual(a.tokens['--canvas'],a.tokens['--surface']);assert.notEqual(a.tokens['--surface'],a.tokens['--surface-inset']);
 }
 const a=resolveTheme(defaultAppPreferences,false),b=resolveTheme({...defaultAppPreferences,canvasPreset:'sand'},false);assert.equal(a.accent,b.accent);assert.notEqual(a.canvas,b.canvas);
});
test('Author order is the default; other sort choices remain literal and author gaps count toward packing',()=>{
 const books=[{id:'a',title:'B',author:'甲',progress:0,lastReadAt:1,importedAt:1},{id:'b',title:'C',author:'乙',progress:0,lastReadAt:2,importedAt:2},{id:'c',title:'A',author:'甲',progress:0,lastReadAt:3,importedAt:3}];
 assert.equal(defaultShelfView.sortBy,'author');const arranged=orderedShelfBooks(books,defaultShelfView.sortBy);const aa=arranged.filter(b=>b.author==='甲').map(b=>arranged.indexOf(b));assert.equal(aa[1]-aa[0],1);
 assert.deepEqual(orderedShelfBooks(books,'title').map(b=>b.id),['c','a','b']);assert.deepEqual(orderedShelfBooks(books,'recent',new Map(books.map(b=>[b.id,b.lastReadAt]))).map(b=>b.id),['c','b','a']);
 for(const sort of ['recent','title','author','published','imported'])assert.equal(orderedShelfBooks(books,sort).length,3);
 assert.equal(spineGap(books[0],books[2]),3);assert.equal(spineGap(books[0],books[1]),18);assert.equal(spineGap(books[0],books[1],true),14);
 const dense=Array.from({length:80},(_,i)=>({...books[i%3],id:'packed-'+i}));for(const mobile of [false,true])for(const width of [80,320,800])for(const row of spineRows(dense,width,mobile))assert.ok(row.reduce((s,b,i)=>s+spineMetrics(b,mobile).width+spineGap(row[i-1],b,mobile),0)<=width);
});
test('PDF text caches require matching bytes, fingerprint, version and complete pages',()=>{
 const value={version:PDF_REFLOW_VERSION,fingerprint:'abc',bytes:120,pageCount:2,pages:['文字一','文字二']};assert.ok(validPdfReflowCache(value,'abc',120,2));
 for(const patch of [{version:0},{fingerprint:'other'},{bytes:0},{pages:['incomplete']},{pages:[null,'b']}])assert.equal(validPdfReflowCache({...value,...patch},'abc',120,2),false);
});
test('Blob reads reject missing bytes; detached copies never poison persisted files',async()=>{
 const blob=new Blob(['original']);const a=await readBlobBytes(blob);structuredClone(a,{transfer:[a]});assert.equal(a.byteLength,0);assert.equal(new TextDecoder().decode(await readBlobBytes(blob)),'original');await assert.rejects(readBlobBytes(new Blob([])),/为空/);
});
test('PDF cache identity is available without secure-context crypto and detects changed content',async()=>{
 const original=globalThis.crypto;Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});try{const a=await fingerprintBuffer(new TextEncoder().encode('abcdef').buffer),b=await fingerprintBuffer(new TextEncoder().encode('abcdeg').buffer);assert.match(a,/^local-/);assert.notEqual(a,b);}finally{Object.defineProperty(globalThis,'crypto',{value:original,configurable:true});}
});
