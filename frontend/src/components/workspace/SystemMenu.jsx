import { useState } from "react";
import { toast } from "sonner";
import BrandMark from "@/components/BrandMark";
import BrandWordmark from "@/components/BrandWordmark";
import {
  Check,
  Download,
  Info,
  Lock,
  Palette,
  RotateCw,
  Share,
  SquarePlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { getDeviceToken } from "@/lib/deviceAuth";
import { WALLPAPERS, lockScreen } from "@/lib/osShell";
import { haptics } from "@/lib/haptics";
import { usePwaInstall } from "@/hooks/usePwaInstall";

const SESSION_START = Date.now();

function sessionUptime() {
  const minutes = Math.max(0, Math.round((Date.now() - SESSION_START) / 60000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function AboutRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right font-mono text-xs font-bold text-foreground">
        {value}
      </span>
    </div>
  );
}

// Menu de sistema (o "menu Apple" do BRICO OS) no avatar da barra global:
// personalização, informação do sistema e bloqueio real do ecrã.
export default function SystemMenu({ wallpaperId, onWallpaperChange }) {
  const { status, online } = useSystemStatus();
  const [aboutOpen, setAboutOpen] = useState(false);
  const { showInstallOption, install } = usePwaInstall();
  const [iosStepsOpen, setIosStepsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    if (installing) return;
    haptics.tap();
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === "ios-instructions") {
        setIosStepsOpen(true);
      } else if (outcome === "unavailable") {
        toast.info("Ainda não é possível instalar automaticamente. Recarrega a página ou usa o menu do navegador (⋮) e escolhe \"Instalar aplicação\".");
      } else if (outcome === "accepted") {
        toast.success("BRICO OS instalado!");
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="system-menu"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-900/10 bg-gradient-to-br from-slate-100 to-slate-300 text-[9px] font-black text-slate-800 shadow-inner transition-transform hover:scale-105 active:scale-95"
            title="Menu de sistema"
            aria-label="Menu de sistema"
          >
            TS
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-300 text-[9px] font-black text-slate-800 shadow-inner">
              TS
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-extrabold text-foreground">
                Tiago Silva
              </span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Loja principal
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="system-menu-about"
            onClick={() => setAboutOpen(true)}
          >
            <Info className="mr-2 h-4 w-4" /> Sobre o <BrandWordmark className="ml-1 h-3.5 w-auto" />
          </DropdownMenuItem>
          {showInstallOption ? (
            <DropdownMenuItem
              data-testid="system-menu-install"
              disabled={installing}
              onClick={handleInstall}
            >
              <Download className="mr-2 h-4 w-4" /> Instalar aplicação
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-testid="system-menu-wallpaper">
              <Palette className="mr-2 h-4 w-4" /> Fundo do ambiente
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {WALLPAPERS.map((wp) => (
                <DropdownMenuItem
                  key={wp.id}
                  data-testid={`wallpaper-${wp.id}`}
                  onClick={() => onWallpaperChange?.(wp.id)}
                >
                  <span
                    className="mr-2 h-4 w-6 shrink-0 rounded border border-neutral-900/10"
                    style={{ background: wp.swatch }}
                  />
                  <span className="flex-1">{wp.name}</span>
                  {wallpaperId === wp.id ? (
                    <Check className="h-3.5 w-3.5 text-red-600" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.location.reload()}>
            <RotateCw className="mr-2 h-4 w-4" /> Reiniciar interface
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="system-menu-lock"
            onClick={() => {
              haptics.tap();
              lockScreen();
            }}
            className="text-red-600 focus:text-red-600"
          >
            <Lock className="mr-2 h-4 w-4" /> Bloquear ecrã
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent data-testid="about-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="sr-only">Sobre o BRICO OS</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center pt-2 text-center">
            <BrandMark className="h-14 w-14 rounded-[18px]" />
            <BrandWordmark className="mt-4 h-8" />
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.34em] text-muted-foreground">
              Operations Workstation
            </p>
            <p className="mt-2 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[10px] font-bold text-muted-foreground">
              Versão 2.0 · build 2026.07
            </p>
          </div>
          <div className="mt-2 rounded-2xl border border-border bg-muted/50 px-4 py-1">
            <AboutRow
              label="Estado"
              value={
                <span className="flex items-center gap-1.5">
                  <span className={`led ${online ? "led-ok" : "led-alert"}`} />
                  {online ? "Ligado" : "Offline"}
                </span>
              }
            />
            <AboutRow label="Sessão ativa há" value={sessionUptime()} />
            <AboutRow
              label="Pedidos ativos"
              value={status?.pedidos_ativos ?? "–"}
            />
            <AboutRow
              label="Emails por ver"
              value={status?.emails_nao_vistos ?? "–"}
            />
            <AboutRow
              label="Tarefas pendentes"
              value={status?.tarefas_pendentes ?? "–"}
            />
            <AboutRow
              label="Dispositivo"
              value={getDeviceToken() ? "Verificado por PIN" : "Não verificado"}
            />
          </div>
          <p className="text-center font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
            ⌘K pesquisar · F3 janelas · ⌘H ambiente de trabalho
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={iosStepsOpen} onOpenChange={setIosStepsOpen}>
        <DialogContent data-testid="pwa-install-ios-dialog" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 font-heading text-lg font-extrabold tracking-tight">
              Instalar <BrandWordmark className="h-4 w-auto" />
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toca em "Partilhar" na barra do Safari
            </p>
            <p className="mt-1.5 flex items-center gap-1.5">
              <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolhe "Adicionar ao Ecrã Principal"
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
