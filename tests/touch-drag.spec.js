import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("手机长按可把书拖入书盒", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#bookInput").setInputFiles({
    name: "长按拖动.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("第一章\n手机长按拖动测试"),
  });
  await page.locator("#createBoxButton").click();
  await page.locator(".dialog-input").fill("旅行随笔");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);

  await page.evaluate(() => {
    document.querySelector(".heatmap-section").style.display = "none";
    document.querySelector(".library-header").style.display = "none";
  });
  const source = await page.locator(".book-card").boundingBox();
  const target = await page.locator(".box-card").boundingBox();
  await page.locator(".book-card").evaluate(async (card, points) => {
    const makeTouch = (x, y) => new Touch({ identifier: 7, target: card, clientX: x, clientY: y });
    const dispatch = (type, touches, changedTouches) => card.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches,
    }));
    const start = makeTouch(points.startX, points.startY);
    dispatch("touchstart", [start], [start]);
    await new Promise((resolve) => setTimeout(resolve, 460));
    const end = makeTouch(points.endX, points.endY);
    dispatch("touchmove", [end], [end]);
    dispatch("touchend", [], [end]);
  }, {
    startX: source.x + source.width / 2,
    startY: source.y + source.height / 2,
    endX: target.x + target.width / 2,
    endY: target.y + target.height / 2,
  });
  await expect(page.locator(".box-copy small")).toHaveText("1 本书");
});
