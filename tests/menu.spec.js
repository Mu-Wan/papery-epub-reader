import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 160 }, isMobile: true, hasTouch: true });

test("短屏菜单在视口内滚动且点击外部关闭", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#bookInput").setInputFiles({
    name: "菜单测试.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("第一章\n短屏菜单滚动测试"),
  });
  const menu = page.locator(".book-menu");
  await menu.locator("summary").click();
  await expect(menu).toHaveAttribute("open", "");

  const panel = menu.locator(":scope > div");
  const box = await panel.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(11);
  expect(box.y + box.height).toBeLessThanOrEqual(149);
  await panel.hover();
  await page.mouse.wheel(0, 160);
  await expect(menu).toHaveAttribute("open", "");
  await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

  await page.mouse.click(4, 4);
  await expect(menu).not.toHaveAttribute("open", "");
});
