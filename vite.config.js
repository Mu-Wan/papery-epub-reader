import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    base: web ? "/papery-epub-reader/" : "./",
    plugins: web ? [VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["app-mark.svg"],
      manifest: {
        name: "页间 · 本地阅读器",
        short_name: "页间",
        description: "安静、轻巧、本地优先的 EPUB 与 TXT 阅读器",
        lang: "zh-CN",
        theme_color: "#f3f1ec",
        background_color: "#f3f1ec",
        display: "standalone",
        orientation: "any",
        icons: [{ src: "app-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        cleanupOutdatedCaches: true,
      },
    })] : [],
    build: { chunkSizeWarningLimit: 650 },
  };
});
