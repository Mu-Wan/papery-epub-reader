// EPUB and PDF note deletion against small real documents, no screenshot capture.
async (page) => {
  const documents = {"EPUB": "UEsDBBQAAAAAAHZPPl1vYassFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi9lcHViK3ppcFBLAwQUAAAACAB2Tz5dA5cO3I4AAADXAAAAFgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWxVjk0OwiAQha9CZmtadEsKPctIp0qEGQLU6O1FF1V3L3nf+5nmR4rqTqUGYQun8Qizm7xww8BU/h3VWa4WtsJGsIZqGBNV07yRTLyI3xJxMx/M7CXgpiLS1hCpfqVatxiHjO1q4Y324Ch5BZVoCTi0ZyYLmHMMHlu/oIXOufaAv+GFDn0DtJv0T7PeF90LUEsDBBQAAAAIAHZPPl0TDxfuNAEAAEICAAALAAAAY29udGVudC5vcGaNkt1uhCAQhV+FcNsouJu0qVH2rk/Qq94RGddJASmO+/P2RXR/etfEBJk5850DoTlcnGUniBOOvuVVKflBNUF33/oIj/o+1dns8WeGAg14wh4hthwNZwngp5YPRKEW4nw+l2hCX47xKHZSvokx9Fw1DkgbTXqV16a7T4Q52qw2nQALLtEnUZWVSFOmqx92DE12VEEHiNfCjwRFjxeaIzTijzRPEpIF9fEkWCtLz2p/nNMRFfjcue9zUBbimCzo2nLTEUQ31W40Czm57+TutZDvxV5+Slnn76sRy5hal+WYiaM99jCRapDA5ezdoEOicTZE6O/b8jKQs5w5MKgLugZouQ7BYqcpXb7I7Zd0bVw8sbw+3Tjp98bYciNMm+JfUPHIOgX0sNokdnJ6Tpq1m0Jsb0T9AlBLAwQUAAAACAB2Tz5dUIOdgaEAAADbAAAADQAAAGNoYXB0ZXIueGh0bWw1jlsOwiAQRbcyYQEg8auG0g8XYGLcAC2TQqzQwCh1907T+DWPc5J7zbC9FvhgqTGnXmh5EoM1gfjJINVeBKL1olRrTbazzGVWuus6te2OYBWdt4YiLWivwa2ExajjNOqAY/ZfFvWfwy0hM23Nau9sxDTDiDV6BAoIJXIdCY8QKxBuBDzfFT1Qhing9ASXUiZH3Bg8Lrgv0qiVA48otXezP1BLAwQUAAAACAB2Tz5dyQr3g6kAAAD2AAAACQAAAG5hdi54aHRtbFWOSw6DMAwFr4JyAAztogKZsOAAPUMA00SiSRRcPrdv0qy6sfTseSNjf77XYqewGWc7UZeV6CVqjst4sFsnNLNvAY7jKI976cIL6qZp4EyMyFBL/jP+kWb2y4+9VdUDnN9ElJKaJbLhleTgLJPlDSFnhHwd3XxJtGovkrLly1Mn2E2x7laJq5GoCh1o6cSklWcKZX5EDjkWT0sIKgoTC6kEURdnVkOi5RdQSwECFAAUAAAAAAB2Tz5db2GrLBQAAAAUAAAACAAAAAAAAAAAAAAAgAEAAAAAbWltZXR5cGVQSwECFAAUAAAACAB2Tz5dA5cO3I4AAADXAAAAFgAAAAAAAAAAAAAAgAE6AAAATUVUQS1JTkYvY29udGFpbmVyLnhtbFBLAQIUABQAAAAIAHZPPl0TDxfuNAEAAEICAAALAAAAAAAAAAAAAACAAfwAAABjb250ZW50Lm9wZlBLAQIUABQAAAAIAHZPPl1Qg52BoQAAANsAAAANAAAAAAAAAAAAAACAAVkCAABjaGFwdGVyLnhodG1sUEsBAhQAFAAAAAgAdk8+XckK94OpAAAA9gAAAAkAAAAAAAAAAAAAAIABJQMAAG5hdi54aHRtbFBLBQYAAAAABQAFACUBAAD1AwAAAAA=", "PDF": "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MDAgODAwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNjcgPj4Kc3RyZWFtCkJUIC9GMSAyMCBUZiA2MCA3MDAgVGQgKFBhcGVyeSBQREYgYW5ub3RhdGlvbiBkZWxldGlvbiB0ZXN0LikgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQyOAolJUVPRgo="};
  await page.goto('http://localhost:3100');
  await page.locator('.appShell[data-ready=true]').waitFor();
  await page.evaluate(async documents => {
    const db = await new Promise(resolve => { const request = indexedDB.open('papery-library', 3); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(['books', 'settings', 'annotations'], 'readwrite');
    tx.objectStore('annotations').clear();
    for (const [format, encoded] of Object.entries(documents)) {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      const id = 'ui-' + format.toLowerCase();
      tx.objectStore('books').put({ id, title: format + ' 笔记检查', author: '测试文档', format, category: '未分类', progress: 0, blob: new Blob([bytes]), updatedAt: Date.now() });
      tx.objectStore('settings').put({ key: 'reader:' + id, value: { fontFamily: 'system', pageColor: '#f8f8f6', flow: 'paginated', spread: 'single', fontSize: 19, horizontalMargin: 7, verticalMargin: 5, lineHeight: 1.9, paragraphSpacing: 14, paperTexture: 'plain' } });
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  }, documents);
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '阅读《EPUB 笔记检查》', exact: true }).click();
  await page.locator('.foliateView').waitFor();
  await page.waitForFunction(() => document.querySelector('foliate-view')?.renderer?.getContents?.()?.[0]?.doc?.querySelector('p'));
  await page.locator('foliate-view').evaluate(view => {
    const doc = view.renderer.getContents()[0].doc, node = doc.querySelector('p').firstChild;
    const range = doc.createRange(); range.setStart(node, 0); range.setEnd(node, 12);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('dialog', { name: '添加标注', exact: true }).waitFor();
  await page.getByLabel('笔记内容', { exact: true }).fill('EPUB 删除检查');
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await page.getByRole('button', { name: '阅读笔记', exact: true }).click();
  await page.locator('.readerNoteJump').click();
  // Jump highlighting must not restore the deleted annotation when its timer ends.
  await page.waitForFunction(() => {
    const view = document.querySelector('foliate-view'); return view.renderer.getContents()[0]?.overlayer?.element?.children.length > 0;
  });
  await page.locator('foliate-view').evaluate(view => {
    const content = view.renderer.getContents()[0];
    const range = content.doc.createRange(); range.selectNodeContents(content.doc.querySelector('p'));
    const rect = range.getClientRects()[0];
    content.doc.querySelector('p').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 12, clientY: rect.top + rect.height / 2 }));
  });
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).waitFor();
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这条笔记？', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.waitForTimeout(6800);
  const overlayMarks = await page.locator('foliate-view').evaluate(view => view.renderer.getContents().reduce((sum, content) => sum + (content.overlayer?.element?.children.length || 0), 0));
  if (overlayMarks) throw new Error('EPUB deleted highlight returned: ' + overlayMarks);
  await page.getByRole('button', { name: '返回书库', exact: true }).click();
  await page.getByRole('button', { name: '阅读《PDF 笔记检查》', exact: true }).click();
  await page.locator('.pdfTextLayer span').first().waitFor();
  await page.locator('.pdfPage').first().evaluate(el => {
    const node = el.querySelector('.pdfTextLayer span').firstChild, range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 6);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('dialog', { name: '添加标注', exact: true }).waitFor();
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await page.locator('.pdfAnnotation').first().waitFor();
  await page.locator('.pdfAnnotation').first().click();
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).waitFor();
  await page.getByRole('dialog', { name: '编辑笔记', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这条笔记？', exact: true }).getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.locator('.pdfAnnotation').waitFor({ state: 'detached' });
  if (!(await page.locator('.pdfPage').count())) throw new Error('PDF was unmounted on deletion');
  for (const width of [1280,800,390,320]) {
    await page.setViewportSize({width,height:800});
    const overflow=await page.locator('.pdfToolDock').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button')].some(button=>{const b=button.getBoundingClientRect();return b.left<r.left||b.right>r.right||button.scrollWidth>button.clientWidth})});
    if(overflow)throw new Error('PDF toolbar overflow at '+width);
    await page.getByRole('button',{name:'收起 PDF 工具',exact:true}).click();
    const dock=await page.locator('.pdfToolDock').boundingBox(),shell=await page.locator('.pdfReaderShell').boundingBox();if(dock.width>30||Math.abs(dock.x-shell.x)>1)throw new Error('PDF dock did not hide at left');
    if(await page.locator('.pdfZoomControls').count())throw new Error('Collapsed controls still present');
    await page.getByRole('button',{name:'展开 PDF 工具',exact:true}).click();
  }
  await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:'收起 PDF 工具',exact:true}).click();
  await page.screenshot({path:'output/ui-0.1.25/pdf-collapsed.png'});
  return 'PASS: real EPUB selection/save/jump/direct mark/delete and delayed overlay cleanup; real PDF selection/save/direct mark/delete without leaving reading.';
}
