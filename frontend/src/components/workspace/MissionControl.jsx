import { useEffect } from "react";
import { X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";

// Visão geral de todas as janelas abertas, inspirada no Mission Control do
// macOS — em vez de ires alternando entre janelas às cegas (ou a abrir e
// fechar páginas), vês tudo de uma vez e tocas na que queres. Cartões, não
// miniaturas ao vivo: renderizar cada painel duas vezes (a app real +
// reduzido aqui) tornaria a app mais lenta sem trazer informação que o
// título/ícone já não dêem para uma decisão rápida de "para onde vou".
export default function MissionControl({ open, onClose }) {
  const { panels, zOrder, activeId, focusPanel, closePanel } = useWorkspace();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ordered = [...panels].sort((a, b) => zOrder.indexOf(b.id) - zOrder.indexOf(a.id));

  return (
    <div
      data-testid="mission-control"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-slate-900/75 p-10 backdrop-blur-md animate-scale-in"
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
        Mission Control — toca numa janela para voltar · Esc para fechar
      </p>
      {ordered.length === 0 ? (
        <p className="text-sm text-white/50">Sem janelas abertas.</p>
      ) : (
        <div className="flex max-w-5xl flex-wrap items-stretch justify-center gap-5">
          {ordered.map((p) => {
            const meta = PANEL_TYPES[p.type];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = activeId === p.id && !p.minimized;
            return (
              <div key={p.id} className="group relative w-60">
                <button
                  data-testid={`mission-control-card-${p.type}`}
                  onClick={(e) => { e.stopPropagation(); focusPanel(p.id); onClose(); }}
                  className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-2xl transition-transform duration-150 hover:-translate-y-1.5 hover:scale-[1.03] ${isActive ? "border-white/80 ring-2 ring-white/60" : "border-white/10"}`}
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{meta.title}</span>
                    {p.minimized ? <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Minimizada</span> : null}
                  </div>
                  <div className="flex h-28 items-center justify-center bg-slate-100/80 text-slate-300">
                    <Icon className="h-9 w-9" strokeWidth={1.5} />
                  </div>
                </button>
                <button
                  data-testid={`mission-control-close-${p.type}`}
                  onClick={(e) => { e.stopPropagation(); closePanel(p.id); }}
                  title="Fechar"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
