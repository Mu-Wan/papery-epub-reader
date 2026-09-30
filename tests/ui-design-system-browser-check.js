// Automated material, contrast and layout acceptance; no screenshots.
// Run after ui-reader-browser-check.js so isolated browser fixtures are present.
async (page) => {
  const resetMedia = await page.context().newCDPSession(page);
  await resetMedia.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
  await page.goto('http://localhost:3100');
  await page.getByRole('heading', { name: '我的书库', exact: true }).waitFor();
  await page.locator('.appShell[data-ready=true]').waitFor();
  if (await page.locator('.bookCard').count() !== 8) {
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
  }
  await page.locator('.bookCard').nth(7).waitFor();
  const reports = [];
  const openSidebar = async () => {
    if (!(await page.locator('.sidebar').evaluate(el => el.classList.contains('open') || innerWidth > 820))) await page.getByRole('button', { name: '打开导航', exact: true }).click();
  };
  const audit = async (label, selector) => {
    await page.locator(selector).waitFor();
    await page.locator(selector).evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    const result = await page.evaluate(({ selector }) => {
      const surface = document.querySelector(selector), style = getComputedStyle(surface), rect = surface.getBoundingClientRect();
      const rgb = value => value.match(/[\d.]+/g).map(Number);
      const blend = (fg, bg) => { const a = fg[3] ?? 1; return fg.slice(0, 3).map((n, i) => n * a + bg[i] * (1 - a)); };
      const luminance = c => c.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
      const contrast = (fg, bg) => (Math.max(luminance(fg), luminance(bg)) + .05) / (Math.min(luminance(fg), luminance(bg)) + .05);
      const base = rgb(getComputedStyle(document.querySelector('.appShell')).backgroundColor);
      const asRgb = color => { const el = document.createElement('span'); surface.append(el); el.style.color = color; const value = rgb(getComputedStyle(el).color); el.remove(); return value; };
      const tokenRgb = token => asRgb(`var(${token})`);
      const pairs = [
        ['body', '--ink', '--canvas'], ['secondary', '--muted', '--surface-muted'], ['body secondary', '--secondary', '--surface-muted'],
        ['selected', '--accent-ink', '--surface-selected'], ['solid', '--on-solid', '--solid'],
        ['overlay', '--muted', '--frost-overlay'], ['status', '--accent-ink', '--accent-soft'],
      ].map(([name, fg, bg]) => ({ name, ratio: contrast(tokenRgb(fg), blend(tokenRgb(bg), base)) }));
      pairs.push({ name: 'overlay on black', ratio: contrast(tokenRgb('--overlay-muted'), blend(tokenRgb('--frost-overlay'), [0, 0, 0])) });
      pairs.push({ name: 'overlay on white', ratio: contrast(tokenRgb('--overlay-muted'), blend(tokenRgb('--frost-overlay'), [255, 255, 255])) });
      const badBorders = [...surface.querySelectorAll('.fontChoices button,.choiceGrid button,.choiceRows button,.noteBody,.guideSteps article,.syncCallback,input:not([type=range]):not([type=checkbox]):not([type=color]),textarea')].filter(el => {
        const s = getComputedStyle(el); return el.getBoundingClientRect().width && [s.borderTopWidth, s.borderLeftWidth, s.borderRightWidth, s.borderBottomWidth].some(v => parseFloat(v) > 0);
      }).map(el => el.className || el.tagName);
      const library = document.querySelector('.libraryPage');
      if (library && selector === '.page') {
        const hero = document.querySelector('.resumeScene');
        if (hero) {
          if (!getComputedStyle(hero).clipPath.includes('28px') || getComputedStyle(hero).overflow !== 'clip') throw new Error('Hero corner clipping is missing');
          if (getComputedStyle(document.querySelector('.resumeCopy')).backdropFilter !== 'none') throw new Error('Structural hero content is frosted');
        }
        if (document.querySelector('.bookGrid .addBookCard')) throw new Error('Placeholder import tile returned');
        if (innerWidth > 820) {
          const side = document.querySelector('.sidebar').getBoundingClientRect();
          if (Math.abs(side.bottom - innerHeight) > 1) throw new Error('Sidebar leaves a bottom strip');
        }
        const weights = [...new Set([...library.querySelectorAll('h1,h2,h3,strong,b,button,p,small')].filter(el => el.getClientRects().length).map(el => getComputedStyle(el).fontWeight))];
        if (weights.some(weight => !['400','600'].includes(weight))) throw new Error('Unexpected UI font weights: ' + weights.join(','));
        if (!document.querySelector('.app-dark')) {
          const expected = {'--canvas':'#FCFBFA','--surface':'#FBFAF9','--surface-muted':'#F8F6F4','--surface-inset':'#F5F2EF','--ink':'#202124','--secondary':'#5B5C60','--muted':'#858589','--blue':'#6DAFDF','--blue-deep':'#4E8FC3','--blue-text':'#356E9D','--blue-soft':'#E8F4FB'};
          for (const [token, value] of Object.entries(expected)) if (JSON.stringify(tokenRgb(token)) !== JSON.stringify(asRgb(value))) throw new Error('Palette drift: ' + token);
        }
      }
      return {
        background: getComputedStyle(document.querySelector('.appShell')).backgroundColor,
        overflow: surface.scrollWidth > surface.clientWidth + 2 || rect.left < -2 || rect.right > innerWidth + 2,
        border: [style.borderTopWidth, style.borderLeftWidth, style.borderRightWidth, style.borderBottomWidth].some(v => parseFloat(v) > 0),
        blur: style.backdropFilter, badBorders, pairs,
        subtitles: surface.querySelectorAll('.headerTitle p,.panelHeader small').length,
      };
    }, { selector });
    if (result.overflow || result.border || result.badBorders.length || result.subtitles) throw new Error(label + ' surface failure ' + JSON.stringify(result));
    const low = result.pairs.filter(pair => pair.ratio < (['secondary','overlay','overlay on black','overlay on white'].includes(pair.name) ? 3 : 4.5));
    if (low.length) throw new Error(label + ' text contrast ' + JSON.stringify(low));
    if (selector !== '.page' && !result.blur.includes('blur(')) throw new Error(label + ' material is disabled');
    reports.push({ label, minimumTextContrast: Math.min(...result.pairs.map(pair => pair.ratio)).toFixed(2) });
    return result;
  };
  const closePanel = async selector => {
    await page.locator(selector + ' .panelHeader>button').click();
    await page.locator(selector).waitFor({ state: 'detached' });
  };
  const closeSidebar = async () => {
    if (await page.locator('.sidebar').evaluate(el => el.classList.contains('open') && innerWidth <= 820)) {
      const width = await page.locator('.scrim').evaluate(el => el.clientWidth);
      await page.locator('.scrim').click({ position: { x: width - 3, y: 80 } });
      await page.locator('.sidebar').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    }
  };
  for (const theme of ['浅色', '深色']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSidebar(); await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.locator('.settingsPanel').getByRole('button', { name: theme, exact: true }).click();
    await closePanel('.settingsPanel');
    if (theme === '浅色' && (await audit('light canvas', '.page')).background !== 'rgb(252, 251, 250)') throw new Error('Canvas is not #FCFBFA');
    const activeNav = await page.locator('.navList .active').evaluate(el => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
    if (activeNav.fg === activeNav.bg) throw new Error('Active navigation loses contrast');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await audit(theme + ' library ' + width, '.page');
      await openSidebar(); await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      await audit(theme + ' settings ' + width, '.settingsPanel');
      await page.locator('.settingsPanel').getByRole('button', { name: '关闭偏好设置', exact: true }).click();
      await openSidebar(); await page.getByRole('button', { name: '用户资料与同步', exact: true }).click();
      await audit(theme + ' profile ' + width, '.profilePanel'); await closePanel('.profilePanel');
      await openSidebar(); await page.getByRole('button', { name: '用户资料与同步', exact: true }).click(); await page.getByRole('button',{name:'云同步',exact:true}).click();
      await audit(theme + ' sync ' + width, '.profilePanel');
      await page.locator('.syncPanel details').first().locator('summary').click();
      await audit(theme + ' expanded sync ' + width, '.profilePanel'); await closePanel('.profilePanel');
      await closeSidebar();
      await page.locator('.addBookCard').click();
      await audit(theme + ' import ' + width, '.importModal'); await closePanel('.importModal');
      await page.locator('.resumeAction').click(); await page.locator('.txtFlowContent').waitFor();
      await page.getByRole('button', { name: '排版', exact: true }).click();
      await audit(theme + ' reader settings ' + width, '.readerSettingsPanel'); await closePanel('.readerSettingsPanel');
      await page.getByRole('button', { name: '书内搜索', exact: true }).click();
      await audit(theme + ' search ' + width, '.bookSearchPanel'); await closePanel('.bookSearchPanel');
      await page.getByRole('button', { name: '目录', exact: true }).click();
      await audit(theme + ' contents ' + width, '.tocPanel'); await closePanel('.tocPanel');
      await page.getByRole('button', { name: '返回书库', exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSidebar(); await page.getByRole('button', { name: '偏好设置', exact: true }).click();
  await page.locator('.settingsPanel').getByRole('button', { name: '浅色', exact: true }).click();
  const client = resetMedia;
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  const reduced = await page.locator('.settingsPanel').evaluate(el => ({ enabled: matchMedia('(prefers-reduced-transparency: reduce)').matches, blur: getComputedStyle(el).backdropFilter, background: getComputedStyle(el).backgroundColor }));
  if (!reduced.enabled || reduced.blur !== 'none' || reduced.background !== 'rgb(251, 250, 249)') throw new Error('Reduced transparency does not provide an opaque fallback: ' + JSON.stringify(reduced));
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] }); await client.detach();
  await closePanel('.settingsPanel');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('.resumeArtworkButton').evaluate(el => getComputedStyle(el).transitionDuration);
  if (parseFloat(duration) > .001) throw new Error('Reduced motion failed');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return { result: 'PASS: both themes; 1440/390/320 widths; exact palette, clipped hero corners, full height sidebar, two font weights, no placeholder tile; borderless settings, profile, sync, import, reader settings, search and contents; single-line headings; primary text >= 4.5; muted decorative text >= 3; translucent materials; reduced transparency and motion.', reports };
}
