import { X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import QuickPeekTrigger from "@/components/QuickPeek";
import { haptics } from "@/lib/haptics";

// Barra fixa em baixo, só desktop — mostra só os separadores das janelas
// abertas (incluindo minimizadas), como o alternador de janelas de um
// sistema operativo. O lançador de apps, as áreas de trabalho guardadas e
// o estado do sistema vivem agora na sidebar; aqui fica só o que está mesmo
// aberto — e a barra desaparece por completo quando não há nada para mostrar.
export default function Taskbar() {
  const { panels, activeId, focusPanel, closePanel } = useWorkspace();

  if (panels.length === 0) return null;

  return (
    <div
      data-testid="workspace-taskbar"
      className="os-chrome-flat fixed inset-x-0 bottom-0 z-40 flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3 py-2"
    >
      {panels.map((p) => {
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
              onClick={() => { haptics.tap(); focusPanel(p.id); }}
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
                onClick={(e) => { e.stopPropagation(); haptics.tap(); closePanel(p.id); }}
                className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          </QuickPeekTrigger>
        );
      })}
    </div>
  );
}
