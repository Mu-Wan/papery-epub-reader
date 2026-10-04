import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingSessionClock} from '../app/lib/reading-session.ts';
import {mergeSnapshots} from '../app/lib/sync-merge.ts';

test('TXT records visible reading before leaving the reader and updates one session',()=>{
  const clock=new ReadingSessionClock();clock.start('txt','s1',1000);
  assert.equal(clock.checkpoint(1800),null);
  const first=clock.checkpoint(6000),second=clock.checkpoint(11000);
  assert.equal(first.book_id,'txt');assert.equal(first.duration_seconds,5);
  assert.equal(second.id,first.id);assert.equal(second.duration_seconds,10);
  assert.equal(clock.checkpoint(11000),null);
  assert.equal(clock.pause(16000).duration_seconds,15);
  assert.equal(clock.pause(17000),null);
});

test('Background time is excluded, switching books cannot charge the previous book to the next',()=>{
  const clock=new ReadingSessionClock();clock.start('txt','s1',1000);
  assert.equal(clock.pause(7000).book_id,'txt');
  assert.equal(clock.checkpoint(107000),null);
  clock.start('epub','s2',107000);
  const next=clock.pause(114000);
  assert.equal(next.book_id,'epub');assert.equal(next.duration_seconds,7);
  assert.equal(next.started_at,107000);
});

test('Clock changes and duplicate checkpoints do not invent time or duplicate sessions',()=>{
  const clock=new ReadingSessionClock();clock.start('pdf','s1',2000);
  assert.equal(clock.checkpoint(1000),null);
  assert.equal(clock.checkpoint(5000).duration_seconds,3);
  assert.equal(clock.checkpoint(4000),null);
  assert.equal(clock.pause(5000),null);
});

test('Newer checkpoints remain portable without changing backup format version',()=>{
  const clock=new ReadingSessionClock();clock.start('txt','s1',1000);
  const first=clock.checkpoint(6000),second=clock.checkpoint(11000);
  const base={format:'papery-backup',version:1,books:[],annotations:[],settings:[],categories:[],sessions:[]};
  const merged=mergeSnapshots([{...base,sessions:[second]},{...base,sessions:[first]}]);
  assert.equal(merged.sessions.length,1);assert.equal(merged.sessions[0].duration_seconds,10);
  assert.equal(merged.version,1);
});
