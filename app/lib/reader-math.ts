export function pdfPageOffsets(ratios: number[], width: number, gap = 24) {
  const offsets = [0];
  for (const ratio of ratios) offsets.push(offsets[offsets.length - 1] + width * ratio + gap);
  return offsets;
}
export function pageAtOffset(offsets: number[], top: number) {
  let low = 0, high = offsets.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= top + 1) low = middle; else high = middle - 1;
  }
  return Math.max(1, low + 1);
}
