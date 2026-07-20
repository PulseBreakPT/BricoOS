import { MoreVertical, Phone, AlertTriangle } from "lucide-react";
import { STATUS_ORDER, getStatusCfg, getPriorityCfg } from "@/lib/pedido";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { CategoryBadge } from "@/components/CategoryBadge";

function KanbanCard({ note, onOpen, onMove }) {
  const pr = getPriorityCfg(note.priority);
  return (
    <div
      data-testid={`kanban-card-${note.id}`}
      onClick={() => onOpen(note.id)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
        <div className="flex items-start justify-between gap-1.5">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{note.customer_name || "Sem nome"}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid={`kanban-move-${note.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-lg p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {STATUS_ORDER.filter((s) => s !== note.status).map((s) => {
                const cfg = getStatusCfg(s);
                return (
                  <DropdownMenuItem key={s} data-testid={`kanban-move-${note.id}-${s}`} onClick={() => onMove(note, s)}>
                    <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cfg.dot }} /> {cfg.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {note.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{note.description}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={note.category} />
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: pr.bg, color: pr.text }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pr.dot }} />{pr.label}
          </span>
          {note.is_overdue ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              <AlertTriangle className="h-3 w-3" /> {note.waiting_days}d
            </span>
          ) : null}
        </div>
        {note.phone ? (
          <a
            href={`tel:${note.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 flex w-fit items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
          >
            <Phone className="h-3 w-3" /> {note.phone}
          </a>
        ) : null}
    </div>
  );
}

// Vista Kanban dos pedidos — colunas por estado. Sem drag-and-drop (evita
// gestos frágeis em ecrãs táteis); mudar de coluna é feito pelo menu "⋮" de
// cada cartão, que usa o mesmo PATCH /notes/{id}/status de sempre.
export default function PedidoKanban({ items, onOpen, onMove }) {
  return (
    <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-1 sm:px-1">
      {STATUS_ORDER.map((status) => {
        const cfg = getStatusCfg(status);
        const notes = items.filter((n) => n.status === status);
        return (
          <div key={status} data-testid={`kanban-column-${status}`} className="flex w-64 shrink-0 flex-col rounded-2xl bg-slate-50 sm:w-72">
            <div className="flex items-center gap-2 rounded-t-2xl border-b border-slate-200 px-3 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cfg.dot }} />
              <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-600">{cfg.label}</p>
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400">{notes.length}</span>
            </div>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
              {notes.length === 0 ? (
                <p className="p-3 text-center text-[11px] text-slate-300">Sem pedidos</p>
              ) : notes.map((note) => (
                <KanbanCard key={note.id} note={note} onOpen={onOpen} onMove={onMove} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
