import { test, expect } from "@playwright/test";

test("拖动排序并放入书盒", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#bookInput").setInputFiles([
    { name: "甲书.txt", mimeType: "text/plain", buffer: Buffer.from("第一章 甲\n甲的正文") },
    { name: "乙书.txt", mimeType: "text/plain", buffer: Buffer.from("第一章 乙\n乙的正文") },
  ]);
  await expect(page.locator(".book-card")).toHaveCount(2);

  page.once("dialog", (dialog) => dialog.accept("拖动书盒"));
  await page.locator("#createBoxButton").click();
  await expect(page.locator(".box-card")).toHaveCount(1);

  await page.locator(".book-card").first().dragTo(page.locator(".box-card"));
  await expect(page.locator(".box-copy small")).toHaveText("1 本书");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".book-card").first().dragTo(page.locator(".box-card"));
  await expect(page.locator(".box-copy small")).toHaveText("2 本书");
  await expect(page.locator(".book-card")).toHaveCount(0);

  await page.locator(".box-open").click();
  await expect(page.locator(".book-card")).toHaveCount(2);
  const before = await page.locator(".book-info h3").allTextContents();
  await page.locator(".book-card").last().dragTo(page.locator(".book-card").first());
  await expect.poll(() => page.locator(".book-info h3").allTextContents()).toEqual([...before].reverse());
});
