import { useCallback, useEffect, useState } from "react";

// O evento "beforeinstallprompt" é capturado o mais cedo possível por um
// script inline no <head> (ver public/index.html), que o guarda em
// window.__bricoPWA. Isto evita a corrida em que o Chrome dispara o evento
// antes de este bundle carregar — e o perde para sempre. Aqui apenas
// garantimos que esse armazenamento existe (fallback para dev/casos raros
// em que o script inline não esteja presente) e lemos o seu estado.
function ensureStore() {
  if (typeof window === "undefined") return null;
  const store = (window.__bricoPWA = window.__bricoPWA || {
    deferredPrompt: null,
    bound: false,
  });
  if (!store.bound) {
    store.bound = true;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      store.deferredPrompt = e;
      window.dispatchEvent(new Event("brico:pwa-change"));
    });
    window.addEventListener("appinstalled", () => {
      store.deferredPrompt = null;
      window.dispatchEvent(new Event("brico:pwa-change"));
    });
  }
  return store;
}

const store = ensureStore();

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
    window.addEventListener("brico:pwa-change", onChange);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", onChange);
    return () => {
      window.removeEventListener("brico:pwa-change", onChange);
      mq?.removeEventListener?.("change", onChange);
    };
  }, []);

  const ios = isIosDevice();
  const canPrompt = Boolean(store?.deferredPrompt);
  const showInstallOption = !standalone;

  const install = useCallback(async () => {
    if (ios) return "ios-instructions";
    const dp = store?.deferredPrompt;
    if (!dp) return "unavailable";
    dp.prompt();
    const choice = await dp.userChoice;
    if (store) store.deferredPrompt = null;
    window.dispatchEvent(new Event("brico:pwa-change"));
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  }, [ios]);

  return { showInstallOption, isStandalone: standalone, isIos: ios, canPrompt, install };
}
