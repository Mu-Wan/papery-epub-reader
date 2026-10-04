import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingProgress, readingPercent, isScrollEnd, scrolledTxtPages } from '../app/lib/reading-progress.ts';
import { pageAtOffset, pdfPageOffsets } from '../app/lib/reader-math.ts';

test('Only the final rendered screen completes reading; going back reverses completion', () => {
  assert.equal(readingProgress(.92, true), 100);
  assert.equal(readingProgress(.92, false), 92);
  assert.equal(readingPercent(readingProgress(.99999, false)), 99);
  assert.equal(readingPercent(100), 100);
  assert.equal(readingProgress(NaN, false), 0);
  assert.equal(readingPercent(Infinity), 0);
});

test('Scroll completion requires actual geometry and includes short single-screen documents', () => {
  assert.equal(isScrollEnd(1200, 640, 1840), true);
  assert.equal(isScrollEnd(1100, 640, 1840), false);
  assert.equal(isScrollEnd(0, 640, 200), true);
  assert.equal(isScrollEnd(0, 0, 0), false);
});

test('Vertical TXT counts physical screens with measured section prefixes, not character buckets', () => {
  assert.deepEqual(scrolledTxtPages([2400, 1800, 1200], 1, 600, 600, 60), {
    page: 6, totalPages: 10, pagePending: false, paginationPending: false,
  });
  assert.equal(scrolledTxtPages([2400, 0, 0], 1, 0, 600, 60).pagePending, false);
  assert.equal(scrolledTxtPages([0, 0, 0], 1, 0, 600, 60).pagePending, true);
  assert.equal(scrolledTxtPages([2400, 0, 0], 1, 0, 600, 60).paginationPending, true);
});

test('A short last PDF page can be completely visible while its start is below the scroll origin', () => {
  const offsets = pdfPageOffsets([1.5, 1.5, .3], 400);
  const height = 640, total = offsets.at(-1), top = total - height;
  assert.equal(pageAtOffset(offsets, top), 2);
  const page = isScrollEnd(top, height, total) ? 3 : pageAtOffset(offsets, top);
  assert.equal(page, 3);
  assert.equal(page / 3 * 100, 100);
});
