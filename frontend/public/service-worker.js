// Service worker mínimo: necessário para o browser considerar a app instalável
// (PWA), mas propositadamente sem cache. A app é privada e protegida por PIN,
// pelos dados têm de vir sempre da rede — nunca de uma cópia guardada localmente.
self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
    // Sem resposta customizada: o pedido segue sempre normalmente para a rede.
});

// Notificações push (Web Push) — o payload vem do backend (ver
// push_notifications.py) já pronto a mostrar: título, corpo e o URL da app
// para onde a notificação deve levar ao ser tocada.
self.addEventListener("push", (event) => {
    let payload = { title: "BRICO OS", body: "Tens uma notificação nova." };
    try {
        if (event.data) payload = { ...payload, ...event.data.json() };
    } catch (_) {
        /* payload sem JSON válido — usa o texto por omissão acima */
    }
    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: "/logo192.png",
            badge: "/logo192.png",
            tag: payload.tag || "brico-os",
            data: { url: payload.url || "/" },
        }),
    );
});

// Tocar na notificação foca uma aba já aberta da app, navegando-a para o
// destino (client.navigate — recarrega a página nesse URL) em vez de abrir
// sempre um separador novo.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
            const client = clients[0];
            if (client) {
                if ("navigate" in client) {
                    try {
                        await client.navigate(targetUrl);
                    } catch (_) {
                        /* alguns browsers recusam navegar cross-origin; ignora e só foca */
                    }
                }
                return client.focus();
            }
            return self.clients.openWindow(targetUrl);
        }),
    );
});
