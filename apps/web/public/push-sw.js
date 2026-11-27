/*
 * Notificações push do Miu. Importado pelo service worker gerado pelo vite-plugin-pwa
 * (workbox.importScripts em vite.config.ts). O conteúdo chega criptografado e o navegador entrega
 * já aberto aqui: { title, body, url, tag }.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Miu Controle", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Miu Controle";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/inicio" },
    }),
  );
});

// Tocar na notificação: volta para o Miu aberto (na tela do aviso) ou abre um novo.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/inicio", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
