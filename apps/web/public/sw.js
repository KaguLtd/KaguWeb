self.FIELD_OUTBOX_SYNC_TAG = "kagu-field-outbox";

function notifyFieldOutboxSync(source) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) =>
      Promise.all(
        clients.map((client) =>
          client.postMessage({
            type: "KAGU_SYNC_FIELD_OUTBOX",
            source
          })
        )
      )
    );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Keep fetch handling minimal; service worker only nudges the app-driven field queue.
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "KAGU_SYNC_FIELD_OUTBOX") {
    return;
  }

  event.waitUntil(notifyFieldOutboxSync(event.data?.source || "message"));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== self.FIELD_OUTBOX_SYNC_TAG) {
    return;
  }

  event.waitUntil(notifyFieldOutboxSync("background-sync"));
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Kagu Saha Takip";
  const options = {
    body: payload.body || "Yeni saha bildirimi",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: {
      url: payload.url || "/dashboard"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard", self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
