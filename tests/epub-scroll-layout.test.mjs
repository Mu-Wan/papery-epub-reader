import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { continuousTouchPoint, continuousViewportValue, createContinuousStyleResolver } from '../app/lib/epub-scroll-layout.ts';

test('Expanded chapters use reading viewport units, including nested calc values', () => {
  const viewport = { width: 340, height: 650 };
  assert.equal(continuousViewportValue('calc(20vh + 5px)', viewport), 'calc(130px + 5px)');
  assert.equal(continuousViewportValue('10vmin 10vmax 50dvh 20svh 5lvh', viewport), '34px 65px 325px 130px 32.5px');
  assert.equal(continuousViewportValue('100% 10vw auto', viewport), '100% 10vw auto');
  assert.equal(continuousViewportValue('-1.5vh', viewport), '-9.75px');
});

test('CSS URLs, quoted text and variable identifiers stay intact', () => {
  const value = 'url(20vh.png) "50vh" var(--space20vh) 20vh';
  assert.equal(continuousViewportValue(value, { width: 300, height: 600 }), 'url(20vh.png) "50vh" var(--space20vh) 120px');
});

test('Inline chapter viewport lengths stay stable and follow reader resizing', () => {
  const doc = new JSDOM('<!doctype html><article style="padding-top:20vh!important"><svg style="height:50vh"></svg></article>').window.document;
  const resolve = createContinuousStyleResolver();
  resolve(doc, { width: 340, height: 650 }, () => false);
  assert.equal(doc.querySelector('article').style.paddingTop, '130px');
  assert.equal(doc.querySelector('article').style.getPropertyPriority('padding-top'), 'important');
  assert.equal(doc.querySelector('svg').style.height, '325px');
  resolve(doc, { width: 720, height: 800 }, () => false);
  assert.equal(doc.querySelector('article').style.paddingTop, '160px');
  assert.equal(doc.querySelector('svg').style.height, '400px');
});

test('Styles retain their original units and priority across repeated viewport changes', () => {
  const doc = new JSDOM('<!doctype html><style>p {padding-top:20vh!important;color:red}</style>').window.document;
  const resolve = createContinuousStyleResolver(), style = doc.styleSheets[0].cssRules[0].style;
  resolve(doc, { width: 340, height: 650 }, () => false);
  assert.equal(style.getPropertyValue('padding-top'), '130px');
  assert.equal(style.getPropertyPriority('padding-top'), 'important');
  resolve(doc, { width: 340, height: 900 }, () => false);
  assert.equal(style.getPropertyValue('padding-top'), '180px');
  assert.equal(style.getPropertyValue('color'), 'red');
  resolve(doc, { width: 340, height: 900 }, () => false);
  assert.equal(style.getPropertyValue('padding-top'), '180px');
});

test('Height media queries are evaluated against the fixed reading viewport and refreshed', () => {
  const doc = new JSDOM('<!doctype html><style>@media (min-height:1800px){p{margin-bottom:0}} @media (max-width:500px){p{color:red}}</style>').window.document;
  const resolve = createContinuousStyleResolver(), queries = [], [height, width] = doc.styleSheets[0].cssRules;
  resolve(doc, { width: 340, height: 650 }, query => { queries.push(query); return false; });
  assert.equal(height.media.mediaText, 'not all');
  assert.equal(width.media.mediaText, '(max-width:500px)');
  resolve(doc, { width: 340, height: 1900 }, query => { queries.push(query); return true; });
  assert.equal(height.media.mediaText, 'all');
  assert.deepEqual(queries, ['(min-height:1800px)', '(min-height:1800px)']);
});

test('A scrolling iframe never changes the direction of a finger drag', () => {
  const a = continuousTouchPoint({ clientX: 30, clientY: 300 }, { left: 20, top: 100 });
  const b = continuousTouchPoint({ clientX: 30, clientY: 300 }, { left: 20, top: 80 });
  const stationary = continuousTouchPoint({ clientX: 30, clientY: 320 }, { left: 20, top: 80 });
  assert.equal(a.y - b.y, 20);
  assert.deepEqual(a, stationary);
});
