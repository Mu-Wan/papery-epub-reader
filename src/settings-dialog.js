const byId = (id) => document.querySelector(`#${id}`);

export function setupSettingsDialog() {
  const dialog = byId("settingsPanel");
  const button = byId("settingsButton");

  function setOpen(open) {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", () => setOpen(!dialog.open));
  byId("settingsDoneButton").addEventListener("click", () => setOpen(false));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) setOpen(false);
  });
  dialog.addEventListener("close", () => button.setAttribute("aria-expanded", "false"));
  return () => setOpen(false);
}
