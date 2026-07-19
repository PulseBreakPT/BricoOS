import { useLocation } from "react-router-dom";
import { X, LayoutGrid } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES, PANEL_ORDER, routeMatchesPanelType } from "@/lib/panelRegistry";

// Barra fixa em baixo, só desktop — lançador de "aplicações" à esquerda,
// painéis abertos (incluindo minimizados) à direita, tal como a barra de
// tarefas de um sistema operativo.
export default function Taskbar() {
  const { panels, activeId, activeContext, openPanel, focusPanel, closePanel } = useWorkspace();
  const location = useLocation();

  return (
    <div
      data-testid="workspace-taskbar"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-slate-200 bg-white/90 px-3 py-2 backdrop-blur-xl"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
        <LayoutGrid className="h-4 w-4" />
      </span>

      <div className="flex shrink-0 items-center gap-1 border-r border-slate-200 pr-2">
        {PANEL_ORDER.map((type) => {
          const meta = PANEL_TYPES[type];
          const Icon = meta.icon;
          const isOpen = panels.some((p) => p.type === type);
          const isCurrentRoute = routeMatchesPanelType(location.pathname, type);
          return (
            <button
              key={type}
              data-testid={`taskbar-launch-${type}`}
              disabled={isCurrentRoute}
              title={isCurrentRoute ? `${meta.title} já é a página atual` : `Abrir ${meta.title}`}
              onClick={() => openPanel(type)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${isOpen ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {panels.length === 0 ? (
          <span className="text-xs text-slate-400">Sem painéis abertos — escolhe uma aplicação à esquerda.</span>
        ) : panels.map((p) => {
          const meta = PANEL_TYPES[p.type];
          if (!meta) return null;
          const Icon = meta.icon;
          const isActive = activeId === p.id && !p.minimized;
          return (
            <button
              key={p.id}
              data-testid={`taskbar-panel-${p.type}`}
              onClick={() => focusPanel(p.id)}
              className={`group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                isActive ? "bg-slate-900 text-white" : p.minimized ? "border border-dashed border-slate-300 text-slate-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.title}
              <span
                role="button"
                tabIndex={-1}
                data-testid={`taskbar-close-${p.type}`}
                onClick={(e) => { e.stopPropagation(); closePanel(p.id); }}
                className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {activeContext ? (
        <span data-testid="workspace-active-context" className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-800 sm:flex">
          {activeContext.label}
        </span>
      ) : null}
    </div>
  );
}
