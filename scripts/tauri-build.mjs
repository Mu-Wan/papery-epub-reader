import { rm, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const viteConfigPath = join(root, "vite.config.ts");

async function patchViteConfig() {
  let content = await readFile(viteConfigPath, "utf-8");
  // Skip if already patched
  if (content.includes("isTauriBuild")) {
    console.log("✓ vite.config.ts already patched");
    return false;
  }
  const original = content;
  // Add isTauriBuild check before cloudflare import
  content = content.replace(
    /\/\/ Wrangler snapshots its log path while the Cloudflare plugin is imported\.\n\s*const \{ cloudflare \} = await import\("@cloudflare\/vite-plugin"\);/,
    `const isTauriBuild = process.env.PAPERY_STATIC_BUILD === "1";\n\n  // Wrangler snapshots its log path while the Cloudflare plugin is imported.\n  const cloudflarePlugin = isTauriBuild ? null : (await import("@cloudflare/vite-plugin")).cloudflare;`
  );
  // Make cloudflare plugin conditional in plugins array
  content = content.replace(
    /cloudflare\(\{[\s\S]*?config: localBindingConfig,\n\s*\}\),/,
    `...(cloudflarePlugin ? [cloudflarePlugin({\n        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },\n        inspectorPort: false,\n        config: localBindingConfig,\n      })] : []),`
  );
  if (content !== original) {
    await writeFile(viteConfigPath, content, "utf-8");
    console.log("✓ Patched vite.config.ts to skip cloudflare plugin for Tauri build");
    return true;
  }
  return false;
}

async function restoreViteConfig(wasPatched) {
  if (!wasPatched) return;
  let content = await readFile(viteConfigPath, "utf-8");
  content = content.replace(
    /const isTauriBuild = process\.env\.PAPERY_STATIC_BUILD === "1";\n\n  /,
    ""
  );
  content = content.replace(
    /const cloudflarePlugin = isTauriBuild \? null : \(await import\("@cloudflare\/vite-plugin"\)\)\.cloudflare;/,
    `const { cloudflare } = await import("@cloudflare/vite-plugin");`
  );
  content = content.replace(
    /\.\.\.\(cloudflarePlugin \? \[cloudflarePlugin\(\{[\s\S]*?\}\)\] : \[\]\),/,
    `cloudflare({\n        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },\n        inspectorPort: false,\n        config: localBindingConfig,\n      }),`
  );
  await writeFile(viteConfigPath, content, "utf-8");
  console.log("✓ Restored vite.config.ts");
}

async function main() {
  // Step 0: Clean .next cache so every static package starts from a fresh build
  const nextCacheDir = join(root, ".next");
  if (existsSync(nextCacheDir)) {
    await rm(nextCacheDir, { recursive: true, force: true });
    console.log("✓ Cleaned .next/ cache");
  }

  // Step 0.5: Clean out/ to force a fresh static export
  const outDir = join(root, "out");
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
    console.log("✓ Cleaned out/ directory");
  }

  // Step 1: Copy vendor files
  console.log("Copying vendor files...");
  execSync("node scripts/copy-vendor.mjs", { cwd: root, stdio: "inherit" });

  // Step 2: Patch vite.config.ts to skip cloudflare plugin
  const vitePatched = await patchViteConfig();

  try {
    // Step 3: Run next build
    console.log("Running next build (static export)...");
    const result = spawnSync("node", ["node_modules/next/dist/bin/next", "build"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, PAPERY_STATIC_BUILD: "1" },
    });
    // Next.js may write to stderr even on success; check for the output directory.
    if (result.status !== 0 || !existsSync(join(root, "out", "index.html"))) {
      throw new Error("next build completed but out/ directory was not created");
    }
    console.log("\n✓ Build completed successfully!");
  } finally {
    // Step 4: Always restore the Vite config
    await restoreViteConfig(vitePatched);
  }
}

main().catch(async (err) => {
  console.error("Build failed:", err.message);
  process.exit(1);
});
