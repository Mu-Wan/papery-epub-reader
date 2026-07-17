const MIN_DISTANCE = 38;

function directionFrom(start, x, y) {
  const dx = x - start.x;
  const dy = y - start.y;
  if (Date.now() - start.time > 1400) return null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DISTANCE) return null;
  if (Math.abs(dx) > Math.abs(dy) * 1.12) return dx < 0 ? "next" : "prev";
  if (Math.abs(dy) > Math.abs(dx) * 1.12) return dy < 0 ? "next" : "prev";
  return null;
}

export function bindSwipe(target, onSwipe) {
  let start = null;
  let blockClickUntil = 0;

  const begin = (x, y, id) => { start = { x, y, id, time: Date.now() }; };
  const move = (event, x, y) => {
    if (!start) return;
    if (Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) > 10 && event.cancelable) event.preventDefault();
  };
  const end = (x, y) => {
    if (!start) return;
    const direction = directionFrom(start, x, y);
    start = null;
    if (!direction) return;
    blockClickUntil = Date.now() + 450;
    onSwipe(direction);
  };

  if (window.PointerEvent) {
    target.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && event.isPrimary) begin(event.clientX, event.clientY, event.pointerId);
    });
    target.addEventListener("pointermove", (event) => {
      if (start?.id === event.pointerId) move(event, event.clientX, event.clientY);
    }, { passive: false });
    target.addEventListener("pointerup", (event) => {
      if (start?.id === event.pointerId) end(event.clientX, event.clientY);
    });
    target.addEventListener("pointercancel", () => { start = null; });
  } else {
    target.addEventListener("touchstart", (event) => {
      if (event.touches.length === 1) begin(event.touches[0].clientX, event.touches[0].clientY, 0);
    }, { passive: true });
    target.addEventListener("touchmove", (event) => {
      if (event.touches.length === 1) move(event, event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: false });
    target.addEventListener("touchend", (event) => {
      if (event.changedTouches.length === 1) end(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
    }, { passive: true });
    target.addEventListener("touchcancel", () => { start = null; }, { passive: true });
  }

  target.addEventListener("click", (event) => {
    if (Date.now() < blockClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}
