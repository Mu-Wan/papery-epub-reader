/** Completion belongs to the final rendered viewport, never a rounded percentage. */
export function readingProgress(fraction: number, atEnd: boolean) {
  if (atEnd) return 100;
  return Math.max(0, Math.min(99.999, Number.isFinite(fraction) ? fraction * 100 : 0));
}

export function readingPercent(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return progress >= 100 ? 100 : Math.max(0, Math.min(99, Math.round(progress)));
}

export function isScrollEnd(top: number, height: number, total: number, tolerance = 2) {
  return height > 0 && total > 0 && top + height >= total - tolerance;
}

/** Heights are measured from the same typography as the visible TXT document. */
export function scrolledTxtPages(heights: number[], windowStart: number, top: number, viewport: number, padding: number) {
  const height = Math.max(1, viewport);
  const prefix = heights.slice(0, windowStart);
  const pagePending = prefix.some(value => value <= 0);
  const paginationPending = heights.some(value => value <= 0);
  const page = Math.floor((prefix.reduce((sum, value) => sum + value, 0) + Math.max(0, top)) / height) + 1;
  const totalPages = Math.max(1, Math.ceil((heights.reduce((sum, value) => sum + value, 0) + padding * 2) / height));
  return { page: paginationPending ? page : Math.min(page, totalPages), totalPages, pagePending, paginationPending };
}
