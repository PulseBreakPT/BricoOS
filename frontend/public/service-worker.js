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

// Vibração/persistência por prioridade (ver backend/notifications.py:
// CATEGORY_PRIORITY) — uma notificação "crítica" exige interação explícita
// (fica no ecrã até ser tocada/fechada) e vibra mais tempo; uma "baixa" é
// discreta, sem vibração.
const PRIORITY_STYLE = {
    critica: { vibrate: [300, 100, 300, 100, 300], requireInteraction: true, silent: false },
    alta: { vibrate: [200, 100, 200], requireInteraction: false, silent: false },
    media: { vibrate: [120], requireInteraction: false, silent: false },
    baixa: { vibrate: [], requireInteraction: false, silent: true },
};

// Notificações push (Web Push) — o payload vem do backend (ver
// backend/notifications.py: create_notification) já pronto a mostrar:
// título, corpo, prioridade e o URL da app para onde deve levar ao ser
// tocada.
self.addEventListener("push", (event) => {
    let payload = { title: "BRICO OS", body: "Tens uma notificação nova." };
    try {
        if (event.data) payload = { ...payload, ...event.data.json() };
    } catch (_) {
        /* payload sem JSON válido — usa o texto por omissão acima */
    }
    const style = PRIORITY_STYLE[payload.priority] || PRIORITY_STYLE.media;
    event.waitUntil(
        (async () => {
            await self.registration.showNotification(payload.title, {
                body: payload.body,
                icon: "/logo192.png",
                badge: "/logo192.png",
                tag: payload.tag || "brico-os",
                data: { url: payload.url || "/", notificationId: payload.notification_id },
                vibrate: style.vibrate,
                requireInteraction: style.requireInteraction,
                silent: style.silent,
            });
            // Confirmação de entrega — sem token de dispositivo (o SW não
            // tem acesso a localStorage), autenticada só pelo ack_token de
            // uso único que já vem no próprio payload (ver
            // AUTH_EXEMPT_PREFIXES em server.py).
            if (payload.notification_id && payload.ack) {
                try {
                    await fetch(`/api/notifications/ack/${payload.notification_id}/${payload.ack}`, { method: "POST" });
                } catch (_) {
                    /* sem rede neste instante — a entrega já aconteceu (a notificação apareceu), só a confirmação é que falhou; sem consequência prática */
                }
            }
            // Reforça a sincronização em tempo real: separadores já abertos
            // atualizam a contagem de imediato, sem esperar pelo próximo
            // poll/SSE reconectar.
            const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: "brico-notification", notificationId: payload.notification_id });
            }
        })(),
    );
});

// Tocar na notificação foca uma aba já aberta da app, navegando-a para o
// destino (client.navigate — recarrega a página nesse URL) em vez de abrir
// sempre um separador novo.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    let targetUrl = event.notification.data?.url || "/";
    const notificationId = event.notification.data?.notificationId;
    if (notificationId) {
        // O SW não tem acesso a localStorage (sem token de dispositivo para
        // marcar como lida diretamente) — passa o id na própria URL; a app
        // (já autenticada) trata da leitura ao abrir (ver App.js).
        targetUrl += `${targetUrl.includes("?") ? "&" : "?"}n=${notificationId}`;
    }
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
