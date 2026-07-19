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
