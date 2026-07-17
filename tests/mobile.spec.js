import { test, expect } from "@playwright/test";

const url = "http://127.0.0.1:4173";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("手机端阅读流程与持久统计", async ({ page }) => {
  const failedFonts = [];
  page.on("requestfailed", (request) => {
    if (request.url().includes("wenkai")) failedFonts.push(request.url());
  });
  await page.goto(url);

  const titleBox = await page.locator(".library-header h1").boundingBox();
  const manageBox = await page.locator(".backup-menu summary").boundingBox();
  expect(Math.abs(titleBox.y - manageBox.y)).toBeLessThan(12);

  await page.evaluate(async () => {
    const stats = await import("/src/stats-store.js");
    await stats.addReadingTime("2026-07-17", 120000);
  });
  await page.reload();
  await expect(page.locator("#heatmapSummary")).toContainText("2 分钟");
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
  await page.locator(".book-card").click();
  await expect(page.locator("#readerView")).toBeVisible();
  await expect(page.locator("#viewer iframe")).toHaveCount(1);

  await page.locator("#settingsButton").click();
  await expect(page.locator("#settingsPanel")).toBeVisible();
  await page.locator("#settingsPanel").evaluate((panel) => { panel.scrollTop = 60; });
  await expect(page.locator("#settingsPanel")).toBeVisible();
  await page.locator("#margin").evaluate((input) => {
    input.value = "48";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#marginOutput")).toHaveText("48");
  expect(await page.locator("#readerView").evaluate((node) => node.style.getPropertyValue("--reader-margin"))).toBe("48px");
  await page.locator("#settingsBackdrop").click({ position: { x: 2, y: 2 } });
  await expect(page.locator("#settingsPanel")).toBeHidden();

  await page.locator("#settingsButton").click();
  await page.getByRole("button", { name: "霞鹜文楷" }).click();
  await page.locator("#settingsBackdrop").click({ position: { x: 2, y: 2 } });
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
    const touch = (x) => new Touch({ identifier: 1, target: doc.body, clientX: x, clientY: 400 });
    doc.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(320)], bubbles: true }));
    doc.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(80)], bubbles: true, cancelable: true }));
    doc.dispatchEvent(new TouchEvent("touchend", { changedTouches: [touch(80)], bubbles: true }));
  });
  await expect.poll(readLocation).not.toBe(before);
  await page.screenshot({ path: "test-results/mobile-reader.png", fullPage: true });

  await page.goBack();
  await expect(page.locator("#libraryView")).toBeVisible();
  await expect(page.locator("#readerView")).toBeHidden();
  await page.screenshot({ path: "test-results/mobile-library.png", fullPage: true });
});
