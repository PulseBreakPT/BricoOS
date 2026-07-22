import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Command,
  ListChecks,
  Mail,
  Search,
  Truck,
  Waves,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import AppLauncher from "@/components/workspace/AppLauncher";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { haptics } from "@/lib/haptics";

const OPERATING_APPS = [
  {
    path: "/",
    title: "Pedidos",
    detail: "Clientes e obra",
    icon: ClipboardList,
    statusKey: "pedidos_ativos",
    statusLabel: "ativos",
    tone: "graphite",
  },
  {
    path: "/emails",
    title: "Correio",
    detail: "Entrada e respostas",
    icon: Mail,
    statusKey: "emails_nao_vistos",
    statusLabel: "por ver",
    tone: "blue",
  },
  {
    path: "/tarefas",
    title: "Tarefas",
    detail: "Prioridades do turno",
    icon: ListChecks,
    statusKey: "tarefas_pendentes",
    statusLabel: "pendentes",
    tone: "green",
  },
  {
    path: "/fornecedores",
    title: "Fornecedores",
    detail: "Parceiros e compras",
    icon: Truck,
    tone: "amber",
  },
  {
    path: "/catalogo-tecnico",
    title: "Catálogo",
    detail: "Produtos e medidas",
    icon: BookOpenCheck,
    tone: "signal",
  },
  {
    path: "/estatisticas",
    title: "Análise",
    detail: "Pulso da operação",
    icon: BarChart3,
    tone: "violet",
  },
];

const TOOL_TYPES = [
  "explorer",
  "downloads",
  "calculator",
  "scratchpad",
  "stopwatch",
  "health",
];

