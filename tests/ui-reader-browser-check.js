// Functional browser acceptance. Run with the Playwright CLI against localhost:3100.
// Uses isolated browser storage and checks layout geometry without screenshots.
async (page) => {
  const errors = [];
  let stage = "startup";
  try {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:3100');
  await page.getByRole('heading', { name: '我的书库', exact: true }).waitFor();
  await page.locator('.appShell[data-ready=true]').waitFor();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('papery-library', 3); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['books', 'annotations', 'sessions', 'settings', 'categories'], 'readwrite');
    for (const store of ['books', 'annotations', 'sessions', 'settings', 'categories']) tx.objectStore(store).clear();
    const text = '第一章 远行\n沿着河岸慢慢走，城市在清晨醒来。\n第二章 归途\n把沿途的风景写进笔记。\n';
    const cover = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#293647"/><text x="24" y="120" fill="white" font-size="30">远行</text></svg>');
    for (let i = 0; i < 8; i++) tx.objectStore('books').put({ id: 'ui-book-' + i, title: i ? '书架测试 ' + i : '远行', author: '测试作者', format: 'TXT', category: '未分类', progress: i ? i * 10 : 20, currentLocation: JSON.stringify({ type: 'txt', offset: 0 }), blob: new Blob([text], { type: 'text/plain' }), coverDataUrl: i === 0 ? cover : null, updatedAt: Date.now() });
    tx.objectStore('annotations').put({ id: 'ui-note-1', bookId: 'ui-book-0', style: 'highlight', quote: '沿着河岸慢慢走', note: '阅读中的笔记', locator: JSON.stringify({ type: 'txt', start: text.indexOf('沿着'), end: text.indexOf('沿着') + 7 }), color: '#f3b56f', chapterTitle: '第一章 远行', progress: 20, createdAt: Date.now(), updatedAt: Date.now() });
    for (let i = 0; i < 3; i++) tx.objectStore('sessions').put({ id: 'ui-session-' + i, book_id: 'ui-book-' + i, started_at: Date.now() - (i * 86400000 + 720000), duration_seconds: (i + 1) * 120, words_read: 0 });
    tx.objectStore('settings').put({ key: 'last-read-book-id', value: 'ui-book-0' });
    tx.objectStore('settings').put({ key: 'app', value: { appTheme: 'light', startPage: 'library', density: 'comfortable', profileName: '', autoSync: false } });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    localStorage.removeItem('papery-progress-ui-book-0'); localStorage.setItem('papery-last-book', 'ui-book-0');
  });
  await page.reload();
  await page.locator('.bookCard').nth(7).waitFor();
  const checkGeometry = async (label) => {
    const result = await page.evaluate(() => {
      const surface = document.querySelector('.page');
      const bad = [...document.querySelectorAll('.resumeScene,.shelfPeek,.readingDashboard>article,.noteList,.noteCard,.bookCard')].filter(el => {
        const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2 || el.scrollWidth > el.clientWidth + 2);
      }).map(el => el.className);
      return { pageOverflow: surface.scrollWidth > surface.clientWidth + 2, bad };
    });
    if (result.pageOverflow || result.bad.length) throw new Error(label + ' overflows: ' + JSON.stringify(result));
  };
  const navigate = async (name) => {
    if (!(await page.locator('.sidebar').evaluate(el => el.classList.contains('open') || window.innerWidth > 820))) await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await page.locator('.navList').getByRole('button', { name, exact: true }).click();
  };
  for (const width of [1440, 1024, 820, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    stage = "geometry " + width;
    await checkGeometry('library ' + width);
    const count = await page.locator('.bookCard').evaluateAll(cards => cards.filter(card => getComputedStyle(card).display !== 'none').length);
    if (count !== 8) throw new Error('Books hidden at ' + width);
    await navigate('数据'); await page.getByRole('heading', { name: '阅读数据' }).waitFor(); await checkGeometry('statistics ' + width);
    await page.getByRole('button', { name: '近 30 天', exact: true }).click();
    if (await page.locator('.activityDay').count() !== 30) throw new Error('30-day range failed');
    await navigate('笔记'); await checkGeometry('notes ' + width);
    await navigate('书库');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  stage = "open reader";
  await page.locator('.resumeAction').click();
  await page.locator('.txtReader [data-annotation-id="ui-note-1"]').waitFor();
  stage = 'keyboard annotation';
  await page.locator('.txtReader [data-annotation-id="ui-note-1"]').focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: '编辑笔记', exact: true });
  await editor.waitFor();
  await editor.getByRole('button', { name: '保存笔记', exact: true }).focus();
  await page.keyboard.press('Tab');
  if (!(await editor.getByRole('button', { name: '关闭笔记编辑', exact: true }).evaluate(el => el === document.activeElement))) throw new Error('Editor focus escaped');
  await page.keyboard.press('Escape');
  await editor.waitFor({ state: 'detached' });
  await page.locator('.txtReader [data-annotation-id="ui-note-1"]').click();
  await editor.waitFor();
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这条笔记？', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
  if (await page.locator('.txtReader [data-annotation-id="ui-note-1"]').count() !== 1) throw new Error('Cancel removed the mark');
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这条笔记？', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.locator('.txtReader [data-annotation-id="ui-note-1"]').waitFor({ state: 'detached' });
  if (!(await page.locator('.readerPage').count())) throw new Error('Delete left the reader');
  const deleted = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('papery-library', 3); request.onsuccess = () => resolve(request.result); });
    const get = (store, key) => new Promise(resolve => { const request = db.transaction(store).objectStore(store).get(key); request.onsuccess = () => resolve(request.result); });
    const note = await get('annotations', 'ui-note-1'), tombstone = await get('settings', 'deleted:annotations:ui-note-1'); db.close(); return { exists: !!note, tombstone: !!tombstone };
  });
  if (deleted.exists || !deleted.tombstone) throw new Error('Deletion was not persisted with a sync tombstone');
  stage = "create new note";
  // Create a new note from the actual document selection.
  await page.locator('.txtFlowContent').evaluate(el => { const node = el.querySelector('p').firstChild; const selection = window.getSelection(); const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(7, node.textContent.length)); selection.removeAllRanges(); selection.addRange(range); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
  await page.getByRole('dialog', { name: '添加标注', exact: true }).waitFor();
  await page.getByLabel('笔记内容', { exact: true }).fill('新笔记');
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  stage = 'reader navigation delete';
  await page.getByRole('button', { name: '阅读笔记', exact: true }).click();
  await page.locator('.readerNoteRow').waitFor();
  await page.locator('.readerNoteRow').getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这条笔记？', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.locator('.readerNoteRow').waitFor({ state: 'detached' });
  await page.locator('.txtReader [data-annotation-id]').waitFor({ state: 'detached' });
  await page.locator('.tocPanel').getByRole('button', { name: '关闭阅读导航', exact: true }).click();
  await page.getByRole('button', { name: '返回书库', exact: true }).click();
  await page.reload(); await page.locator('.bookCard').nth(7).waitFor();
  await page.locator('.resumeAction').click(); await page.locator('.txtFlowContent').waitFor();
  if (await page.locator('.txtReader [data-annotation-id]').count()) throw new Error('Deleted marks returned after reload');
  stage = "final persisted check";
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  return ('PASS: 7 viewport widths; all books visible; real range and charts; TXT direct mark delete/cancel; reader list delete; persistent tombstones; reload; no page errors.');
  } catch (error) { throw new Error(stage + ": " + error.message); }
}
