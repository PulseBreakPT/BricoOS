import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ClipboardList,
  Command,
  ListChecks,
  Mail,
  Search,
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
  onOpenActivity,
  onOpenSearch,
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
      className="os-liveops-rail fixed bottom-[98px] right-4 top-[72px] z-[18] hidden w-[284px] flex-col overflow-hidden rounded-[26px] border border-white/[0.12] text-white shadow-[0_30px_90px_-28px_rgba(0,0,0,0.9)] 2xl:flex"
    >
      <div className="relative border-b border-white/[0.08] px-5 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-white/45">
            <span className={`led ${online ? "led-ok" : "led-alert"}`} />
            LiveOps
          </span>
          <span className="rounded-full border border-white/[0.1] bg-white/[0.05] px-2 py-1 font-mono text-[9px] font-bold text-white/45">
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
            <p className="mt-2 text-[11px] font-semibold capitalize text-white/45">
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

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-[10px] font-bold">
          <span className="flex items-center gap-2 text-white/65">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            Operação estável
          </span>
          <span className="font-mono text-white/30">
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
                className={`os-liveops-metric os-liveops-metric-${metric.tone} group min-w-0 rounded-2xl border border-white/[0.08] px-2 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.97]`}
                aria-label={`Abrir ${metric.label}: ${metric.value} ${metric.detail}`}
              >
                <Icon className="h-3.5 w-3.5 text-white/45 transition-colors group-hover:text-white/80" />
                <p className="mt-3 font-mono text-xl font-black leading-none tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-1 truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-white/35">
                  {metric.label}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between px-1.5">
          <p className="engraved">Foco agora</p>
          <span className="font-mono text-[9px] font-bold text-white/25">
            {attentionTotal} sinais
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          <button
            type="button"
            onClick={() => onOpenRoute?.("/")}
            className="os-liveops-focus group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] px-3 py-3 text-left transition-all hover:border-red-400/30 hover:bg-white/[0.07] active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300 ring-1 ring-red-400/20">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-extrabold text-white/80">
                Pedidos em andamento
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-semibold text-white/35">
                Retomar a operação principal
              </span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-white/20 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/60" />
          </button>
          <button
            type="button"
            onClick={onOpenActivity}
            className="os-liveops-focus group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] px-3 py-3 text-left transition-all hover:border-amber-300/30 hover:bg-white/[0.07] active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/15">
              <Activity className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-extrabold text-white/80">
                Linha de atividade
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-semibold text-white/35">
                Mudanças, emails e documentos
              </span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-white/20 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/60" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-3.5">
          <div className="flex items-center justify-between">
            <p className="engraved">Espaço ativo</p>
            <Command className="h-3.5 w-3.5 text-white/25" />
          </div>
          <p className="mt-3 truncate font-heading text-sm font-extrabold text-white/85">
            {app?.title || "Área de trabalho"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-white/35">
            <span>{openWindows} janelas abertas</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Sincronizado</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-white/[0.08] p-3.5">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-[10px] font-extrabold text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Search className="h-3.5 w-3.5" /> Comando rápido
        </button>
        <span className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-black/20 font-mono text-[9px] font-black text-white/30">
          ⌘K
        </span>
      </div>
    </aside>
  );
}
