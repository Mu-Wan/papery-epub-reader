import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    base: web ? "/papery-epub-reader/" : "./",
    plugins: web ? [VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["app-mark.svg", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png"],
      manifest: {
        name: "页间 · 本地阅读器",
        short_name: "页间",
        description: "安静、轻巧、本地优先的 EPUB 与 TXT 阅读器",
        lang: "zh-CN",
        id: "./",
        start_url: "./",
        scope: "./",
        theme_color: "#f3f1ec",
        background_color: "#f3f1ec",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,txt}"],
        cleanupOutdatedCaches: true,
      },
    })] : [],
    build: { chunkSizeWarningLimit: 650 },
  };
});
