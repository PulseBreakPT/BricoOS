import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

const DISMISS_KEY = "brico-pwa-install-dismissed";

function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
    const ua = window.navigator.userAgent;
    const iOSDevice = /iphone|ipad|ipod/i.test(ua);
    const iPadOS13Up = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS13Up;
}

export default function InstallPwaBanner() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [visible, setVisible] = useState(false);
    const [showIosSteps, setShowIosSteps] = useState(false);

    useEffect(() => {
        if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

        if (isIos()) {
            setVisible(true);
            return;
        }

        const onPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setVisible(true);
        };
        const onInstalled = () => {
            setVisible(false);
            localStorage.setItem(DISMISS_KEY, "1");
        };

        window.addEventListener("beforeinstallprompt", onPrompt);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const dismiss = () => {
        setVisible(false);
        setShowIosSteps(false);
        localStorage.setItem(DISMISS_KEY, "1");
    };

    const install = async () => {
        if (isIos()) {
            setShowIosSteps((v) => !v);
            return;
        }
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, "1");
    };

    if (!visible) return null;

    return (
        <div
            className="fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6"
            data-testid="pwa-install-banner"
        >
            <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/40 animate-in fade-in-0 slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Download className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">Instalar Brico Assistente</p>
                        <p className="truncate text-xs text-slate-500">Acesso mais rápido, direto do ecrã principal.</p>
                    </div>
                    <button
                        type="button"
                        data-testid="pwa-install-dismiss"
                        onClick={dismiss}
                        aria-label="Dispensar"
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {!showIosSteps ? (
                    <button
                        type="button"
                        data-testid="pwa-install-btn"
                        onClick={install}
                        className="h-9 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Instalar
                    </button>
                ) : (
                    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        <p className="flex items-center gap-1.5">
                            <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toque em "Partilhar" na barra do Safari
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5">
                            <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolha "Adicionar ao Ecrã Principal"
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
