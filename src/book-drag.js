let prepared = false;
let draggedId = null;
let longPress;
let touchStart;
let ghost;
let suppressClickUntil = 0;

const bookAt = (target) => target?.closest?.(".book-card");
const boxAt = (target) => target?.closest?.(".box-card");

function clearDrag() {
  clearTimeout(longPress);
  document.querySelectorAll(".dragging, .drop-target").forEach((item) => item.classList.remove("dragging", "drop-target"));
  ghost?.remove();
  ghost = null;
  draggedId = null;
  touchStart = null;
}

function targetAt(x, y) {
  document.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
  const target = boxAt(document.elementFromPoint(x, y)) || bookAt(document.elementFromPoint(x, y));
  if (target?.dataset.bookId !== draggedId) target?.classList.add("drop-target");
  return target;
}

function finish(target, callbacks, suppressTouchClick = false) {
  if (!draggedId || !target) return clearDrag();
  if (target.dataset.boxId) callbacks.onMoveToBox(draggedId, target.dataset.boxId);
  if (target.dataset.bookId && target.dataset.bookId !== draggedId) {
    const cards = [...document.querySelectorAll("#bookGrid .book-card")];
    const source = cards.find((card) => card.dataset.bookId === draggedId);
    target.before(source);
    callbacks.onReorder([...document.querySelectorAll("#bookGrid .book-card")].map((card) => card.dataset.bookId));
  }
  if (suppressTouchClick) suppressClickUntil = Date.now() + 500;
  clearDrag();
}

function prepareCards() {
  document.querySelectorAll(".book-card").forEach((card) => { card.draggable = true; });
}

export function setupBookDrag(callbacks) {
  prepareCards();
  if (prepared) return;
  prepared = true;
  document.addEventListener("dragstart", (event) => {
    const card = bookAt(event.target);
    if (!card) return;
    draggedId = card.dataset.bookId;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
  });
  document.addEventListener("dragover", (event) => {
    draggedId ||= event.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const target = boxAt(event.target) || bookAt(event.target);
    if (target) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    draggedId ||= event.dataTransfer.getData("text/plain");
    finish(boxAt(event.target) || bookAt(event.target), callbacks);
  });
  document.addEventListener("dragend", (event) => {
    const endedId = bookAt(event.target)?.dataset.bookId;
    if (!draggedId || !endedId || endedId === draggedId) clearDrag();
  });

  document.addEventListener("touchstart", (event) => {
    const card = bookAt(event.target);
    if (!card || event.target.closest("button, summary, details")) return;
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
    longPress = setTimeout(() => {
      draggedId = card.dataset.bookId;
      card.classList.add("dragging");
      ghost = card.cloneNode(true);
      ghost.className = "book-drag-ghost";
      document.body.append(ghost);
      navigator.vibrate?.(25);
    }, 420);
  }, { passive: true });
  document.addEventListener("touchmove", (event) => {
    if (!touchStart) return;
    const touch = event.touches[0];
    if (!draggedId && Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 10) clearDrag();
    if (!draggedId) return;
    event.preventDefault();
    ghost.style.transform = `translate(${touch.clientX - 55}px, ${touch.clientY - 75}px)`;
    targetAt(touch.clientX, touch.clientY);
  }, { passive: false });
  document.addEventListener("touchend", (event) => {
    if (!draggedId) return clearDrag();
    const touch = event.changedTouches[0];
    finish(targetAt(touch.clientX, touch.clientY), callbacks, true);
  });
  document.addEventListener("touchcancel", clearDrag);
  document.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}
