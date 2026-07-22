import { useEffect, useState } from "react";

// Relógio partilhado por widgets do ambiente de trabalho — evita repetir o
// mesmo setInterval em cada componente e resincroniza de imediato quando o
// separador volta a ficar visível, em vez de esperar pelo próximo tick.
export function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return now;
}
