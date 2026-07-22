import {
  ClipboardList,
  ListChecks,
  Mail,
  Radio,
} from "lucide-react";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { haptics } from "@/lib/haptics";

const SIGNALS = [
  {
    key: "pedidos_ativos",
    label: "Pedidos",
    compactLabel: "ativos",
    icon: ClipboardList,
    route: "/",
  },
  {
    key: "emails_nao_vistos",
    label: "Correio",
    compactLabel: "por ver",
    icon: Mail,
    route: "/emails",
  },
  {
    key: "tarefas_pendentes",
    label: "Tarefas",
    compactLabel: "pendentes",
    icon: ListChecks,
    route: "/tarefas",
  },
];

/**
 * Faixa comum a todas as aplicações. Em vez de repetir cartões de dashboard,
 * mantém os sinais operacionais no chrome do sistema, como um painel de
 * instrumentos de bancada: fino, persistente e acionável.
 */
export default function OperationalRibbon({
  app,
  variant = "desktop",
  onOpenRoute,
}) {
  const { status, online } = useSystemStatus();
  const mobile = variant === "mobile";

  const openSignal = (route) => {
    haptics.tap();
    onOpenRoute?.(route);
  };

  return (
    <div
      data-testid={`operational-ribbon-${variant}`}
      aria-label="Estado operacional da loja"
      className={
        mobile
          ? "os-ops-ribbon os-ops-ribbon-mobile mt-2 flex h-11 items-stretch overflow-hidden rounded-[17px] border border-white/[0.1] text-white"
          : "os-ops-ribbon hidden h-9 shrink-0 items-stretch border-b border-black/45 text-white xl:flex"
      }
    >
      <div
        className={`${mobile ? "w-[36%] min-w-0 px-3" : "min-w-[210px] px-4"} flex items-center gap-2 border-r border-white/[0.07]`}
      >
        <span className={`led ${online ? "led-ok" : "led-alert"}`} />
        <span className="min-w-0 leading-none">
          <span className="block truncate text-[9px] font-black uppercase tracking-[0.16em] text-white/75">
            {app?.shortTitle || "Secretária"}
          </span>
          {!mobile ? (
            <span className="mt-1 block font-mono text-[7px] font-bold uppercase tracking-[0.18em] text-white/25">
              Shift A · Workspace 01
            </span>
          ) : (
            <span className="mt-1 block truncate font-mono text-[7px] font-bold uppercase tracking-[0.14em] text-white/25">
              Operação ao vivo
            </span>
          )}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch">
        {SIGNALS.map((signal) => {
          const Icon = signal.icon;
          const value = status?.[signal.key] ?? "–";
          return (
            <button
              type="button"
              key={signal.key}
              onClick={() => openSignal(signal.route)}
              className="group flex min-w-0 flex-1 items-center justify-center gap-1.5 border-r border-white/[0.07] px-2 transition-colors hover:bg-white/[0.075] focus-visible:bg-white/10 active:bg-white/[0.12] last:border-r-0"
              aria-label={`${signal.label}: ${value} ${signal.compactLabel}`}
            >
              <Icon className="hidden h-3 w-3 shrink-0 text-white/30 transition-colors group-hover:text-white/65 2xl:block" />
              <span className="font-mono text-[11px] font-black tabular-nums text-white/90">
                {value}
              </span>
              <span className="hidden truncate text-[8px] font-extrabold uppercase tracking-[0.08em] text-white/25 2xl:block">
                {signal.label}
              </span>
            </button>
          );
        })}
      </div>

      {!mobile ? (
        <div className="flex min-w-[148px] items-center justify-end gap-2 border-l border-white/[0.07] px-4 font-mono text-[8px] font-black uppercase tracking-[0.14em] text-white/30">
          <Radio className="h-3 w-3 text-emerald-300/65" />
          {online ? "Canal estável" : "Modo offline"}
        </div>
      ) : null}
    </div>
  );
}
