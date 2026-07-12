import { motion } from "framer-motion";
import { Star, Ruler, Phone, ChevronRight, AlertTriangle, ArrowRight, Tag } from "lucide-react";
import { getCategory } from "@/lib/categories";
import { getStatusCfg, getPriorityCfg } from "@/lib/pedido";

export default function PedidoCard({ note, onOpen, onToggleFavorite, onAdvance }) {
  const c = getCategory(note.category);
  const st = getStatusCfg(note.status);
  const pr = getPriorityCfg(note.priority);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      data-testid={`note-card-${note.id}`}
      onClick={() => onOpen(note.id)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/60 ${
        note.is_overdue ? "border-red-200" : "border-slate-200"
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: c.accent }} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-base font-bold tracking-tight text-slate-900">
                {note.customer_name || "Sem nome"}
              </h3>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ backgroundColor: pr.bg, color: pr.text }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pr.dot }} />
                {pr.label}
              </span>
            </div>
            {note.phone ? (
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-slate-500">
                <Phone className="h-3 w-3" /> {note.phone}
              </p>
            ) : null}
          </div>
          <button
            data-testid={`note-fav-${note.id}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(note); }}
            className="shrink-0 rounded-lg p-1 text-slate-300 transition-colors hover:text-amber-400"
          >
            <Star className={`h-4 w-4 ${note.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
          </button>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{note.description}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {note.measurements ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
              <Ruler className="h-3 w-3" /> {note.measurements}
            </span>
          ) : null}
          {(note.labels || []).slice(0, 2).map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              <Tag className="h-2.5 w-2.5" /> {l}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ backgroundColor: st.bg, color: st.text }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
            {st.label}
          </span>
          {note.is_overdue ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
              <AlertTriangle className="h-3 w-3" /> Sem resposta há {note.waiting_days}d
            </span>
          ) : null}
        </div>

        {note.next_status ? (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Próximo:</span> {note.next_action}
            </p>
            <button
              data-testid={`advance-${note.id}`}
              onClick={(e) => { e.stopPropagation(); onAdvance(note); }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              {note.next_status_label} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3">
            <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
