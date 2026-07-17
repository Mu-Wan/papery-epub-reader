const params = new URLSearchParams(location.search);
const setName = params.get("set") === "update" ? "update" : "summary";
const cards = sets[setName];
const page = Math.min(Math.max(Number(params.get("page") || 1), 1), cards.length);
const card = cards[page - 1];
const label = setName === "summary" ? "页间 · 完整介绍" : "页间 · 更新手记";
const image = card.image ? `<div class="shot ${card.kind || "desktop"}"><img src="${card.image}" alt="真实应用截图" /></div>` : "";
const tags = card.tags ? `<div class="tags">${card.tags.map((item) => `<span>${item}</span>`).join("")}</div>` : "";

document.querySelector("#app").innerHTML = `
  <article class="card card-${page} ${card.layout || ""}">
    <header><div class="brand"><img src="assets/app-mark.svg" alt="" /><b>页间</b></div><span>${label}</span></header>
    <section class="copy"><p>${card.kicker}</p><h1>${card.title}</h1>${card.body ? `<h2>${card.body}</h2>` : ""}${tags}</section>
    ${image}
    ${card.note ? `<aside>${card.note}</aside>` : ""}
    <footer><span>免费 · 开源 · 本地优先</span><b>${String(page).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}</b></footer>
  </article>`;
