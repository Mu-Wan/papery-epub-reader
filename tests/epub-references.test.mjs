import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicationHref,isNoteReference,isNoteBacklink,safeExternalReference} from '../app/lib/epub-references.ts';

test('Publisher references normalize relative paths and decode fragment IDs independently',()=>{
  assert.deepEqual(resolvePublicationHref('../notes/尾注.xhtml#%E6%B3%A8%E9%87%8A%201','OPS/text/chapter.xhtml'),{
    path:'OPS/notes/尾注.xhtml',id:'注释 1',href:'OPS/notes/%E5%B0%BE%E6%B3%A8.xhtml#%E6%B3%A8%E9%87%8A%201',
  });
  assert.equal(resolvePublicationHref('#n1','OPS/chapter.xhtml').path,'OPS/chapter.xhtml');
  assert.equal(resolvePublicationHref('./chapter.xhtml?ignored=true#n1','OPS/chapter.xhtml').id,'n1');
  assert.equal(resolvePublicationHref('OPS/chapter.xhtml#n%23one').id,'n#one');
  assert.equal(resolvePublicationHref('OPS/chapter.xhtml#bad%name').id,'bad%name');
});

test('References recognize EPUB semantics, ARIA and short legacy superscripts',()=>{
  const element=(attributes={},text='1',sup=false)=>({getAttributeNS:()=>attributes['epub:type']||null,getAttribute:name=>attributes[name]||null,className:attributes.class||'',textContent:text,closest:()=>sup?{}:null});
  assert.equal(isNoteReference(element({'epub:type':'noteref'})),true);
  assert.equal(isNoteReference(element({role:'doc-noteref'})),true);
  assert.equal(isNoteReference(element({class:'footnote-link'})),true);
  assert.equal(isNoteReference(element({},'12',true)),true);
  assert.equal(isNoteReference(element({},'这是一条普通章节导航而不是注释',true)),false);
  assert.equal(isNoteReference(element({},'下一章')),false);
  assert.equal(isNoteBacklink(element({'epub:type':'backlink'})),true);
  assert.equal(isNoteBacklink(element({role:'doc-backlink'})),true);
});

test('External note links allow ordinary websites and email without executing publisher scripts',()=>{
  for(const value of ['https://example.org/path','http://example.org','mailto:author@example.org'])assert.equal(safeExternalReference(value),true);
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///local','blob:publisher','OPS/note.xhtml#n'])assert.equal(safeExternalReference(value),false);
  assert.throws(()=>resolvePublicationHref('https://example.org/chapter.xhtml'));
  assert.throws(()=>resolvePublicationHref('//example.org/notes.xhtml'));
});
