// 统一使用应用内弹窗，避免不同平台显示系统默认 prompt、confirm 与 select。
function createShell({ eyebrow = "页间", title, message }) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog action-dialog";
  const form = document.createElement("form");
  const caption = document.createElement("p");
  caption.className = "dialog-eyebrow";
  caption.textContent = eyebrow;
  const heading = document.createElement("h2");
  heading.textContent = title;
  form.append(caption, heading);
  if (message) {
    const copy = document.createElement("p");
    copy.className = "dialog-message";
    copy.textContent = message;
    form.append(copy);
  }
  dialog.append(form);
  document.body.append(dialog);
  return { dialog, form };
}

function action(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function present(config, render) {
  return new Promise((resolve) => {
    const { dialog, form } = createShell(config);
    let result = null;
    const finish = (value = null) => {
      result = value;
      if (dialog.open) dialog.close();
    };
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    }, { once: true });
    render(form, finish);
    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector("input, .dialog-choice, .primary-button")?.focus());
  });
}

export function askConfirm({ title, message, confirmLabel = "确认", danger = false }) {
  return present({ eyebrow: "请确认", title, message }, (form, finish) => {
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    actions.append(
      action("取消", "quiet-button", () => finish(false)),
      action(confirmLabel, danger ? "primary-button danger-action" : "primary-button", () => finish(true)),
    );
    form.append(actions);
  });
}

export function askText({ title, message, value = "", placeholder = "", confirmLabel = "保存" }) {
  return present({ eyebrow: "书架整理", title, message }, (form, finish) => {
    const input = document.createElement("input");
    input.className = "dialog-input";
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = 40;
    input.required = true;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const submit = () => {
      const text = input.value.trim();
      if (!text) return input.reportValidity();
      finish(text);
    };
    form.addEventListener("submit", (event) => { event.preventDefault(); submit(); });
    actions.append(action("取消", "quiet-button", () => finish()), action(confirmLabel, "primary-button", submit));
    form.append(input, actions);
  });
}

export function askChoice({ title, message, options }) {
  return present({ eyebrow: "整理书架", title, message }, (form, finish) => {
    const list = document.createElement("div");
    list.className = "dialog-choice-list";
    options.forEach((option) => {
      const button = action(option.label, "dialog-choice", () => finish(option.value));
      button.innerHTML = `<span>${option.label}</span><i aria-hidden="true">→</i>`;
      list.append(button);
    });
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    actions.append(action("取消", "quiet-button", () => finish()));
    form.append(list, actions);
  });
}
