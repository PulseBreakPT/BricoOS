import { useEffect } from "react";
import { isStandaloneNow } from "@/hooks/usePwaInstall";

// Bloqueia a orientação do ecrã em vertical — só faz sentido para a app
// instalada (modo standalone); no browser normal (aba do Chrome/Safari) o
// comportamento fica sempre o padrão do próprio browser, sem interferência.
// Silencioso em qualquer falha: browser sem suporte à Screen Orientation
// API, permissão negada, fora de fullscreen, etc. — nunca lança erro nem
// mostra aviso, a app continua normalmente (fallback CSS em index.css cobre
// o caso raro de o bloqueio nativo não pegar).
async function lockPortrait() {
  const orientation = typeof screen !== "undefined" ? screen.orientation : null;
  if (!orientation || typeof orientation.lock !== "function") return;
  try {
    await orientation.lock("portrait-primary");
  } catch {
    // Alguns motores aceitam "portrait" mas rejeitam a distinção primary/
    // secondary de "portrait-primary" — tenta a variante mais permissiva
    // antes de desistir de vez.
    try {
      await orientation.lock("portrait");
    } catch {
      // iOS Safari/PWA, por exemplo, não implementa lock() nenhum — e mesmo
      // em browsers que implementam, o pedido pode ser recusado consoante o
      // contexto (fora de fullscreen, etc.). Nada a fazer, nada a mostrar
      // — o aviso "roda o ecrã" do index.css cobre este caso.
    }
  }
}

// Ponto único de bloqueio de orientação — nenhum outro componente da app
// precisa de saber disto ou de verificar orientação por si próprio, só
// chamar este hook uma vez perto da raiz (ver App.js). Reaplica o
// bloqueio no arranque, ao voltar a ficar visível (restaurar/voltar do
// background/abrir por notificação), ao instalar a app a meio da sessão
// (evento "brico:pwa-change", já disparado por usePwaInstall em
// "appinstalled"), e sempre que o próprio browser reportar uma mudança de
// orientação — o caso em que um browser "larga" o bloqueio sozinho.
export function usePortraitLock() {
  useEffect(() => {
    const tryLock = () => {
      if (isStandaloneNow()) lockPortrait();
    };
    tryLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") tryLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("brico:pwa-change", tryLock);
    const orientation = typeof screen !== "undefined" ? screen.orientation : null;
    orientation?.addEventListener?.("change", tryLock);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("brico:pwa-change", tryLock);
      orientation?.removeEventListener?.("change", tryLock);
    };
  }, []);
}
