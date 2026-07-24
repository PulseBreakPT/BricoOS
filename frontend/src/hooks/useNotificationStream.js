import { useEffect, useRef } from "react";
import { API } from "@/lib/api";
import { getDeviceToken } from "@/lib/deviceAuth";

// "Silêncio operacional" — várias mudanças relacionadas (fornecedor
// respondeu, PDF recebido, BricoAval associado, estado atualizado) podem
// disparar vários eventos SSE em poucos segundos, tocando notificações
// diferentes do mesmo pedido (ex.: resolução em cascata). Em vez de
// recarregar a cada mensagem, agrupa-se tudo o que chega nesta janela numa
// única chamada a onEvent — complementa a coalescência já feita no backend
// (notifications.py: _broadcast), que só agrupa repetições sobre a MESMA
// notificação.
const SSE_DEBOUNCE_MS = 800;

// Sincronização em tempo real do Centro de Operações — liga por SSE
// (Server-Sent Events, reconecta sozinho nativamente) e chama onEvent
// sempre que uma notificação muda de estado, em qualquer dispositivo da
// conta. EventSource não permite cabeçalhos custom, por isso o token vai
// na própria query (o middleware já aceita este formato — ver server.py:
// pin_gate). Se a ligação falhar (proxy que bloqueia SSE, etc.), isto é só
// um acelerador — quem usa o hook mantém o polling normal como reserva,
// nunca depende só disto.
export function useNotificationStream(onEvent) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const debounceRef = useRef(null);
  const lastEventRef = useRef(null);

  useEffect(() => {
    const fire = (event) => {
      lastEventRef.current = event;
      if (debounceRef.current) return;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onEventRef.current?.(lastEventRef.current);
      }, SSE_DEBOUNCE_MS);
    };

    const token = getDeviceToken();
    if (!token || typeof EventSource === "undefined") return undefined;
    const source = new EventSource(`${API}/notifications/stream?device_token=${encodeURIComponent(token)}`);
    source.onmessage = (event) => {
      try {
        fire(JSON.parse(event.data));
      } catch {
        /* ignora — payload inesperado não deve partir a app */
      }
    };

    // Reforço do próprio service worker (ver service-worker.js: push) — útil
    // no instante entre o push chegar e a ligação SSE ainda não ter reaberto.
    const onSwMessage = (event) => {
      if (event.data?.type === "brico-notification") {
        fire({ type: "created", id: event.data.notificationId });
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMessage);

    return () => {
      source.close();
      navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
}
