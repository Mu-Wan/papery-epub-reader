import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReadingScheduler,momentumStep,pdfRenderPixelRatio,sameReaderLocation} from '../app/lib/reading-scheduler.ts';

function clock(){
  let now=0,id=0;const timers=new Map();
  const api={now:()=>now,later:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id},cancel:id=>timers.delete(id)};
  return {api,advance(target){for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>target)break;now=next[1].at;timers.delete(next[0]);next[1].fn()}now=target},pending:()=>timers.size};
}

test('60/120 Hz scroll analysis is bounded while trailing and final positions remain exact',()=>{
  for(const hz of [60,120]){
    const time=clock(),values=[];let position=0;
    const scheduler=createReadingScheduler(()=>values.push(position),80,time.api);
    for(let frame=0;frame<hz;frame++){time.advance(frame*1000/hz);position=frame;scheduler.request()}
    time.advance(1100);
    assert.equal(values.at(-1),hz-1);assert.ok(values.length<=14,`${hz} Hz: ${values.length}`);
    position=1000;scheduler.request(true);assert.equal(values.at(-1),1000);assert.equal(time.pending(),0);
    position=999;scheduler.request(true);assert.equal(values.at(-1),999);
    scheduler.cancel();
  }
});

test('Exit flush preserves latest offset; cancelling prevents late callbacks',()=>{
  const time=clock(),values=[];let position=0;
  const scheduler=createReadingScheduler(()=>values.push(position),80,time.api);
  scheduler.request();time.advance(10);position=12;scheduler.request();scheduler.flush();
  assert.deepEqual(values,[0,12]);assert.equal(time.pending(),0);
  position=16;scheduler.request();scheduler.cancel();time.advance(200);assert.deepEqual(values,[0,12]);
});

test('Touch inertia travels the same distance at 60 and 120 Hz',()=>{
  const travel=hz=>{let velocity=1.8,distance=0;for(let i=0;i<hz;i++){const step=momentumStep(velocity,1000/hz);distance+=step.distance;velocity=step.velocity}return{distance,velocity}};
  const a=travel(60),b=travel(120);assert.ok(Math.abs(a.distance-b.distance)<.000001);assert.ok(Math.abs(a.velocity-b.velocity)<.000001);
  assert.equal(momentumStep(1,0).distance,0);assert.equal(momentumStep(1,-10).distance,0);
});

test('PDF pixel budget preserves ordinary text clarity and bounds low-memory zoom allocations',()=>{
  assert.equal(pdfRenderPixelRatio(390,550,3,true),2);
  for(const low of [false,true]){const ratio=pdfRenderPixelRatio(2800,4200,3,low);assert.ok(2800*4200*ratio*ratio<=(low?3000000:12000000)+.001)}
});

test('Duplicate reading events are suppressed without merging distinct anchors or pending states',()=>{
  const location={locator:'anchor-a',progress:50,page:5,totalPages:10,chapterTitle:'正文',chapterIndex:0,chapterCount:2};
  assert.equal(sameReaderLocation(null,location),false);assert.equal(sameReaderLocation(location,{...location}),true);
  for(const change of [{locator:'anchor-b'},{progress:100},{page:6},{totalPages:11},{pagePending:true},{paginationPending:true},{chapterIndex:1},{chapterTitle:'下一章'},{chapterCount:3}])assert.equal(sameReaderLocation(location,{...location,...change}),false);
});
