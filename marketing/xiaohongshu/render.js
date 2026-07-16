const query = new URLSearchParams(window.location.search);
const requested = Number(query.get("page") || 1);
const page = Math.min(Math.max(requested, 1), slides.length);
const slide = slides[page - 1];

const dots = slides
  .map((_, index) => `<i class="${index + 1 === page ? "active" : ""}"></i>`)
  .join("");

document.querySelector("#app").innerHTML = `
  <article class="slide page-${page} ${slide.theme || ""}">
    <div class="grain"></div>
    <div class="glow glow-a"></div>
    <div class="glow glow-b"></div>
    <header class="topbar">
      <div class="brand"><span>页</span>页间</div>
      <div class="series">PAPERY EPUB READER</div>
    </header>
    <section class="content">${slide.content}</section>
    <footer class="footer">
      <div class="dots">${dots}</div>
      <div class="counter">0${page} / 09</div>
    </footer>
  </article>
`;
