self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || "Cortou Anotou", {
      body: data.body || "Há uma novidade na barbearia.",
      icon: "/icons/cortou-anotou-192.png",
      badge: "/icons/cortou-anotou-192.png",
      tag: data.tag || "cortou-anotou",
      data: { url: data.url || "/" },
    }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "CA_NOTIFICATION" }));
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const open = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      if ("navigate" in open) await open.navigate(target);
      return open.focus();
    }
    return self.clients.openWindow(target);
  }));
});
