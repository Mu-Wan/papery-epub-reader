// Playwright CLI run-code --filename; serve the compiled renderer alone at 3187.
async page => {
  await page.goto('http://127.0.0.1:3187/cycles.html');
  await page.waitForFunction(() => document.getElementById('results').textContent !== 'pending');
  const cycles = await page.evaluate(() => JSON.parse(document.getElementById('results').textContent));
  const checks = cycles.cases.map(item => ({ name: `Stable ${item.name} chapter`, ok: !cycles.errors.length && new Set(item.samples.map(s => s.height)).size === 1 && item.samples.every(s => s.top === 400) }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.evaluate(async () => {
    const { createContinuousRenderer } = await import('./epub-continuous.js');
    const renderer = createContinuousRenderer(); document.body.append(renderer);
    renderer.open({ sections: [{ load: async () => URL.createObjectURL(new Blob(['<!doctype html><body>' + '<p>原创原生滚动测试。</p>'.repeat(160)], { type: 'text/html' })) }] });
    renderer.setStyles('body{font:19px/1.9 serif}p{margin-bottom:14px}');
    await renderer.goTo({ index: 0, anchor: 0 });
    window.nativeRenderer = renderer;
  });
  const position = () => page.evaluate(() => window.nativeRenderer.scroller.scrollTop);
  const move = async y => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y }] });
    await page.waitForTimeout(8);
    return position();
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 500 }] });
  const nativePositions = [];
  for (const y of [476,452,428,404,380,356,332,308]) nativePositions.push(await move(y));
  checks.push({ name: 'Trusted touch scrolls through the chapter using native input', ok: nativePositions.at(-1) > 100 && nativePositions.every((value,i) => !i || value >= nativePositions[i-1]), positions: nativePositions });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const release = await position(); await page.waitForTimeout(200); const settled = await position();
  checks.push({ name: 'Browser fling continues in the same direction', ok: settled > release, release, settled });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 500 }] });
  await move(480); const fine = [await position()];
  for (let n=1;n<=24;n++) fine.push(await move(480-n*.75));
  checks.push({ name: 'Sub-two-pixel drags accumulate without reversal', ok: fine.at(-1) >= fine[0]+12 && fine.every((value,i) => !i || value >= fine[i-1]), positions: fine });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = await position(); await page.waitForTimeout(120);
  checks.push({ name: 'Native cancellation does not start a scripted fling', ok: Math.abs(await position()-cancelled)<=1 });
  await page.evaluate(() => { window.nativeRenderer.destroy(); window.nativeRenderer.remove(); delete window.nativeRenderer; });
  await cdp.detach();
  const interaction = await page.evaluate(async () => {
    const { createContinuousRenderer } = await import('./epub-continuous.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const result = [], loads = new Array(8).fill(0), unloads = new Array(8).fill(0);
    const renderer = createContinuousRenderer(); document.body.append(renderer);
    renderer.open({ sections: loads.map((_, index) => ({
      load: async () => { loads[index]++; return URL.createObjectURL(new Blob(['<!doctype html><html><body><article>' + '<p>原创回归测试段落，不含真实书籍内容。</p>'.repeat(45) + '</article></body></html>'], { type: 'text/html' })); },
      unload: () => unloads[index]++,
    })) });
    renderer.setStyles('body{font:19px/1.9 serif!important}p{margin:0 0 14px}');
    await renderer.goTo({ index: 0, anchor: 0 }); await wait(180);
    renderer.scroller.scrollTop = 350; await wait(100);
    await renderer.goTo({ index: 5, anchor: .2 }); await wait(200);
    const anchor = renderer.captureAnchor();
    const above = renderer.entries[4]; above.doc.body.append(above.doc.createElement('p')); above.doc.body.lastChild.textContent = '新增的原创测试内容。'.repeat(60);
    await wait(150);
    const offset = anchor.entry.element.offsetTop + anchor.range.getBoundingClientRect().top - renderer.scroller.scrollTop;
    result.push({ name: 'Late content above preserves visible text offset', ok: Math.abs(offset - anchor.offset) <= 1, before: anchor.offset, after: offset });
    await renderer.goTo({ index: 0, anchor: .2 }); await wait(180);
    result.push({ name: 'Evicted chapters reload at full content height', ok: renderer.entries[0].ready && renderer.entries[0].iframe.clientHeight > 2000 && loads[0] > 1 });
    const resizedAnchor = renderer.captureAnchor();
    renderer.style.setProperty('width', '720px', 'important');
    renderer.style.setProperty('height', '800px', 'important');
    await wait(180);
    const resizedOffset = resizedAnchor.entry.element.offsetTop + resizedAnchor.range.getBoundingClientRect().top - renderer.scroller.scrollTop;
    result.push({ name: 'Viewport resize preserves visible text and logical media viewport', ok: Math.abs(resizedOffset - resizedAnchor.offset) <= 1 && renderer.mediaViewport.contentWindow.innerHeight === 800, before: resizedAnchor.offset, after: resizedOffset });
    await renderer.goTo({ index: 7, anchor: 1 }); await wait(180);
    result.push({ name: 'Book end remains reachable', ok: renderer.atEnd, top: renderer.scroller.scrollTop, height: renderer.scroller.scrollHeight, viewport: renderer.scroller.clientHeight, final: renderer.entries[7].height, index: renderer.currentIndex });
    renderer.destroy(); renderer.remove();
    result.push({ name: 'Every acquired section is released', ok: loads.every((count, i) => count === unloads[i]), loads, unloads });
    return result;
  });
  checks.push(...interaction);
  return { checks, failures: checks.filter(check => !check.ok).map(check => check.name) };
}
