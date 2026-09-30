import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingStats, durationLabel } from '../app/lib/reading-stats.ts';

const now = new Date(2026, 8, 30, 18);
const books = [{ id: 'a', type: 'TXT', progress: 10 }, { id: 'b', type: 'EPUB', progress: 99 }, { id: 'c', type: 'EPUB', progress: 0 }];
const session = (book_id, started_at, duration_seconds) => ({ book_id, started_at, duration_seconds });

test('Statistics use recorded durations, real format counts and completed progress', () => {
  const stats = readingStats(books, [session('a', new Date(2026, 8, 30, 12).getTime(), 600), session('b', new Date(2026, 8, 29, 12).getTime(), 1200)], 7, now);
  assert.equal(stats.seconds, 1800); assert.equal(stats.activeDays, 2); assert.equal(stats.sessionCount, 2);
  assert.equal(stats.completed, 1); assert.deepEqual(stats.formats.map(x => x.count), [2, 0, 1]);
  assert.deepEqual(stats.bookSeconds, { a: 600, b: 1200 });
});
test('Cross-midnight reading is split across local calendar days', () => {
  const stats = readingStats(books, [session('a', new Date(2026, 8, 29, 23, 50).getTime(), 1200)], 7, now);
  assert.equal(stats.days.at(-2).seconds, 600); assert.equal(stats.days.at(-1).seconds, 600);
  assert.equal(stats.seconds, 1200); assert.equal(stats.sessionCount, 1);
});
test('Time range excludes old sessions and clips sessions crossing its start', () => {
  const stats = readingStats(books, [session('a', new Date(2026, 8, 23, 23, 50).getTime(), 1200), session('b', new Date(2026, 8, 1).getTime(), 500)], 7, now);
  assert.equal(stats.seconds, 600); assert.equal(stats.totalSeconds, 1700);
  assert.equal(stats.bookSeconds.a, 600); assert.equal(stats.bookSeconds.b, undefined);
  assert.equal(readingStats(books, [session('b', new Date(2026, 8, 1).getTime(), 500)], 30, now).seconds, 500);
});
test('Empty libraries and invalid sessions do not invent activity or proportions', () => {
  const stats = readingStats([], [session('a', NaN, 120), session('a', now.getTime(), -20), session('a', now.getTime(), Infinity), session('a', now.getTime() + 1, 60)], 7, now);
  assert.equal(stats.seconds, 0); assert.equal(stats.activeDays, 0); assert.equal(stats.completed, 0);
  assert.deepEqual(stats.formats.map(x => x.count), [0, 0, 0]);
  assert.equal(durationLabel(0), '0 分钟'); assert.equal(durationLabel(25), '不足 1 分钟'); assert.equal(durationLabel(3700), '1 小时 1 分钟');
});
