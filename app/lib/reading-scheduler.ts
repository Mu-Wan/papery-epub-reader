/** Scroll painting follows the display; text location analysis has its own budget. */
import type { ReaderLocation } from "./reader-types";

export function sameReaderLocation(a:ReaderLocation|null,b:ReaderLocation) {
  return !!a&&a.locator===b.locator&&a.progress===b.progress&&a.page===b.page&&a.totalPages===b.totalPages&&a.chapterTitle===b.chapterTitle&&a.chapterIndex===b.chapterIndex&&a.chapterCount===b.chapterCount&&a.paginationPending===b.paginationPending&&a.pagePending===b.pagePending;
}
type Clock = {
  now: () => number;
  later: (callback: () => void, delay: number) => number;
  cancel: (id: number) => void;
};

export function createReadingScheduler(run: () => void, interval = 80, clock: Clock = {
  now: () => performance.now(),
  later: (callback, delay) => window.setTimeout(callback, delay),
  cancel: id => window.clearTimeout(id),
}) {
  let timer: number | null = null, last = -Infinity, pending = false;
  const flush = () => {
    if (timer !== null) clock.cancel(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    last = clock.now();
    run();
  };
  return {
    request(urgent = false) {
      pending = true;
      const remaining = interval - (clock.now() - last);
      if (urgent || remaining <= 0) flush();
      else if (timer === null) timer = clock.later(flush, remaining);
    },
    flush,
    cancel() {
      if (timer !== null) clock.cancel(timer);
      timer = null;
      pending = false;
    },
  };
}

/** Integrate exponential friction over elapsed time, independent of 60/120 Hz. */
export function momentumStep(velocity: number, elapsed: number) {
  const duration = Math.max(0, Math.min(32, elapsed));
  const friction = -Math.log(.92) / (1000 / 60);
  const decay = Math.exp(-friction * duration);
  return { distance: velocity * (1 - decay) / friction, velocity: velocity * decay };
}

export function pdfRenderPixelRatio(width: number, height: number, deviceRatio: number, lowMemory: boolean) {
  const budget = lowMemory ? 3_000_000 : 12_000_000;
  return Math.min(2, deviceRatio || 1, Math.sqrt(budget / Math.max(1, width * height)));
}
