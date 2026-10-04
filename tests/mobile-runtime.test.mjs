import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installMobileInsets,installVolumePaging,isLowMemoryDevice} from '../app/lib/mobile-runtime.ts';

function environment(){
  const runtime=new EventTarget(),doc=new EventTarget(),properties=new Map(),switches=[];
  Object.assign(doc,{hidden:false,activeElement:null,querySelector:()=>null,documentElement:{style:{setProperty:(key,value)=>properties.set(key,value)}}});
  runtime.PaperyReader={getWindowInsets:()=>JSON.stringify({top:24,bottom:20,left:0,right:0}),setVolumePagingEnabled:value=>switches.push(value)};
  globalThis.window=runtime;globalThis.document=doc;
  return {runtime,doc,properties,switches};
}

test('Insets use native measurements with no native/CSS double padding',()=>{
  const {runtime,properties}=environment();const stop=installMobileInsets();
  assert.equal(properties.get('--native-safe-top'),'24px');assert.equal(properties.get('--native-safe-bottom'),'20px');
  runtime.PaperyReader.getWindowInsets=()=>JSON.stringify({top:0,bottom:0,left:30,right:0});
  runtime.dispatchEvent(new Event('papery-window-insets'));
  assert.equal(properties.get('--native-safe-top'),'0px');assert.equal(properties.get('--native-safe-left'),'30px');
  stop();
});

test('Volume events page only in an active reader, never through a modal or text input',()=>{
  const {runtime,doc,switches}=environment(),pages=[];
  const send=direction=>runtime.dispatchEvent(new CustomEvent('papery-volume-page',{detail:{direction}}));
  const stop=installVolumePaging(true,direction=>pages.push(direction));
  send('next');send('prev');send('unknown');assert.deepEqual(pages,['next','prev']);
  doc.querySelector=()=>({});send('next');assert.equal(pages.length,2);
  doc.querySelector=()=>null;doc.activeElement={matches:()=>true};send('next');assert.equal(pages.length,2);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));send('next');assert.equal(switches.at(-1),false);
  stop();assert.equal(switches.at(-1),false);
  const disabled=installVolumePaging(false,direction=>pages.push(direction));send('next');assert.equal(pages.length,2);disabled();
});

test('Dialog height follows keyboard/rotation and falls back on older WebViews',()=>{
  const {runtime,properties}=environment();runtime.innerHeight=844;
  const stop=installMobileInsets();assert.equal(properties.get('--visible-height'),'844px');
  runtime.innerHeight=412;runtime.dispatchEvent(new Event('resize'));assert.equal(properties.get('--visible-height'),'412px');
  stop();runtime.innerHeight=300;runtime.dispatchEvent(new Event('resize'));assert.equal(properties.get('--visible-height'),'412px');
  const viewport=new EventTarget();viewport.height=700;runtime.visualViewport=viewport;
  const stopVisual=installMobileInsets();viewport.height=320;viewport.dispatchEvent(new Event('resize'));assert.equal(properties.get('--visible-height'),'320px');
  viewport.offsetTop=110;viewport.dispatchEvent(new Event('scroll'));assert.equal(properties.get('--visible-top'),'110px');stopVisual();
  viewport.offsetTop=200;viewport.dispatchEvent(new Event('scroll'));assert.equal(properties.get('--visible-top'),'110px');
});

test('Low-memory adaptation uses native capabilities without changing ordinary devices',()=>{
  const {runtime}=environment();runtime.PaperyReader.getPerformanceProfile=()=>'{"lowMemory":true}';assert.equal(isLowMemoryDevice(),true);
  runtime.PaperyReader.getPerformanceProfile=()=>'{"lowMemory":false}';assert.equal(isLowMemoryDevice(),false);
});
