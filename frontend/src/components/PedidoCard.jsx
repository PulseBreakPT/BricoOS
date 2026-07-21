import { motion } from "framer-motion";
import {
  Star, Ruler, Phone, AlertTriangle, ArrowRight, Tag, MoreVertical, Send,
  PhoneCall, PhoneMissed, CheckCircle2, Copy, ArchiveRestore, Clock, CalendarClock,
  MailCheck, Camera,
} from "lucide-react";
import {
  formatDateTime, getNextActionCta, getPriorityCfg, getStatusCfg, timeAgo,
} from "@/lib/pedido";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CategoryBadge } from "@/components/CategoryBadge";
import QuickPeekTrigger from "@/components/QuickPeek";

// Conteúdo do Quick Peek de um pedido — tudo já vem no objeto da lista
// (sem pedido extra ao servidor): estado, resumo, última alteração e
// próxima ação, para consultar sem abrir a ficha completa.
function PedidoPeekContent({ note, st }) {
  const last = (note.recent_activities || [])[0];
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
        </span>
        {note.is_overdue ? <span className="text-[11px] font-bold text-red-600">Parado há {note.waiting_days}d</span> : null}
      </div>
      {note.description ? <p className="line-clamp-3 text-xs text-slate-600">{note.description}</p> : null}
      {last ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Última alteração</p>
          <p className="mt-0.5 text-xs text-slate-600">{last.message} <span className="text-slate-400">· {timeAgo(last.created_at)}</span></p>
        </div>
      ) : null}
      {note.next_action ? (
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Próxima ação</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-700">{note.next_action}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function PedidoCard({ note, onOpen, actions }) {
  const st = getStatusCfg(note.status);
  const pr = getPriorityCfg(note.priority);
  const archived = note.archived;

  const stop = (fn) => (e) => { e.stopPropagation(); fn(note); };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
      data-testid={`note-card-${note.id}`}
      onClick={() => onOpen(note.id)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 card-elevated card-elevated-hover transition-all duration-200 hover:-translate-y-1 active:scale-[0.99] sm:p-5 ${note.is_overdue ? "border-red-200" : "border-slate-200/90 hover:border-slate-300"}`}
    >
        <div className="flex items-start justify-between gap-2">
          <QuickPeekTrigger as="div" className="min-w-0 flex-1" renderPeek={() => <PedidoPeekContent note={note} st={st} />}>
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-base font-extrabold tracking-tight text-slate-900">{note.customer_name || "Sem nome"}</h3>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: pr.bg, color: pr.text }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pr.dot }} />{pr.label}
              </span>
            </div>
            {note.phone ? (
              <a href={`tel:${note.phone}`} onClick={(e) => e.stopPropagation()} title="Ligar ao cliente" className="mt-0.5 flex w-fit items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-slate-900 hover:underline">
                <Phone className="h-3 w-3" /> {note.phone}
              </a>
            ) : null}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-400">
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {formatDateTime(note.created_at)}</span>
            </p>
          </QuickPeekTrigger>
          <div className="flex shrink-0 items-center">
            <button data-testid={`note-fav-${note.id}`} onClick={stop(actions.toggleFav)} className="rounded-lg p-1 text-slate-300 transition-transform duration-150 hover:scale-125 hover:text-amber-400 active:scale-90">
              <Star key={note.favorite} className={`h-4 w-4 ${note.favorite ? "fill-amber-400 text-amber-400 animate-pop" : ""}`} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid={`note-menu-${note.id}`} onClick={(e) => e.stopPropagation()} className="rounded-lg p-1 text-slate-400 transition-all duration-150 hover:scale-110 hover:bg-slate-100 hover:text-slate-700 active:scale-90">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {note.next_status ? (
                  <DropdownMenuItem data-testid={`menu-advance-${note.id}`} onClick={() => actions.advance(note)}>
                    <ArrowRight className="mr-2 h-4 w-4" /> {getNextActionCta(note)}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem data-testid={`menu-reminder-${note.id}`} onClick={() => actions.sendReminder(note)}>
                  <Send className="mr-2 h-4 w-4" /> Enviar lembrete ao fornecedor
                </DropdownMenuItem>
                <DropdownMenuItem data-testid={`menu-contact-${note.id}`} onClick={() => actions.contactClient(note)}>
                  <PhoneCall className="mr-2 h-4 w-4" /> Contactar cliente
                </DropdownMenuItem>
                <DropdownMenuItem data-testid={`menu-duplicate-${note.id}`} onClick={() => actions.duplicate(note)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicar pedido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {archived ? (
                  <DropdownMenuItem data-testid={`menu-reopen-${note.id}`} onClick={() => actions.reopen(note)}>
                    <ArchiveRestore className="mr-2 h-4 w-4" /> Reabrir pedido
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem data-testid={`menu-resolve-${note.id}`} onClick={() => actions.resolve(note)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como resolvido
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{note.description}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={note.category} />
          {note.measurements ? <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700"><Ruler className="h-3 w-3" /> {note.measurements}</span> : null}
          {note.photo_count > 0 ? <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"><Camera className="h-3 w-3" /> {note.photo_count}</span> : null}
          {(note.labels || []).slice(0, 2).map((l) => <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] font-semibold text-slate-600"><Tag className="h-2.5 w-2.5" /> {l}</span>)}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
          </span>
          {note.is_overdue ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700"><AlertTriangle className="h-3 w-3" /> Parado há {note.waiting_days}d</span> : null}
          {note.days_since_supplier != null && note.status === "aguarda_fornecedor" && !note.is_overdue ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500"><Clock className="h-3 w-3" /> Enviado há {note.days_since_supplier}d</span>
          ) : null}
          {note.pending_client_send ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><MailCheck className="h-3 w-3" /> Pronto p/ enviar</span>
          ) : null}
          {note.client_no_answer_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600"><PhoneMissed className="h-3 w-3" /> Cliente s/ resposta {note.client_no_answer_count}×</span>
          ) : null}
          {note.supplier_no_answer_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600"><PhoneMissed className="h-3 w-3" /> Fornecedor s/ resposta {note.supplier_no_answer_count}×</span>
          ) : null}
        </div>

        {(note.recent_activities || []).length > 0 ? (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Últimas alterações</p>
            <ul className="mt-1.5 space-y-1">
              {note.recent_activities.slice(0, 3).map((a, i) => (
                <li key={i} className="flex items-baseline gap-1.5 text-[11px] text-slate-500">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-slate-300" />
                  <span className="min-w-0 flex-1 truncate">{a.message}</span>
                  <span className="shrink-0 text-slate-400">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {note.next_status && !archived ? (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <p className="min-w-0 flex-1 truncate text-xs text-slate-500"><span className="font-bold text-slate-700">Próximo:</span> {note.next_action}</p>
            <button data-testid={`advance-${note.id}`} onClick={stop(actions.advance)} className="group/cta inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-md active:scale-95">
              {getNextActionCta(note)} <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/cta:translate-x-0.5" />
            </button>
          </div>
        ) : null}
    </motion.div>
  );
}
