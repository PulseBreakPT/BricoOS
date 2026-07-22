import { useCallback, useEffect, useState } from "react";

// Estado partilhado por toda a app: o evento "beforeinstallprompt" só
// dispara uma vez por carregamento de página, por isso é capturado aqui,
// a um nível de módulo, em vez de dentro de um componente que pode nem
// chegar a montar a tempo (banner dispensado, menu ainda fechado, etc.).
// Qualquer botão "Instalar aplicação" em qualquer parte da app usa este
// mesmo hook e vê sempre o estado mais recente.
let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

function isStandaloneNow() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOS13Up =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS13Up;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  // Não marcamos nada como "definitivamente instalado" em localStorage: se o
  // dispositivo vier a desinstalar a app, uma futura visita deve voltar a
  // encontrar a opção de instalar, não ficar bloqueada para sempre.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

// Hook para expor a opção "Instalar aplicação" em qualquer menu/botão da
// app. Ao contrário do banner dispensável, esta opção nunca se esconde
// sozinha por ter sido fechada antes — só desaparece quando a app já
// está mesmo instalada (modo standalone).
export function usePwaInstall() {
  const [, bump] = useState(0);
  const [standalone, setStandalone] = useState(isStandaloneNow);

  useEffect(() => {
    const onChange = () => {
      bump((n) => n + 1);
      setStandalone(isStandaloneNow());
    };
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  const ios = isIosDevice();
  const canPrompt = Boolean(deferredPrompt);
  const showInstallOption = !standalone;

  const install = useCallback(async () => {
    if (ios) return "ios-instructions";
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  }, [ios]);

  return { showInstallOption, isStandalone: standalone, isIos: ios, canPrompt, install };
}
