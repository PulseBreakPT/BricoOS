import { useEffect, useRef } from "react";
import { API } from "@/lib/api";
import { getDeviceToken } from "@/lib/deviceAuth";

// Sincronização em tempo real do Centro de Notificações — liga por SSE
// (Server-Sent Events, reconecta sozinho nativamente) e chama onEvent
// sempre que uma notificação é criada/lida/arquivada, em qualquer
// dispositivo da conta. EventSource não permite cabeçalhos custom, por
// isso o token vai na própria query (o middleware já aceita este
// formato — ver server.py: pin_gate). Se a ligação falhar (proxy que
// bloqueia SSE, etc.), isto é só um acelerador — quem usa o hook mantém
// o polling normal como reserva, nunca depende só disto.
export function useNotificationStream(onEvent) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = getDeviceToken();
    if (!token || typeof EventSource === "undefined") return undefined;
    const source = new EventSource(`${API}/notifications/stream?device_token=${encodeURIComponent(token)}`);
    source.onmessage = (event) => {
      try {
        onEventRef.current?.(JSON.parse(event.data));
      } catch {
        /* ignora — payload inesperado não deve partir a app */
      }
    };

    // Reforço do próprio service worker (ver service-worker.js: push) — útil
    // no instante entre o push chegar e a ligação SSE ainda não ter reaberto.
    const onSwMessage = (event) => {
      if (event.data?.type === "brico-notification") {
        onEventRef.current?.({ type: "created", id: event.data.notificationId });
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMessage);

    return () => {
      source.close();
      navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
    };
  }, []);
}
