import { ArrowLeft, ChevronRight, X } from "lucide-react";

// Barra de navegação em pilha — Pedido → Email → PDF → Fornecedor, por
// exemplo. Cada nível fica visível na barra; tocar num nível anterior volta
// a ele (como o breadcrumb de um explorador de ficheiros), sem perder onde
// se ficou no pedido em baixo. onPopTo(-1) volta à ficha do pedido.
export default function EntityStackBar({ rootLabel, frames, onPopTo, onClose }) {
  return (
    <div data-testid="entity-stack-bar" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/60 px-3 py-2 sm:px-6">
      <button
        type="button"
        data-testid="entity-stack-back"
        disabled={frames.length === 0}
        onClick={() => onPopTo(frames.length - 2)}
        title="Voltar"
        className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid="entity-stack-root"
        onClick={() => onPopTo(-1)}
        className="shrink-0 truncate rounded-md px-1.5 py-0.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {rootLabel}
      </button>
      {frames.map((f, i) => (
        <span key={f.key} className="flex shrink-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <button
            type="button"
            data-testid={`entity-stack-frame-${i}`}
            onClick={() => onPopTo(i)}
            className={`max-w-[9rem] truncate rounded-md px-1.5 py-0.5 text-xs font-bold hover:bg-muted ${i === frames.length - 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {f.label}
          </button>
        </span>
      ))}
      <button
        type="button"
        data-testid="entity-stack-close"
        onClick={onClose}
        title="Fechar e voltar ao pedido"
        className="ml-auto flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
