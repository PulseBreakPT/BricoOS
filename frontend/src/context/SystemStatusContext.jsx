import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import api from "@/lib/api";

// Estado do sistema em tempo real (contadores do dock, barra de estado):
// UM único polling partilhado por toda a app — sidebar, nav do telemóvel,
// taskbar e centro de atividade leem daqui, em vez de cada um fazer a sua
// própria chamada. 45s + refresh ao voltar à janela, o mesmo ritmo do
// aviso global de emails.
const BASE_INTERVAL_MS = 45000;
const MAX_INTERVAL_MS = 5 * 60 * 1000;

const SystemStatusCtx = createContext({
  status: null, online: true, lastCheckedAt: null, lastError: null, refresh: () => {},
});

export function SystemStatusProvider({ children, intervalMs = BASE_INTERVAL_MS }) {
  const [status, setStatus] = useState(null);
  const [online, setOnline] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  const isMounted = useRef(true);
  const requestSeq = useRef(0);
  const inFlight = useRef(null);
  const controllerRef = useRef(null);
  const failStreak = useRef(0);

  const refresh = useCallback(async () => {
    // Chamadas concorrentes (foco + intervalo a disparar quase ao mesmo
    // tempo) partilham o mesmo pedido em vez de duplicarem a chamada à API.
    if (inFlight.current) return inFlight.current;
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const promise = (async () => {
      try {
        const { data } = await api.get("/system/status", { signal: controller.signal });
        // Só aplica a resposta se ainda for o pedido mais recente — protege
        // contra respostas fora de ordem quando o refresh é chamado em
        // sucessão rápida (foco a piscar, tab a voltar do fundo, etc.).
        if (!isMounted.current || seq !== requestSeq.current) return;
        setStatus(data);
        setOnline(true);
        setLastError(null);
        setLastCheckedAt(Date.now());
        failStreak.current = 0;
      } catch (e) {
        if (axios.isCancel(e)) return; // cancelado por unmount — não é uma falha de rede real
        if (!isMounted.current || seq !== requestSeq.current) return;
        setOnline(false);
        setLastError(e);
        failStreak.current += 1;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    refresh();
    let timer;
    const scheduleNext = () => {
      // Falhas consecutivas alargam o intervalo (até um limite) — evita
      // martelar um backend em baixo de 45 em 45s indefinidamente.
      const delay = failStreak.current > 0
        ? Math.min(intervalMs * 2 ** failStreak.current, MAX_INTERVAL_MS)
        : intervalMs;
      timer = setTimeout(async () => {
        await refresh();
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    const onFocus = () => {
      // Só vale a pena verificar se a aba estiver mesmo visível — evita
      // pedidos desperdiçados quando o foco muda para outra janela do SO.
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => refresh();
    const onOffline = () => setOnline(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh, intervalMs]);

  return (
    <SystemStatusCtx.Provider value={{ status, online, lastCheckedAt, lastError, refresh }}>
      {children}
    </SystemStatusCtx.Provider>
  );
}

export function useSystemStatus() {
  return useContext(SystemStatusCtx);
}
