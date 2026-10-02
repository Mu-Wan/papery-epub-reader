// Retire only the previous reader's app-shell worker and caches.
// IndexedDB, localStorage and saved book files are deliberately untouched.
(async () => {
  const scope = new URL("./", document.baseURI);
  if (!/^https?:$/.test(scope.protocol)) return;
  let removed = false;
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      if (registration.scope !== scope.href) continue;
      const worker = registration.active || registration.waiting || registration.installing;
      if (!worker || new URL(worker.scriptURL).href !== new URL("sw.js", scope).href) continue;
      removed = await registration.unregister() || removed;
    }
  }
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map(async name => {
      if (name.startsWith("workbox-precache-") && name.includes(scope.href)) {
        await caches.delete(name);
      } else if (name === "页间-页面") {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        await Promise.all(requests.filter(request => request.url.startsWith(scope.href)).map(request => cache.delete(request)));
        if (!(await cache.keys()).length) await caches.delete(name);
      }
    }));
  }
  if (removed && navigator.serviceWorker.controller) {
    // A new navigation releases a still-controlling, unregistered old worker.
    window.location.replace(new URL("showcase/?site=20261002", scope).href);
  }
})().catch(() => {});
