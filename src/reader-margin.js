const byId = (id) => document.querySelector(`#${id}`);
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export function marginKeys() {
  const compact = byId("readerStage").clientWidth <= 620;
  return compact
    ? ["compactHorizontalMargin", "compactVerticalMargin"]
    : ["horizontalMargin", "verticalMargin"];
}

export function applyMargins(preferences) {
  const [horizontal, vertical] = marginKeys();
  const view = byId("readerView");
  view.style.setProperty("--reader-margin-x", `${preferences[horizontal]}px`);
  view.style.setProperty("--reader-margin-y", `${preferences[vertical]}px`);
}

export function createMarginController(preferences, getRendition, getLocation) {
  let timer;
  let token = 0;

  async function commit() {
    clearTimeout(timer);
    const current = ++token;
    const view = byId("readerView");
    view.classList.add("is-reflowing");
    await frame();
    applyMargins(preferences);
    await frame();
    const rendition = getRendition();
    if (rendition) await rendition.resize(undefined, undefined, getLocation());
    await frame();
    await frame();
    if (current === token) view.classList.remove("is-reflowing");
  }

  function schedule() {
    byId("readerView").classList.add("is-reflowing");
    clearTimeout(timer);
    timer = setTimeout(commit, 120);
  }

  return { apply: () => applyMargins(preferences), schedule, commit };
}
