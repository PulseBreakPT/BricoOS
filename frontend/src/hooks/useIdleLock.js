import { useEffect, useRef } from "react";
import { lockScreen } from "@/lib/osShell";

const IDLE_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"];

// Bloqueia o ecrã sozinho ao fim de `minutes` sem interação — usado só
// enquanto a app está desbloqueada (`active`). `minutes <= 0` desliga a
// funcionalidade (definições → Segurança → "Bloquear automaticamente").
export function useIdleLock(minutes, active) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active || !minutes || minutes <= 0) return undefined;
    const ms = minutes * 60000;
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => lockScreen(), ms);
    };
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [minutes, active]);
}
