import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve("marketing/xiaohongshu-v114");
const url = pathToFileURL(path.join(root, "index.html")).href;
const jobs = [
  { set: "summary", count: 7, folder: "汇总精简版" },
  { set: "update", count: 5, folder: "更新精简版" },
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });

for (const job of jobs) {
  const output = path.join(root, "output", job.folder);
  await mkdir(output, { recursive: true });
  for (let index = 1; index <= job.count; index += 1) {
    await page.goto(`${url}?set=${job.set}&page=${index}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(output, `${String(index).padStart(2, "0")}.png`) });
  }
}

await browser.close();
