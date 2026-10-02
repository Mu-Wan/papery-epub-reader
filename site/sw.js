/* global self, caches */
// Keep this historical URL: previously installed PWAs update this exact script.
// No fetch handler is installed, so all requests use the network normally.
const siteScope = self.registration.scope;
const siteUrl = new URL(siteScope);

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const names = await caches.keys();
    await Promise.all(names.map(async name => {
      if (name.startsWith("workbox-precache-") && name.includes(siteScope)) {
        await caches.delete(name);
      } else if (name === "页间-页面") {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        await Promise.all(requests.filter(request => request.url.startsWith(siteScope)).map(request => cache.delete(request)));
        if (!(await cache.keys()).length) await caches.delete(name);
      }
    }));
    await self.registration.unregister();

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const destination = new URL("showcase/?site=20261002", siteUrl).href;
    await Promise.all(windows.map(client => {
      const url = new URL(client.url);
      if (url.origin !== siteUrl.origin ||
          (url.pathname !== siteUrl.pathname && url.pathname !== `${siteUrl.pathname}index.html`)) return;
      // Leave authorization callbacks and other GitHub Pages projects alone.
      return client.navigate(destination).catch(() => {});
    }));
  })());
});
