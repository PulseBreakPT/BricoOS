import { useState } from "react";
import {
  Bell, Download, Lock, RotateCw, Share, Smartphone, SquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { getDeviceToken } from "@/lib/deviceAuth";
import { lockScreen } from "@/lib/osShell";
import { haptics } from "@/lib/haptics";

const SESSION_START = Date.now();

function sessionUptime() {
  const minutes = Math.max(0, Math.round((Date.now() - SESSION_START) / 60000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function SettingsSection({ title, description, children }) {
  return (
    <section className="mt-5 first:mt-0">
      <p className="kicker">{title}</p>
      {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-3 rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function SettingsRow({ icon: Icon, label, description, control, testid }) {
  return (
    <div data-testid={testid} className="flex items-center gap-3 border-b border-border/70 p-4 last:border-b-0">
      {Icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function AboutRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-2.5 last:border-b-0">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs font-bold text-foreground">{value}</span>
    </div>
  );
}

// Aba de Definições — a mesma coisa que já existia só no menu de sistema do
// computador (SystemMenu.jsx: notificações, instalar, bloquear, sobre)
// passa a ter também uma página própria no telemóvel, alcançável a partir
// da gaveta "Mais". O fundo do ambiente de trabalho fica de fora — é uma
// opção só do modo computador (pinta o papel de parede à volta das
// janelas), sem equivalente na navegação por páginas do telemóvel.
export default function Settings() {
  const { status, online } = useSystemStatus();
  const { showInstallOption, install, isStandalone, isIos } = usePwaInstall();
  const push = usePushNotifications();
  const [installing, setInstalling] = useState(false);
  const [iosStepsOpen, setIosStepsOpen] = useState(false);

  const handleInstall = async () => {
    if (installing) return;
    haptics.tap();
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === "ios-instructions") setIosStepsOpen(true);
      else if (outcome === "unavailable") {
        toast.info("Ainda não é possível instalar automaticamente. Usa o menu do navegador (⋮) e escolhe \"Instalar aplicação\".");
      } else if (outcome === "accepted") toast.success("BRICO OS instalado!");
    } finally {
      setInstalling(false);
    }
  };

  const handleTogglePush = async (checked) => {
    if (push.busy) return;
    haptics.tap();
    if (!checked) {
      await push.unsubscribe();
      toast.info("Notificações desativadas neste dispositivo.");
      return;
    }
    if (isIos && !isStandalone) {
      toast.info("No iPhone/iPad, instala primeiro o BRICO OS no ecrã principal — as notificações só funcionam depois de instalada.");
      return;
    }
    const result = await push.subscribe();
    if (result.ok) {
      toast.success("Notificações ativadas — vais receber um aviso quando chegar um email novo.");
      push.sendTest();
    } else if (result.reason === "denied") {
      toast.error("Permissão de notificações recusada. Ativa-a nas definições do browser/telemóvel para este site.");
    } else {
      toast.error("Não foi possível ativar as notificações. Tenta novamente.");
    }
  };

  return (
    <div className="pb-4">
      <div className="flex flex-col gap-1">
        <p className="kicker">Sistema</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Definições
        </h1>
        <p className="text-sm text-muted-foreground">
          Notificações, instalação e informação sobre este dispositivo.
        </p>
      </div>

      <SettingsSection
        title="Notificações"
        description="Recebe um aviso no telemóvel quando chegar um email novo — mesmo com a app fechada."
      >
        <SettingsRow
          testid="settings-push-row"
          icon={Bell}
          label="Notificações neste dispositivo"
          description={
            !push.supported
              ? "Este browser não suporta notificações push."
              : push.subscribed
                ? "Ativas — vais ser avisado ao chegar um email novo."
                : "Desativadas."
          }
          control={
            push.supported ? (
              <Switch
                data-testid="settings-push-switch"
                checked={push.subscribed}
                disabled={push.busy || push.checking}
                onCheckedChange={handleTogglePush}
              />
            ) : null
          }
        />
        {isIos && !isStandalone ? (
          <div className="border-t border-border/70 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            No iPhone/iPad as notificações só funcionam com a app instalada no ecrã principal — instala-a primeiro (secção "Aplicação" abaixo).
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Aplicação">
        {showInstallOption ? (
          <>
            <SettingsRow
              testid="settings-install-row"
              icon={Download}
              label="Instalar BRICO OS"
              description="Acesso mais rápido, direto do ecrã principal."
              control={
                <button
                  type="button"
                  data-testid="settings-install-btn"
                  disabled={installing}
                  onClick={handleInstall}
                  className="rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Instalar
                </button>
              }
            />
            {iosStepsOpen ? (
              <div className="border-t border-border/70 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toca em "Partilhar" na barra do Safari
                </p>
                <p className="mt-1.5 flex items-center gap-1.5">
                  <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolhe "Adicionar ao Ecrã Principal"
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <SettingsRow icon={Smartphone} label="BRICO OS já instalado" description="Estás a usar a app instalada no dispositivo." />
        )}
      </SettingsSection>

      <SettingsSection title="Sistema">
        <SettingsRow
          testid="settings-reload-row"
          icon={RotateCw}
          label="Reiniciar interface"
          description="Recarrega a app do zero."
          control={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-accent"
            >
              Reiniciar
            </button>
          }
        />
        <SettingsRow
          testid="settings-lock-row"
          icon={Lock}
          label="Bloquear ecrã"
          description="Pede o PIN outra vez antes de continuar a usar a app."
          control={
            <button
              type="button"
              data-testid="settings-lock-btn"
              onClick={() => { haptics.tap(); lockScreen(); }}
              className="rounded-xl border border-red-200 bg-[var(--pastel-red-bg)] px-3 py-1.5 text-xs font-bold text-[color:var(--pastel-red-text)] transition-colors hover:opacity-90"
            >
              Bloquear
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection title="Sobre">
        <AboutRow
          label="Estado"
          value={
            <span className="flex items-center gap-1.5 justify-end">
              <span className={`led ${online ? "led-ok" : "led-alert"}`} />
              {online ? "Ligado" : "Offline"}
            </span>
          }
        />
        <AboutRow label="Versão" value="2.0 · build 2026.07" />
        <AboutRow label="Sessão ativa há" value={sessionUptime()} />
        <AboutRow label="Pedidos ativos" value={status?.pedidos_ativos ?? "–"} />
        <AboutRow label="Emails por ver" value={status?.emails_nao_vistos ?? "–"} />
        <AboutRow label="Tarefas pendentes" value={status?.tarefas_pendentes ?? "–"} />
        <AboutRow label="Dispositivo" value={getDeviceToken() ? "Verificado por PIN" : "Não verificado"} />
      </SettingsSection>
    </div>
  );
}
