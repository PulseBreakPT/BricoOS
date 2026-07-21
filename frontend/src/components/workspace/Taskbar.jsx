import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { X, LayoutGrid, Mail, ClipboardList, RefreshCw, Grid2x2, LayoutTemplate, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { PANEL_TYPES, PANEL_ORDER, routeMatchesPanelType } from "@/lib/panelRegistry";
import { timeAgo } from "@/lib/pedido";
import QuickPeekTrigger from "@/components/QuickPeek";
import DockIcon from "@/components/workspace/DockIcon";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const DOCK_ORDER_KEY = "brico_dock_order_v1";

// Ordem dos ícones do Dock, guardada localmente — reconciliada com
// PANEL_ORDER a cada carregamento: tipos novos (de uma futura versão da
// app) entram no fim; tipos removidos desaparecem, sem partir nada.
function loadDockOrder() {
  let saved = [];
  try { saved = JSON.parse(window.localStorage.getItem(DOCK_ORDER_KEY) || "[]"); } catch { saved = []; }
  const known = saved.filter((t) => PANEL_ORDER.includes(t));
  const missing = PANEL_ORDER.filter((t) => !known.includes(t));
  return [...known, ...missing];
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Barra de estado ao estilo de um SO: ligação, contadores em tempo real e
// há quanto tempo a caixa de entrada foi verificada — sempre visível, sem
// abrir nada.
function StatusCluster() {
  const { status, online } = useSystemStatus();
  const now = useClock();
  return (
    <div data-testid="taskbar-status" className="hidden shrink-0 items-center gap-3 border-l border-white/10 pl-3 text-[11px] font-semibold text-[color:var(--chrome-muted)] md:flex">
      <span data-testid="taskbar-clock" className="font-mono tabular-nums text-white" title={now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}>
        {now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="flex items-center gap-1.5" title={online ? "Ligado ao servidor" : "Sem ligação ao servidor"}>
        <span className={`led ${online ? "led-ok" : "led-alert"}`} />
        {online ? "Ligado" : "Sem ligação"}
      </span>
      {status ? (
        <>
          <span className="flex items-center gap-1" title="Emails por ver">
            <Mail className="h-3.5 w-3.5" /> {status.emails_nao_vistos}
          </span>
          <span className="flex items-center gap-1" title="Pedidos ativos">
            <ClipboardList className="h-3.5 w-3.5" /> {status.pedidos_ativos}
          </span>
          {status.last_sync ? (
            <span className="flex items-center gap-1" title="Última verificação da caixa de entrada">
              <RefreshCw className="h-3 w-3" /> {timeAgo(status.last_sync)}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Áreas de trabalho guardadas — uma fotografia da disposição atual (que
// painéis, onde, que tamanho) para voltar a ela com um clique. Ex.: uma
// para "Orçamentos" (Pedidos + PDF lado a lado), outra só com a caixa de
// entrada maximizada.
function WorkspaceMenu() {
  const { panels, workspaces, saveWorkspace, loadWorkspace, deleteWorkspace } = useWorkspace();

  const handleSave = () => {
    const name = window.prompt("Nome para esta área de trabalho:");
    if (!name || !name.trim()) return;
    saveWorkspace(name.trim());
    toast.success(`Área de trabalho "${name.trim()}" guardada`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="taskbar-workspaces"
          title="Áreas de trabalho guardadas"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--chrome-muted)] transition-colors hover:bg-white/10 hover:text-white"
        >
          <LayoutTemplate className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem data-testid="workspace-save" onClick={handleSave} disabled={panels.length === 0}>
          <Save className="mr-2 h-4 w-4" /> Guardar disposição atual…
        </DropdownMenuItem>
        {workspaces.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {workspaces.map((w) => (
              <div key={w.id} data-testid={`workspace-item-${w.id}`} className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-slate-50">
                <button
                  data-testid={`workspace-load-${w.id}`}
                  onClick={() => loadWorkspace(w.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-700"
                >
                  {w.name} <span className="font-normal text-slate-400">({w.panels.length})</span>
                </button>
                <button
                  data-testid={`workspace-delete-${w.id}`}
                  title="Eliminar"
                  onClick={(e) => { e.stopPropagation(); deleteWorkspace(w.id); }}
                  className="shrink-0 rounded p-1 text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </>
        ) : (
          <p className="px-2 py-2 text-xs text-slate-400">Sem áreas de trabalho guardadas.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Barra fixa em baixo, só desktop — lançador de "aplicações" à esquerda,
// painéis abertos (incluindo minimizados) à direita, tal como a barra de
// tarefas de um sistema operativo.
export default function Taskbar({ onOpenMissionControl }) {
  const { panels, activeId, activeContext, openPanel, focusPanel, closePanel } = useWorkspace();
  const location = useLocation();
  const [dockOrder, setDockOrder] = useState(loadDockOrder);
  const [dragType, setDragType] = useState(null);

  useEffect(() => {
    try { window.localStorage.setItem(DOCK_ORDER_KEY, JSON.stringify(dockOrder)); } catch { /* quota cheia ou modo privado */ }
  }, [dockOrder]);

  const dropOnType = (targetType) => {
    if (!dragType || dragType === targetType) { setDragType(null); return; }
    setDockOrder((prev) => {
      const next = prev.filter((t) => t !== dragType);
      const targetIndex = next.indexOf(targetType);
      next.splice(targetIndex, 0, dragType);
      return next;
    });
    setDragType(null);
  };

  return (
    <div
      data-testid="workspace-taskbar"
      className="os-chrome-flat fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-white/[0.06] px-3 py-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-red-800 text-white shadow-[0_6px_16px_-6px_rgba(217,38,38,0.55)] ring-1 ring-white/15">
        <LayoutGrid className="h-4 w-4" />
      </span>

      <button
        data-testid="taskbar-mission-control"
        onClick={onOpenMissionControl}
        disabled={panels.length === 0}
        title="Mission Control — ver todas as janelas (F3)"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--chrome-muted)] transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Grid2x2 className="h-4 w-4" />
      </button>

      <WorkspaceMenu />

      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 pr-2">
        {dockOrder.map((type) => {
          const meta = PANEL_TYPES[type];
          if (!meta) return null;
          const count = panels.filter((p) => p.type === type).length;
          const isCurrentRoute = routeMatchesPanelType(location.pathname, type);
          return (
            <DockIcon
              key={type}
              type={type}
              meta={meta}
              isOpen={count > 0}
              count={count}
              isCurrentRoute={isCurrentRoute}
              onOpen={() => openPanel(type)}
              onOpenNew={() => openPanel(type, { forceNew: true })}
              onDragStartType={setDragType}
              onDropOnType={dropOnType}
            />
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {panels.length === 0 ? (
          <span className="text-xs text-[color:var(--chrome-faint)]">Sem painéis abertos — escolhe uma aplicação à esquerda.</span>
        ) : panels.map((p) => {
          const meta = PANEL_TYPES[p.type];
          if (!meta) return null;
          const Icon = meta.icon;
          const isActive = activeId === p.id && !p.minimized;
          const sameType = panels.filter((o) => o.type === p.type);
          const label = sameType.length > 1 ? `${meta.title} #${sameType.indexOf(p) + 1}` : meta.title;
          return (
            <QuickPeekTrigger
              key={p.id}
              as="span"
              className="shrink-0"
              renderPeek={() => (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{label}</p>
                    <p className="text-[11px] text-slate-400">
                      {p.minimized ? "Minimizada" : p.maximized ? "Maximizada" : "Em janela flutuante"}
                      {isActive ? " · ativa" : ""}
                    </p>
                  </div>
                </div>
              )}
            >
              <button
                data-testid={`taskbar-panel-${p.id}`}
                onClick={() => focusPanel(p.id)}
                className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  isActive ? "bg-white text-[color:var(--chrome-deep)] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]" : p.minimized ? "border border-dashed border-white/20 text-[color:var(--chrome-faint)] hover:text-[color:var(--chrome-muted)]" : "bg-white/[0.08] text-[color:var(--chrome-muted)] hover:bg-white/[0.14] hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span
                  role="button"
                  tabIndex={-1}
                  data-testid={`taskbar-close-${p.id}`}
                  onClick={(e) => { e.stopPropagation(); closePanel(p.id); }}
                  className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            </QuickPeekTrigger>
          );
        })}
      </div>

      {activeContext ? (
        <span data-testid="workspace-active-context" className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/15 px-2.5 py-1.5 text-xs font-bold text-amber-300 sm:flex">
          {activeContext.label}
        </span>
      ) : null}

      <StatusCluster />
    </div>
  );
}
