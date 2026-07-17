const isStandalone = () => matchMedia("(display-mode: standalone)").matches
  || Boolean(navigator.standalone);

function fallbackMessage() {
  const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isiPhone) return "点浏览器底部的“分享”，向下找到“添加到主屏幕”，再确认添加。完成后可像普通 App 一样从桌面打开页间。";
  return "当前浏览器没有提供直接安装窗口。请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”；如果没有该选项，可以继续使用网页版。";
}

export function setupPwaInstall({ toast }) {
  const button = document.querySelector("#installPwaButton");
  const helpDialog = document.querySelector("#installHelpDialog");
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
      document.querySelector("#installHelpCopy").textContent = fallbackMessage();
      helpDialog.showModal();
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    button.classList.remove("ready");
    if (choice.outcome === "accepted") button.hidden = true;
  });
}
