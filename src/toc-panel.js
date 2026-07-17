const byId = (id) => document.querySelector(`#${id}`);

function createEntries(items, onSelect, depth = 0) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label?.trim() || "未命名章节";
    button.style.setProperty("--toc-depth", depth);
    button.addEventListener("click", () => onSelect(item.href));
    fragment.append(button);
    if (item.subitems?.length) fragment.append(createEntries(item.subitems, onSelect, depth + 1));
  });
  return fragment;
}

export function setupTocPanel(onNavigate) {
  const dialog = byId("tocPanel");
  const button = byId("tocButton");
  const list = byId("tocList");
  const close = () => dialog.open && dialog.close();
  button.addEventListener("click", () => {
    if (dialog.open) close();
    else {
      dialog.showModal();
      button.setAttribute("aria-expanded", "true");
    }
  });
  byId("tocDoneButton").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => button.setAttribute("aria-expanded", "false"));
  dialog.addEventListener("cancel", () => button.setAttribute("aria-expanded", "false"));

  return (items = []) => {
    const navigate = async (href) => { close(); await onNavigate(href); };
    list.replaceChildren(createEntries(items, navigate));
    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "这本书没有提供目录";
      list.replaceChildren(empty);
    }
  };
}
