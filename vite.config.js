import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    base: web ? "/papery-epub-reader/" : "./",
    plugins: [VitePWA({
      disable: !web,
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["app-mark.svg", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png"],
      manifest: {
        name: "页间",
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
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [{
          urlPattern: ({ request }) => request.mode === "navigate",
          handler: "NetworkFirst",
          options: {
            cacheName: "页间-页面",
            networkTimeoutSeconds: 4,
            precacheFallback: { fallbackURL: "index.html" },
          },
        }],
      },
    })],
    build: { chunkSizeWarningLimit: 650 },
  };
});
