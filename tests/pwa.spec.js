import { test, expect } from "@playwright/test";
const pwaUrl = process.env.PWA_URL || "http://127.0.0.1:4174/papery-epub-reader/";

test("PWA 注册更新服务并建立版本缓存", async ({ page }) => {
  await page.goto(pwaUrl);
  await expect(page.locator("#immersiveButton")).toHaveText("沉浸");
  await expect(page.locator("#readerPage")).toHaveCount(1);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    const cachesFound = await caches.keys();
    return {
      scope: registration.scope,
      active: registration.active?.state,
      precache: cachesFound.some((name) => name.includes("workbox-precache")),
    };
  });
  expect(state.scope).toContain("/papery-epub-reader/");
  expect(state.active).toBe("activated");
  expect(state.precache).toBeTruthy();
  const worker = await (await page.request.get(new URL("sw.js", pwaUrl).href)).text();
  expect(worker).toContain("NetworkFirst");
  expect(worker).not.toContain("NavigationRoute");
});
