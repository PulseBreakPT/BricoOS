import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Command,
  ListChecks,
  Mail,
  Sparkles,
} from "lucide-react";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { timeAgo } from "@/lib/pedido";

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

const metricMeta = [
  {
    key: "pedidos_ativos",
    label: "Pedidos",
    detail: "ativos",
    icon: ClipboardList,
    route: "/",
    tone: "violet",
  },
  {
    key: "emails_nao_vistos",
    label: "Correio",
    detail: "por ver",
    icon: Mail,
    route: "/emails",
    tone: "blue",
  },
  {
    key: "tarefas_pendentes",
    label: "Tarefas",
    detail: "pendentes",
    icon: ListChecks,
    route: "/tarefas",
    tone: "green",
  },
];

/**
 * Painel ambiente do desktop: mostra o pulso da loja sem obrigar a abrir uma
 * aplicação. É a assinatura espacial do BRICO OS e só ocupa a calha lateral
 * em ecrãs realmente largos; maximizar uma janela devolve-lhe todo o espaço.
 */
export default function DesktopOperationsRail({
  app,
  visible = true,
  onOpenRoute,
}) {
  const now = useClock();
  const { status, online } = useSystemStatus();
  const { panels } = useWorkspace();

  const metrics = useMemo(
    () =>
      metricMeta.map((metric) => ({
        ...metric,
        value: status?.[metric.key] ?? "–",
      })),
    [status],
  );

  const openWindows = panels.filter((panel) => !panel.minimized).length;
  const attentionTotal =
    Number(status?.emails_nao_vistos || 0) +
    Number(status?.tarefas_pendentes || 0);

  if (!visible) return null;

  return (
    <aside
      data-testid="desktop-operations-rail"
      aria-label="Pulso da loja"
      className="os-liveops-rail fixed z-[18] hidden flex-col overflow-hidden rounded-[26px] border border-neutral-900/[0.08] text-neutral-900 shadow-[0_30px_90px_-28px_rgba(16,17,20,0.35)] 2xl:flex"
    >
      <div className="relative border-b border-neutral-900/[0.08] px-5 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-neutral-500">
            <span className={`led ${online ? "led-ok" : "led-alert"}`} />
            LiveOps
          </span>
          <span className="rounded-full border border-neutral-900/10 bg-neutral-900/[0.04] px-2 py-1 font-mono text-[9px] font-bold text-neutral-500">
            Loja 01
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-heading text-[2.65rem] font-black leading-none tracking-[-0.055em] tabular-nums">
              {now.toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-2 text-[11px] font-semibold capitalize text-neutral-500">
              {now.toLocaleDateString("pt-PT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="os-pulse-orbit" aria-hidden="true">
            <span />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-900/[0.08] bg-neutral-900/[0.04] px-3 py-2 text-[10px] font-bold">
          <span className="flex items-center gap-2 text-neutral-600">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            Operação estável
          </span>
          <span className="font-mono text-neutral-400">
            {status?.last_sync ? timeAgo(status.last_sync) : "agora"}
          </span>
        </div>
      </div>

      <div className="scroll-chrome min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        <p className="engraved px-1.5">Pulso da loja</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <button
                type="button"
                key={metric.key}
                onClick={() => onOpenRoute?.(metric.route)}
                className={`os-liveops-metric os-liveops-metric-${metric.tone} group min-w-0 rounded-2xl border border-neutral-900/[0.08] px-2 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-900/20 active:scale-[0.97]`}
                aria-label={`Abrir ${metric.label}: ${metric.value} ${metric.detail}`}
              >
                <Icon className="h-3.5 w-3.5 text-neutral-500 transition-colors group-hover:text-neutral-700" />
                <p className="mt-3 font-mono text-xl font-black leading-none tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-1 truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-neutral-400">
                  {metric.label}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-neutral-900/[0.08] bg-neutral-900/[0.04] p-3.5">
          <div className="flex items-center justify-between">
            <p className="engraved">Espaço ativo</p>
            <Command className="h-3.5 w-3.5 text-neutral-400" />
          </div>
          <p className="mt-3 truncate font-heading text-sm font-extrabold text-neutral-900">
            {app?.title || "Área de trabalho"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-neutral-400">
            <span>{openWindows} janelas abertas</span>
            <span className="h-1 w-1 rounded-full bg-neutral-300" />
            <span>Sincronizado</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-neutral-900/[0.08] pt-3 font-mono text-[9px] font-bold text-neutral-400">
            <span>{attentionTotal} sinais em foco</span>
            <span>⌘K pesquisar</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
