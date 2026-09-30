// Detailed component acceptance using isolated fixtures.
async (page) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://localhost:3100');
  await page.locator('.appShell[data-ready=true]').waitFor();
  const seed = async count => page.evaluate(async count => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('papery-library', 3); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['books', 'annotations', 'sessions', 'settings', 'categories'], 'readwrite');
    for (const store of ['books', 'annotations', 'sessions', 'settings', 'categories']) tx.objectStore(store).clear();
    const text = '第一章 远行\n沿着河岸慢慢走，城市在清晨醒来。\n第二章 归途\n把沿途的风景写进笔记。\n';
    const cover = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#293647"/><text x="24" y="120" fill="white" font-size="30">远行</text></svg>');
    for (let i = 0; i < count; i++) tx.objectStore('books').put({ id: 'ui-book-' + i, title: i ? '书架测试 ' + i : '远行', author: '测试作者', format: 'TXT', category: '未分类', progress: i ? i * 10 : 20, currentLocation: JSON.stringify({ type: 'txt', offset: 0 }), blob: new Blob([text], { type: 'text/plain' }), coverDataUrl: i === 0 ? cover : null, updatedAt: Date.now() });
    tx.objectStore('annotations').put({ id: 'ui-note-1', bookId: 'ui-book-0', style: 'highlight', quote: '沿着河岸慢慢走', note: '阅读中的笔记', locator: JSON.stringify({ type: 'txt', start: text.indexOf('沿着'), end: text.indexOf('沿着') + 7 }), color: '#f3b56f', chapterTitle: '第一章 远行', progress: 20, createdAt: Date.now(), updatedAt: Date.now() });
    for (let i = 0; i < 3; i++) tx.objectStore('sessions').put({ id: 'ui-session-' + i, book_id: 'ui-book-' + i, started_at: Date.now() - (i * 86400000 + 720000), duration_seconds: (i + 1) * 120, words_read: 0 });
    tx.objectStore('settings').put({ key: 'last-read-book-id', value: 'ui-book-0' });
    tx.objectStore('settings').put({ key: 'app', value: { appTheme: 'light', startPage: 'library', density: 'comfortable', profileName: '', autoSync: false } });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    localStorage.removeItem('papery-progress-ui-book-0'); localStorage.setItem('papery-last-book', 'ui-book-0');
  }, count);

  await seed(2); await page.reload(); await page.locator('.bookCard').nth(1).waitFor();
  await page.setViewportSize({width:1280,height:800});
  await page.locator('.libraryPage').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});
  const geometry = await page.evaluate(()=>{
    const hero=document.querySelector('.resumeScene'), h=hero.getBoundingClientRect();
    const corners=[[h.right-1,h.top+1],[h.right-1,h.bottom-1]].map(([x,y])=>hero.contains(document.elementFromPoint(x,y)));
    const books=[...document.querySelectorAll('.bookCard')].map(el=>el.getBoundingClientRect().bottom);
    const side=document.querySelector('.sidebar').getBoundingClientRect();
    const importStyle=getComputedStyle(document.querySelector('.addBookCard'));
    const cta=getComputedStyle(document.querySelector('.resumeAction'));
    const shelf=document.querySelector('.shelfPeek').getBoundingClientRect();
    const authorHeights=[...document.querySelectorAll('.bookInfo p')].map(el=>el.getBoundingClientRect().height);
    return {corners,books,authorHeights,sidebarBottom:side.bottom,importHeight:document.querySelector('.addBookCard').getBoundingClientRect().height,importDirection:importStyle.flexDirection,ctaColor:cta.color,shelfHeight:shelf.height,heroHeight:h.height};
  });
  if(geometry.corners.some(Boolean)||geometry.books.some(y=>y>780)||geometry.sidebarBottom!==800||geometry.importHeight>48||geometry.importDirection!=='row'||geometry.ctaColor!=='rgb(252, 251, 250)'||geometry.shelfHeight>=geometry.heroHeight)throw new Error('Component geometry '+JSON.stringify(geometry));
  if(geometry.authorHeights.some(height=>height<14))throw new Error('Book author is clipped by obsolete styles');
  await page.screenshot({path:'output/ui-0.1.24-library.png'});
  await page.locator('.navList').getByRole('button',{name:'笔记',exact:true}).click();
  await page.screenshot({path:'output/ui-0.1.24-notes.png'});
  const note=page.locator('.noteOpen').first();await note.focus();await page.keyboard.press('Enter');
  await page.locator('.txtFlowContent').waitFor();await page.getByRole('button',{name:'返回书库',exact:true}).click();
  await page.getByRole('button',{name:'新建分类',exact:true}).click();await page.getByRole('dialog',{name:'新建分类',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.locator('.smallModal').waitFor({state:'detached'});
  await page.getByRole('button',{name:'帮助与快捷键',exact:true}).click();await page.locator('.helpPanel').waitFor();await page.keyboard.press('Escape');await page.locator('.helpPanel').waitFor({state:'detached'});
  await page.locator('.navList').getByRole('button',{name:'数据',exact:true}).click();
  const chartIntro=await page.locator('.readingDashboard').evaluate(el=>el.classList.contains('chartIntro'));
  await page.locator('.readingDashboard').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});
  await page.screenshot({path:'output/ui-0.1.24-data.png'});
  await page.getByRole('button',{name:'近 30 天',exact:true}).click();
  if(await page.locator('.readingDashboard').evaluate(el=>el.classList.contains('chartIntro')))throw new Error('Chart animation blocks range switch');
  await page.locator('.rangeSwitch').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});
  const pill=await page.locator('.rangeSwitch').evaluate(el=>{const selected=el.querySelector('button.active').getBoundingClientRect(),pill=el.querySelector('.selectionPill').getBoundingClientRect();return Math.abs(selected.left-pill.left)+Math.abs(selected.width-pill.width)});
  if(pill>1)throw new Error('Selection capsule geometry is wrong');
  await seed(8);await page.reload();await page.locator('.bookCard').nth(7).waitFor();
  for(const width of [390,800]){
    await page.setViewportSize({width,height:800});
    await page.waitForFunction(()=>document.querySelector('.sidebar')?.inert);
    const layout=await page.evaluate(()=>({bottom:document.querySelector('.workspace').getBoundingClientRect().bottom,titleHeight:document.querySelector('.titleBar').getBoundingClientRect().height}));
    if(layout.bottom>801||layout.titleHeight!==0)throw new Error('Narrow layout vertical overflow '+JSON.stringify(layout));
    const trigger=page.getByRole('button',{name:'打开导航',exact:true});await trigger.click();
    const drawer=page.getByRole('dialog',{name:'主导航',exact:true});await drawer.waitFor();
    await page.waitForFunction(()=>document.activeElement===document.querySelector('.sidebar .mobileClose'));
    await page.keyboard.press('Shift+Tab');
    if(!(await page.locator('.sidebar .syncState').evaluate(el=>el===document.activeElement)))throw new Error('Drawer focus escapes at its first control');
    await page.keyboard.press('Tab');
    if(!(await drawer.getByRole('button',{name:'关闭导航',exact:true}).evaluate(el=>el===document.activeElement)))throw new Error('Drawer focus escapes at its last control');
    await page.keyboard.press('Escape');await drawer.waitFor({state:'detached'});
    if(!(await trigger.evaluate(el=>el===document.activeElement)))throw new Error('Drawer did not restore focus');
    if(width===800){
      await page.locator('.appShell').evaluate(el=>el.dataset.nativeWindow='true');
      const native=await page.evaluate(()=>({bottom:document.querySelector('.workspace').getBoundingClientRect().bottom,titleHeight:document.querySelector('.titleBar').getBoundingClientRect().height}));
      if(native.bottom>801||native.titleHeight!==34)throw new Error('Native narrow window loses controls '+JSON.stringify(native));
      await page.locator('.appShell').evaluate(el=>delete el.dataset.nativeWindow);
    }
  }
  await page.setViewportSize({width:1280,height:800});
  return {result:'PASS: 1280x800 two books fit; physical corner hit testing; compact import; full sidebar; unequal shelf; near white CTA; keyboard note opening; category/help Escape; interruptible chart and sliding capsule; mobile navigation focus trap/restore/Escape; closed navigation inert; no vertical viewport overflow; native narrow window retains controls.',geometry,chartIntro,pill};
}
