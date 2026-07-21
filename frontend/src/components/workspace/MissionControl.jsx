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
  // Com janelas multi-instância (a mesma App aberta mais que uma vez), o
  // título por si só deixa de identificar cada cartão — acrescenta "#2",
  // "#3"... só quando há mesmo mais que uma instância do mesmo tipo.
  const typeCounts = {};
  panels.forEach((p) => { typeCounts[p.type] = (typeCounts[p.type] || 0) + 1; });
  const typeSeen = {};

  return (
    <div
      data-testid="mission-control"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-[color:var(--chrome-deep)]/85 p-10 backdrop-blur-md animate-scale-in"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dot-grid-dark opacity-60" />
      <p className="engraved relative !text-white/50">
        Mission Control — toca numa janela para voltar · Esc para fechar
      </p>
      {ordered.length === 0 ? (
        <p className="relative text-sm text-white/50">Sem janelas abertas.</p>
      ) : (
        <div className="relative flex max-w-5xl flex-wrap items-stretch justify-center gap-5">
          {ordered.map((p, cardIndex) => {
            const meta = PANEL_TYPES[p.type];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = activeId === p.id && !p.minimized;
            typeSeen[p.type] = (typeSeen[p.type] || 0) + 1;
            const label = typeCounts[p.type] > 1 ? `${meta.title} #${typeSeen[p.type]}` : meta.title;
            return (
              <div key={p.id} className="group relative w-60 animate-mission-in" style={{ "--stagger-i": cardIndex }}>
                <button
                  data-testid={`mission-control-card-${p.id}`}
                  onClick={(e) => { e.stopPropagation(); focusPanel(p.id); onClose(); }}
                  className={`flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-2xl transition-transform duration-150 hover:-translate-y-1.5 hover:scale-[1.03] ${isActive ? "border-red-500/70 ring-2 ring-red-500/50" : "border-white/10"}`}
                >
                  <div className="os-chrome flex items-center gap-2 border-b border-black/40 px-3 py-2">
                    <span className={`led ${isActive ? "led-ok" : ""}`} />
                    <Icon className="h-4 w-4 shrink-0 text-[color:var(--chrome-muted)]" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{label}</span>
                    {p.minimized ? <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--chrome-muted)]">Minimizada</span> : null}
                  </div>
                  <div className="flex h-28 items-center justify-center bg-dot-grid bg-white text-slate-300">
                    <Icon className="h-9 w-9" strokeWidth={1.5} />
                  </div>
                </button>
                <button
                  data-testid={`mission-control-close-${p.id}`}
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
