// EPUB 页数随排版变化，因此显示当前章节中实际渲染出的页码。
const byId = (id) => document.querySelector(`#${id}`);

export function updatePageNumber(location) {
  const start = location?.start?.displayed || location?.end?.displayed || {};
  const end = location?.end?.displayed;
  const output = byId("readerPage");
  if (!output || !location?.start) return;
  const first = Math.max(1, Number(start.page) || 1);
  const last = location.start.index === location.end?.index
    ? Math.max(first, Number(end?.page) || first)
    : first;
  const pages = first === last ? `${first}` : `${first}–${last}`;
  output.textContent = `${pages} / ${Math.max(1, Number(start.total) || 1)}`;
  output.title = "当前章节页码";
}
