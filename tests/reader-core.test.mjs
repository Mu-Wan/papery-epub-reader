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
test('A complete library snapshot preserves source files, progress, notes, profile, settings, categories and statistics',()=>{
 const snapshot={...base(),books:[{...book('epub',100,42),title:'测试书',author:'测试作者',category:'文学',coverDataUrl:'data:image/jpeg;base64,YQ=='}],annotations:[{id:'note-1',bookId:'epub',style:'highlight',quote:'原文',note:'我的想法',locator:'epub-cfi',color:'#f3b56f',chapterTitle:'第一章',progress:42,createdAt:10,updatedAt:20}],settings:[{key:'app',value:{profileName:'读者',avatarDataUrl:'data:image/jpeg;base64,YQ=='}},{key:'reader:epub',value:{fontSize:21}}],categories:[{name:'文学',createdAt:5}],sessions:[{id:'session-1',book_id:'epub',started_at:50,duration_seconds:600,words_read:1200}]};
 const restored=mergeSnapshots([snapshot]);
 assert.deepEqual(restored.books,snapshot.books);
 assert.deepEqual(restored.annotations,snapshot.annotations);
 assert.deepEqual(restored.settings,snapshot.settings);
 assert.deepEqual(restored.categories,snapshot.categories);
 assert.deepEqual(restored.sessions,snapshot.sessions);
});
test('Cross-device settings include user profile and reader preferences but exclude device-only data',()=>{
 const snapshot={...base(),settings:[{key:'app',value:{profileName:'读者'},updatedAt:200},{key:'last-read-book-id',value:'book-a',updatedAt:190},{key:'reader:book-a',value:{fontSize:21},updatedAt:180},{key:'analysis:book-a',value:{totalPages:80},updatedAt:220},{key:'cover:book-a',value:'private-cache'},{key:'sync:drive-config',value:{clientId:'client-id'}}]};
 const merged=mergeSnapshots([snapshot]);
 assert.deepEqual(merged.settings.map(item=>item.key),['app','last-read-book-id','reader:book-a']);
 assert.ok(!JSON.stringify(merged).includes('private-cache'));
 assert.ok(!JSON.stringify(merged).includes('client-id'));
});
test('Corrupt remote files fail validation before local writes',()=>{
 assert.throws(()=>validateSnapshot({...base(),books:[{id:'a',blob:'broken',format:'PDF'}]}));
 assert.throws(()=>validateSnapshot({...base(),annotations:null}));
});
