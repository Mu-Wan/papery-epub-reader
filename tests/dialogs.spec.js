import { test, expect } from "@playwright/test";

const url = "http://127.0.0.1:5173";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("手机三列书架与自绘书盒组件", async ({ page }) => {
  await page.goto(url);
  const text = "第一章\n\n这是一本用于测试书架组件的书。";
  for (let index = 1; index <= 3; index += 1) {
    await page.locator("#bookInput").setInputFiles({
      name: `测试书${index}.txt`, mimeType: "text/plain", buffer: Buffer.from(text),
    });
  }
  const columns = await page.locator("#bookGrid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(3);
  const baseStyles = await page.evaluate(() => fetch("/src/styles/base.css").then((response) => response.text()));
  expect(baseStyles).toContain("-webkit-tap-highlight-color: transparent");

  await page.locator("#createBoxButton").click();
  await expect(page.locator(".action-dialog")).toBeVisible();
  await expect(page.locator(".action-dialog select")).toHaveCount(0);
  await page.locator(".dialog-input").fill("随笔");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.locator(".box-card")).toHaveCount(1);

  await page.locator(".box-menu summary").click();
  await expect(page.locator(".box-menu")).toHaveAttribute("open", "");
  await expect(page.locator(".box-menu > div")).toBeVisible();
  await page.waitForTimeout(120);
  await expect(page.locator(".box-menu")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "重命名" }).click();
  await expect(page.locator(".action-dialog")).toBeVisible();
  await page.locator(".dialog-input").fill("文学随笔");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".box-card strong")).toHaveText("文学随笔");

  await page.locator(".book-menu summary").first().click();
  await page.getByRole("button", { name: "移入书盒…" }).click();
  await expect(page.locator(".dialog-choice-list")).toBeVisible();
  await page.getByRole("button", { name: "文学随笔", exact: true }).click();
  await expect(page.locator(".box-card small")).toHaveText("1 本书");
});

test("书盒菜单使用稳定的窗口坐标", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(url);
  await page.locator("#createBoxButton").click();
  await page.locator(".dialog-input").fill("桌面书盒");
  await page.getByRole("button", { name: "创建" }).click();
  await page.locator(".box-card").hover();
  await expect(page.locator(".box-card")).toHaveCSS("transform", "none");
  await page.locator(".box-menu summary").click();
  const first = await page.locator(".box-menu > div").boundingBox();
  await page.waitForTimeout(100);
  const settled = await page.locator(".box-menu > div").boundingBox();
  expect(Math.abs(first.x - settled.x)).toBeLessThan(1);
  expect(Math.abs(first.y - settled.y)).toBeLessThan(1);
});

test("桌面目录始终收在窗口以内", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 540 });
  await page.goto(url);
  await page.evaluate(() => document.documentElement.classList.add("tauri"));
  const text = Array.from({ length: 50 }, (_, index) => `第${index + 1}章\n\n目录高度测试内容。`).join("\n\n");
  await page.locator("#bookInput").setInputFiles({ name: "长目录.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await page.locator(".book-card").click();
  await page.locator("#tocButton").click();
  const bounds = await page.locator(".drawer-sheet").boundingBox();
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(532);
});

test("手机阅读工具按钮保留防误触间距", async ({ page }) => {
  await page.goto(url);
  await page.locator("#bookInput").setInputFiles({
    name: "按钮间距.txt", mimeType: "text/plain", buffer: Buffer.from("第一章\n\n间距测试正文。"),
  });
  await page.locator(".book-card").click();
  const boxes = await page.locator(".reader-actions .text-button").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  }));
  expect(boxes).toHaveLength(3);
  expect(Math.min(...boxes.map((box) => box.width))).toBeGreaterThanOrEqual(42);
  expect(boxes[1].left - boxes[0].right).toBeGreaterThanOrEqual(5);
  expect(boxes[2].left - boxes[1].right).toBeGreaterThanOrEqual(5);
});

test("手机页码避开圆角安全区", async ({ page }) => {
  await page.goto(url);
  await page.locator("#bookInput").setInputFiles({
    name: "页码.txt", mimeType: "text/plain", buffer: Buffer.from("第一章\n用于检查页码位置。"),
  });
  await page.locator(".book-card").click();
  const box = await page.locator("#readerPage").boundingBox();
  const viewport = page.viewportSize();
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 20);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
});
