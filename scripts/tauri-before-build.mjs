// Wrapper script called by tauri.conf.json beforeBuildCommand
// Skips next build if out/index.html already exists
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outIndex = join(root, "out", "index.html");

if (existsSync(outIndex)) {
  console.log("✓ out/index.html already exists, skipping next build (static export).");
} else {
  console.log("out/ not found, running full next build...");
  execSync("node scripts/tauri-build.mjs", { cwd: root, stdio: "inherit" });
}
