import { test, expect } from "@playwright/test";
const url = "http://127.0.0.1:5173";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("手机端阅读流程与持久统计", async ({ page }) => {
  const failedFonts = [];
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText;
    if (request.url().includes("wenkai") && error !== "net::ERR_ABORTED") failedFonts.push(`${error}: ${request.url()}`);
  });
  await page.goto(url);

  const titleBox = await page.locator(".library-header h1").boundingBox();
  const manageBox = await page.locator(".backup-menu summary").boundingBox();
  expect(Math.abs(titleBox.y - manageBox.y)).toBeLessThan(12);
  await expect(page.locator(".library-brand-mark")).toBeVisible();

  await page.evaluate(async () => {
    const stats = await import("/src/stats-store.js");
    await stats.addReadingTime("2026-07-17", 120000);
  });
  await page.reload();
  await expect(page.locator("#heatmapSummary")).toContainText("2 分钟");
  const legendAlignment = await page.evaluate(() => {
    const center = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return box.top + box.height / 2;
    };
    return {
      top: Math.abs(center(".heatmap-legend span:last-child") - center(".heatmap-months")),
      bottom: Math.abs(center(".heatmap-legend span:first-child") - center(".heatmap-weekdays span:last-child")),
    };
  });
  expect(legendAlignment.top).toBeLessThan(2);
  expect(legendAlignment.bottom).toBeLessThan(2);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("papery-reader", 2);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("readingDays", "readwrite");
      transaction.objectStore("readingDays").clear();
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.reload();
  await expect(page.locator("#heatmapSummary")).toContainText("2 分钟");

  const text = Array.from({ length: 80 }, (_, index) => `第${index + 1}段 这是手机端翻页与字体测试。霞鹜文楷应该完整、统一、清晰地显示中文内容。`).join("\n\n");
  await page.locator("#bookInput").setInputFiles({ name: "手机测试.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-menu summary").click();
  const menuTouchTarget = await page.locator(".book-menu button").first().evaluate((button) => {
    const style = getComputedStyle(button);
    return { height: button.getBoundingClientRect().height, fontSize: parseFloat(style.fontSize) };
  });
  expect(menuTouchTarget.height).toBeGreaterThanOrEqual(44);
  expect(menuTouchTarget.fontSize).toBeGreaterThanOrEqual(14);
  await page.locator(".book-menu summary").click();
  await page.locator(".book-card").click();
  await expect(page.locator("#readerView")).toBeVisible();
  await expect(page.locator("#viewer iframe")).toHaveCount(1);
  await expect(page.locator("#readerPage")).toHaveText(/\d+(?:–\d+)? \/ \d+/);
  await page.locator("#immersiveButton").click();
  await expect(page.locator("#readerView")).toHaveClass(/immersive/);
  await expect(page.locator(".reader-hint")).toBeHidden();
  await expect(page.locator("#readerPage")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#readerView")).toBeVisible();
  await expect(page.locator("#readerView")).not.toHaveClass(/immersive/);
  await page.locator("#settingsButton").click();
  await expect(page.locator("#settingsPanel")).toBeVisible();
  await page.locator(".settings-controls").evaluate((panel) => { panel.scrollTop = 60; });
  await expect(page.locator("#settingsPanel")).toBeVisible();
  await page.locator("#horizontalMargin").evaluate((input) => {
    input.value = "40";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#verticalMargin").evaluate((input) => {
    input.value = "32";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#horizontalMarginOutput")).toHaveText("40");
  await expect(page.locator("#verticalMarginOutput")).toHaveText("32");
  await expect.poll(() => page.locator("#readerView").evaluate((node) => node.style.getPropertyValue("--reader-margin-x"))).toBe("40px");
  await page.locator("#settingsPanel").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#settingsPanel")).not.toHaveAttribute("open", "");

  await page.locator("#settingsButton").click();
  await page.getByRole("button", { name: "霞鹜文楷" }).click();
  await page.locator("#settingsPanel").click({ position: { x: 4, y: 4 } });
  const fontState = await page.locator("#viewer iframe").evaluate(async (iframe) => {
    const doc = iframe.contentDocument;
    await doc.fonts.ready;
    return {
      family: getComputedStyle(doc.body).fontFamily,
      ready: doc.fonts.check('18px "LXGW WenKai"', "霞鹜文楷统一显示"),
    };
  });
  expect(fontState.family).toContain("LXGW WenKai");
  expect(fontState.ready).toBeTruthy();
  expect(failedFonts).toEqual([]);

  const readLocation = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("papery-reader", 2);
    request.onsuccess = () => {
      const database = request.result;
      const query = database.transaction("books").objectStore("books").getAll();
      query.onsuccess = () => { database.close(); resolve(query.result[0]?.location); };
      query.onerror = () => reject(query.error);
    };
  }));
  const before = await readLocation();
  await page.locator("#viewer iframe").evaluate((iframe) => {
    const doc = iframe.contentDocument;
    const pointer = (type, x, y) => doc.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, pointerId: 1, clientX: x, clientY: y,
    }));
    pointer("pointerdown", 320, 400);
    pointer("pointermove", 170, 402);
    pointer("pointerup", 80, 404);
  });
  await expect.poll(readLocation).not.toBe(before);
  const afterHorizontal = await readLocation();
  await page.locator("#viewer iframe").evaluate((iframe) => {
    const doc = iframe.contentDocument;
    const pointer = (type, y) => doc.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, pointerId: 2, clientX: 190, clientY: y,
    }));
    pointer("pointerdown", 480);
    pointer("pointermove", 280);
    pointer("pointerup", 100);
  });
  await expect.poll(readLocation).not.toBe(afterHorizontal);
  const finishDialog = page.locator(".action-dialog");
  if (await finishDialog.isVisible()) await finishDialog.getByRole("button", { name: "取消" }).click();
  await page.locator("#tocButton").click();
  await expect(page.locator("#tocList button")).not.toHaveCount(0);
  await page.locator("#tocPanel").click({ position: { x: 4, y: 4 } });
  await page.screenshot({ path: "test-results/mobile-reader.png", fullPage: true });

  await page.goBack();
  await expect(page.locator("#libraryView")).toBeVisible();
  await expect(page.locator("#readerView")).toBeHidden();
  await page.screenshot({ path: "test-results/mobile-library.png", fullPage: true });
});
