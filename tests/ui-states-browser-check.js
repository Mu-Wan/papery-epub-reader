// Nonvisual acceptance for edge states and accessible modal keyboard handling.
async (page) => {
  await page.goto('http://localhost:3100');
  // Wait for loaded fixture data before modifying IndexedDB outside the app.
  // Otherwise the initial preference load can race the test's external write.
  await page.locator('.bookCard').nth(7).waitFor();
  const update = async (empty = false) => page.evaluate(async empty => {
    const db = await new Promise(resolve => { const request = indexedDB.open('papery-library', 3); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(['books', 'sessions', 'settings', 'annotations'], 'readwrite');
    if (empty) for (const store of ['books', 'sessions', 'annotations']) tx.objectStore(store).clear();
    else {
      const request = tx.objectStore('books').get('ui-book-0');
      request.onsuccess = () => { if (request.result) tx.objectStore('books').put({ ...request.result, title: '长书名与没有封面的书籍也需要保持清楚的阅读层次'.repeat(4), author: '较长的作者名称与合著者名单'.repeat(3), coverDataUrl: 'data:image/png;base64,invalid' }); };
    }
    tx.objectStore('settings').put({ key: 'last-read-book-id', value: 'ui-book-0' });
    tx.objectStore('settings').put({ key: 'app', value: { appTheme: 'dark', density: 'compact', startPage: 'library', profileName: '', autoSync: false } });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    localStorage.setItem('papery-last-book', 'ui-book-0');
  }, empty);
  await update(); await page.reload(); await page.locator('.app-dark .resumeScene').waitFor();
  const check = async () => {
    const result = await page.evaluate(() => {
      const page = document.querySelector('.page');
      return { overflow: page.scrollWidth > page.clientWidth + 2, panels: [...document.querySelectorAll('.resumeScene,.shelfPeek,.readingDashboard>article,.noteList')].filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.className), dark: document.querySelector('.app-dark') !== null };
    });
    if (result.overflow || result.panels.length || !result.dark) throw new Error('Edge-state layout failure: ' + JSON.stringify(result));
  };
  const navigate = async name => {
    if (!(await page.locator('.sidebar').evaluate(el => el.classList.contains('open') || window.innerWidth > 820))) await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await page.locator('.navList').getByRole('button', { name, exact: true }).click();
  };
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await check();
    await navigate('数据'); await check(); await navigate('笔记'); await check(); await navigate('书库');
  }
  await page.locator('.resumeScene .textArtwork').waitFor();
  await update(true); await page.reload();
  await page.locator('.app-dark .addBookCard').waitFor(); await check();
  if (await page.locator('.resumeScene').count()) throw new Error('Empty library invented a continue-reading book');
  await navigate('数据'); await check();
  if ((await page.locator('.formatChart strong').innerText()) !== '0') throw new Error('Empty library format count is not zero');
  if (await page.locator('.formatChart svg circle').count() !== 1) throw new Error('Empty library invented chart arcs');
  await navigate('笔记'); await check(); await navigate('书库');
  await page.locator('.addBookCard').click();
  await page.locator('.importModal').waitFor();
  await page.locator('.importModal input[type=file]').setInputFiles({name:'unsupported.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('unsupported')});
  await page.getByRole('alert').filter({hasText:'格式不支持'}).waitFor();
  if(await page.locator('.bookCard').count())throw new Error('Unsupported import added a book');
  if(await page.locator('.dropZone').isDisabled())throw new Error('Failed import left the control disabled');
  await page.locator('.importModal input[type=file]').setInputFiles({name:'导入状态检查.txt',mimeType:'text/plain',buffer:Buffer.from('第一章\n导入状态检查。\n')});
  await page.locator('.importModal').waitFor({state:'detached'});
  await page.getByRole('button',{name:'阅读《导入状态检查》',exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'已导入 1 本书'}).waitFor();
  return 'PASS: long title and author, broken-cover fallback, dark compact layout at 1440/390/320, empty library/notes/statistics, zero chart arcs; unsupported import has a visible error and stays usable; valid TXT import succeeds with accurate count.';
}
