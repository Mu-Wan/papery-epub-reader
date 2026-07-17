const isStandalone = () => matchMedia("(display-mode: standalone)").matches
  || Boolean(navigator.standalone);

function fallbackMessage() {
  const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isiPhone) return "请点浏览器的分享按钮，再选“添加到主屏幕”";
  return "请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”";
}

export function setupPwaInstall({ toast }) {
  const button = document.querySelector("#installPwaButton");
  if (!button || import.meta.env.MODE !== "web" || isStandalone()) return;

  let installPrompt = null;
  button.hidden = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.classList.add("ready");
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
    toast("页间已安装，可以从桌面直接打开");
  });

  button.addEventListener("click", async () => {
    if (!installPrompt) {
      toast(fallbackMessage());
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    button.classList.remove("ready");
    if (choice.outcome === "accepted") button.hidden = true;
  });
}
