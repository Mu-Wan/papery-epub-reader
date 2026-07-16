import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("src-tauri", "target", "release", "papery-reader.exe");
const outputDirectory = resolve("release");
const packageData = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const destination = resolve(outputDirectory, `页间-${packageData.version}-Tauri轻量版.exe`);

// 将 Rust 构建产物复制成便于直接使用的中文文件名。
await mkdir(outputDirectory, { recursive: true });
await copyFile(source, destination);
console.log(`已生成：${destination}`);
