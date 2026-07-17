// 原生 details 不会在点击外部时关闭，这里统一所有轻量菜单的行为。
export function setupDismissiblePopovers() {
  const layer = document.createElement("button");
  layer.type = "button";
  layer.className = "popover-dismiss-layer";
  layer.setAttribute("aria-label", "关闭菜单");
  document.body.append(layer);

  function closeMenus() {
    document.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
  }

  function placeMenu(details) {
    const menu = details.querySelector(":scope > div");
    const summary = details.querySelector(":scope > summary");
    if (!menu || !summary) return;
    details.classList.add("floating-menu-open");
    const anchor = summary.getBoundingClientRect();
    const gap = 6;
    const edge = 12;
    const width = menu.offsetWidth;
    const height = Math.min(menu.scrollHeight, innerHeight - edge * 2);
    const below = anchor.bottom + gap;
    const top = below + height <= innerHeight - edge
      ? below
      : Math.max(edge, anchor.top - height - gap);
    const left = Math.min(Math.max(edge, anchor.right - width), innerWidth - width - edge);
    menu.style.setProperty("--floating-menu-top", `${top}px`);
    menu.style.setProperty("--floating-menu-left", `${left}px`);
  }

  function syncLayer() {
    document.querySelectorAll(".floating-menu-open").forEach((menu) => menu.classList.remove("floating-menu-open"));
    document.querySelectorAll(".menu-owner-open").forEach((owner) => owner.classList.remove("menu-owner-open"));
    const opened = document.querySelector("details[open]");
    opened?.closest(".book-card, .box-card")?.classList.add("menu-owner-open");
    if (opened) placeMenu(opened);
    layer.classList.toggle("show", Boolean(opened));
  }

  document.addEventListener("pointerdown", (event) => {
    const opened = document.querySelector("details[open]");
    if (!opened || opened.contains(event.target)) return;
    closeMenus();
    event.preventDefault();
    event.stopPropagation();
    queueMicrotask(syncLayer);
  }, true);

  document.addEventListener("toggle", (event) => {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
    document.querySelectorAll("details[open]").forEach((details) => {
      if (details !== opened) details.removeAttribute("open");
    });
    queueMicrotask(syncLayer);
  }, true);

  window.addEventListener("resize", () => {
    const opened = document.querySelector("details[open]");
    if (opened) placeMenu(opened);
  });

  document.querySelectorAll(".app-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("cancel");
    });
  });
}
