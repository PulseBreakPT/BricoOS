import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

const DISMISS_KEY = "brico-pwa-install-dismissed";

// localStorage pode lançar em modo privado/armazenamento bloqueado (algumas
// versões do Safari, por exemplo) — o resto do código já protege sempre
// estas chamadas (ThemeContext, WorkspaceContext...); faltava aqui.
function readDismissed() {
    try {
        return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
        return false;
    }
}
function writeDismissed(value) {
    try {
        if (value) localStorage.setItem(DISMISS_KEY, "1");
        else localStorage.removeItem(DISMISS_KEY);
    } catch { /* armazenamento bloqueado — o dispensar só dura a sessão em memória */ }
}

export default function InstallPwaBanner() {
    const { showInstallOption, install } = usePwaInstall();
    const [dismissed, setDismissed] = useState(readDismissed);
    const [showIosSteps, setShowIosSteps] = useState(false);

    // Se a app for desinstalada, "showInstallOption" volta a true numa visita
    // seguinte — mas o dispensar desta sessão específica não deve persistir
    // para sempre, só até à próxima vez que a opção de instalar reaparecer.
    useEffect(() => {
        if (showInstallOption) return;
        setDismissed(false);
        writeDismissed(false);
    }, [showInstallOption]);

    const visible = showInstallOption && !dismissed;

    const dismiss = () => {
        setDismissed(true);
        setShowIosSteps(false);
        writeDismissed(true);
    };

    const handleInstall = async () => {
        const outcome = await install();
        if (outcome === "ios-instructions") {
            setShowIosSteps((v) => !v);
            return;
        }
        if (outcome === "accepted" || outcome === "dismissed") {
            setShowIosSteps(false);
        }
    };

    if (!visible) return null;

    return (
        <div
            className="fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-4 lg:bottom-[6.75rem]"
            data-testid="pwa-install-banner"
        >
            <div className="themed-surface flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-xl shadow-slate-300/40 animate-in fade-in-0 slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Download className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">Instalar BRICO OS</p>
                        <p className="truncate text-xs text-muted-foreground">Acesso mais rápido, direto do ecrã principal.</p>
                    </div>
                    <button
                        type="button"
                        data-testid="pwa-install-dismiss"
                        onClick={dismiss}
                        aria-label="Dispensar"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {!showIosSteps ? (
                    <button
                        type="button"
                        data-testid="pwa-install-btn"
                        onClick={handleInstall}
                        className="h-9 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Instalar
                    </button>
                ) : (
                    <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                            <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toca em "Partilhar" na barra do Safari
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5">
                            <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolhe "Adicionar ao Ecrã Principal"
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