function pathIsActive(pathname, path) {
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

/**
 * Launcher principal convertido num Control Deck: rotas, ferramentas,
 * janelas em execução e sinais do turno vivem num único lugar. Assim o
 * lançador deixa de parecer apenas uma grelha de ícones genérica.
 */
export default function ControlDeck({
  onClose,
  onOpenRoute,
  onOpenSearch,
  onOpenActivity,
}) {
  const location = useLocation();
  const { status, online } = useSystemStatus();
  const { panels } = useWorkspace();
  const runningPanels = panels.filter((panel) => !panel.minimized).length;

  const openRoute = (path) => {
    haptics.tap();
    onOpenRoute?.(path);
    onClose?.();
  };

  return (
    <div className="control-deck-grid grid min-h-0 lg:grid-cols-[minmax(0,1fr)_292px]">
      <section className="min-w-0 border-b border-white/[0.08] p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <button
          type="button"
          data-testid="control-deck-search"
          onClick={() => {
            onClose?.();
            onOpenSearch?.();
          }}
          className="control-deck-command group flex w-full items-center gap-3 rounded-[18px] border border-white/[0.1] px-4 py-3.5 text-left transition-all hover:border-white/20 hover:bg-white/[0.07]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.1] bg-white/[0.06] text-white/55 transition-colors group-hover:text-white">
            <Search className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-white/85">
              Encontrar qualquer coisa
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/30">
              Pedidos, clientes, emails, ficheiros e ações do sistema
            </span>
          </span>
          <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 font-mono text-[9px] font-bold text-white/30 sm:flex">
            <Command className="h-3 w-3" /> K
          </span>
        </button>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="engraved">Aplicações de operação</p>
            <p className="mt-1.5 text-[11px] font-semibold text-white/30">
              O núcleo diário da loja
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">
            <span className={`led ${online ? "led-ok" : "led-alert"}`} />
            {online ? "Ao vivo" : "Offline"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 xl:grid-cols-3">
          {OPERATING_APPS.map((app) => {
            const Icon = app.icon;
            const active = pathIsActive(location.pathname, app.path);
            const count = app.statusKey ? status?.[app.statusKey] : null;
            return (
              <button
                type="button"
                key={app.path}
                data-testid={`control-deck-route-${app.path === "/" ? "home" : app.path.slice(1)}`}
                onClick={() => openRoute(app.path)}
                className={`control-deck-app control-deck-app-${app.tone} group relative min-w-0 overflow-hidden rounded-[20px] border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${active ? "is-active border-white/25" : "border-white/[0.08]"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="control-deck-app-icon flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 text-white/80">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {count != null ? (
                    <span className="text-right leading-none">
                      <span className="block font-mono text-lg font-black tabular-nums text-white/90">
                        {count}
                      </span>
                      <span className="mt-1 block text-[7px] font-black uppercase tracking-[0.12em] text-white/25">
                        {app.statusLabel}
                      </span>
                    </span>
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-white/20 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/60" />
                  )}
                </span>
                <span className="mt-3 block truncate text-xs font-extrabold text-white/85">
                  {app.title}
                </span>
                <span className="mt-1 block truncate text-[9px] font-semibold text-white/30">
                  {app.detail}
                </span>
                {active ? (
                  <span className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="engraved">Ferramentas de bancada</p>
            <p className="mt-1.5 text-[11px] font-semibold text-white/30">
              Abrem em janelas independentes
            </p>
          </div>
          <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/20">
            Arrasta para ordenar
          </span>
        </div>
        <div className="control-deck-tools mt-3 rounded-[20px] border border-white/[0.07] bg-black/15 p-3">
          <AppLauncher
            variant="launcher"
            types={TOOL_TYPES}
            onLaunch={onClose}
          />
        </div>
      </section>

      <aside className="control-deck-side flex min-h-0 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="engraved">Turno atual</p>
            <p className="mt-2 font-heading text-xl font-extrabold tracking-tight text-white">
              Operação 01
            </p>
            <p className="mt-1 text-[10px] font-semibold text-white/30">
              Espaço de Tiago · Loja principal
            </p>
          </div>
          <span className="control-deck-orbit" aria-hidden="true">
            <Waves className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-5 rounded-[20px] border border-white/[0.08] bg-black/20 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">
              Multitarefa
            </span>
            <span className="font-mono text-[9px] font-bold text-white/25">
              {runningPanels} abertas
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1.5" aria-hidden="true">
            {[42, 72, 58, 88, 64, 78, 52, 92, 70, 84].map((height, index) => (
              <span
                key={index}
                className="control-deck-wave flex-1 rounded-full"
                style={{ height: `${Math.round(height * 0.34)}px` }}
              />
            ))}
          </div>
          <p className="mt-3 text-[10px] font-semibold leading-relaxed text-white/38">
            {runningPanels
              ? "As ferramentas abertas continuam disponíveis no dock."
              : "Sem ferramentas flutuantes abertas neste momento."}
          </p>
        </div>

        <div className="mt-5">
          <p className="engraved">Ações rápidas</p>
          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onOpenActivity?.();
              }}
              className="control-deck-action group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/[0.08] px-3 text-left transition-colors hover:border-white/16 hover:bg-white/[0.06]"
            >
              <Activity className="h-4 w-4 text-amber-300/70" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold text-white/70">
                  Centro de atividade
                </span>
                <span className="mt-0.5 block truncate text-[8px] font-semibold text-white/25">
                  Sincronização e histórico
                </span>
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/55" />
            </button>
            <button
              type="button"
              onClick={() => openRoute("/")}
              className="control-deck-action group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/[0.08] px-3 text-left transition-colors hover:border-white/16 hover:bg-white/[0.06]"
            >
              <ClipboardList className="h-4 w-4 text-red-300/70" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold text-white/70">
                  Retomar pedidos
                </span>
                <span className="mt-0.5 block truncate text-[8px] font-semibold text-white/25">
                  Voltar à operação principal
                </span>
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/55" />
            </button>
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between border-t border-white/[0.08] pt-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/20">
            <span>BRICO OS 2.0</span>
            <span>{online ? "Sistema estável" : "Modo local"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
