const MIN_DISTANCE = 44;

export function bindSwipe(target, onSwipe) {
  let start = null;

  target.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });

  target.addEventListener("touchmove", (event) => {
    if (!start || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    if (Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.15) event.preventDefault();
  }, { passive: false });

  target.addEventListener("touchend", (event) => {
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    const quickEnough = Date.now() - start.time < 900;
    start = null;
    if (quickEnough && Math.abs(x) >= MIN_DISTANCE && Math.abs(x) > Math.abs(y) * 1.35) {
      onSwipe(x < 0 ? "next" : "prev");
    }
  }, { passive: true });

  target.addEventListener("touchcancel", () => { start = null; }, { passive: true });
}
