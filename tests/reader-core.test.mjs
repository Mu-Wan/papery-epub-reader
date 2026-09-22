import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfPageOffsets,pageAtOffset} from '../app/lib/reader-math.ts';
import {mergeSnapshots,validateSnapshot} from '../app/lib/sync-merge.ts';
const base=()=>({format:'papery-backup',version:1,exportedAt:'2026-09-21',books:[],annotations:[],settings:[],categories:[],sessions:[]});
const book=(id,t,p)=>({id,updatedAt:t,progress:p,currentLocation:`position-${p}`,format:'TXT',blob:'data:text/plain;base64,YQ=='});
test('Mixed portrait, landscape and square PDF pages map to exact offsets',()=>{
 const offsets=pdfPageOffsets([1.5,.6,1,2],100);
 assert.deepEqual(offsets,[0,174,258,382,606]);
 assert.equal(pageAtOffset(offsets,173-1),1);assert.equal(pageAtOffset(offsets,174),2);
 assert.equal(pageAtOffset(offsets,381-1),3);assert.equal(pageAtOffset(offsets,500),4);assert.equal(pageAtOffset(offsets,-10),1);
});
test('Latest backward reading progress wins over older higher progress',()=>{
 const a={...base(),books:[book('a',100,80)]},b={...base(),books:[book('a',200,20)]};
 assert.equal(mergeSnapshots([a,b]).books[0].progress,20);
 assert.deepEqual(mergeSnapshots([a,b]).books,mergeSnapshots([b,a]).books);
});
test('Offline deletions do not resurrect books or orphan notes',()=>{
 const a={...base(),books:[book('a',100,80)],annotations:[{id:'n',bookId:'a',updatedAt:100}]};
 const b={...base(),tombstones:{'books:a':200}};
 assert.equal(mergeSnapshots([a,b]).books.length,0);assert.equal(mergeSnapshots([a,b]).annotations.length,0);
});
test('Independent device edits merge and credentials never enter sync snapshots',()=>{
 const a={...base(),books:[book('a',100,10)],settings:[{key:'reader:a',value:{fontSize:20},updatedAt:100},{key:'sync:secret',value:'never-upload'}]};
 const b={...base(),books:[book('b',200,20)],settings:[{key:'reader:b',value:{fontSize:22},updatedAt:200}]};
 const merged=mergeSnapshots([a,b]);assert.equal(merged.books.length,2);assert.equal(merged.settings.length,2);assert.ok(!JSON.stringify(merged).includes('never-upload'));
});
test('Corrupt remote files fail validation before local writes',()=>{
 assert.throws(()=>validateSnapshot({...base(),books:[{id:'a',blob:'broken',format:'PDF'}]}));
 assert.throws(()=>validateSnapshot({...base(),annotations:null}));
});
