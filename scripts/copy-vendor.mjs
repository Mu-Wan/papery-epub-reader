import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 获取脚本所在目录和项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const vendorDir = join(projectRoot, "public", "vendor");

// 需要复制的文件列表：[源路径, 目标路径]
const filesToCopy = [
  [
    join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.mjs"),
    join(vendorDir, "pdf.mjs"),
  ],
  [
    join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    join(vendorDir, "pdf.worker.min.mjs"),
  ],
  [
    join(
      projectRoot,
      "node_modules",
      "@fontsource",
      "lxgw-wenkai",
      "files",
      "lxgw-wenkai-latin-300-normal.woff2"
    ),
    join(vendorDir, "lxgw-wenkai.woff2"),
  ],
];

async function main() {
  // 创建 public/vendor 目录
  await mkdir(vendorDir, { recursive: true });
  console.log(`✓ Created vendor directory: ${vendorDir}`);

  let copied = 0;
  let warnings = 0;

  for (const [src, dest] of filesToCopy) {
    try {
      await copyFile(src, dest);
      console.log(`✓ Copied: ${src} → ${dest}`);
      copied++;
    } catch (err) {
      if (err.code === "ENOENT") {
        console.warn(`⚠ Warning: Source file not found, skipping: ${src}`);
      } else {
        console.warn(`⚠ Warning: Failed to copy ${src}: ${err.message}`);
      }
      warnings++;
    }
  }

  console.log(
    `\nDone. ${copied} file(s) copied, ${warnings} warning(s).`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
