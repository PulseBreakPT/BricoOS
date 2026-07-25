import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, Pin, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import api, { getErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { useNotificationsSummary } from "@/context/NotificationsContext";
import {
  ACTION_ICONS, ACTION_LABELS, getSecondaryActions, runNotificationAction, SNOOZE_PRESETS,
} from "@/lib/notificationActions";

const PRIORITY_STYLE = {
  critica: { label: "Crítica", ring: "border-red-200 bg-[var(--pastel-red-bg)]", dot: "bg-red-600" },
  alta: { label: "Alta", ring: "border-orange-200 bg-[var(--pastel-orange-bg)]", dot: "bg-orange-500" },
  media: { label: "Média", ring: "border-amber-200 bg-[var(--pastel-amber-bg)]", dot: "bg-amber-500" },
  baixa: { label: "Baixa", ring: "border-sky-200 bg-[var(--pastel-sky-bg)]", dot: "bg-sky-500" },
};

// Estados do ciclo de vida (§4) — em pills, não dropdowns (§14).
const STATUS_PILLS = [
  { key: "new", label: "Novas" },
  { key: "seen", label: "Vistas" },
  { key: "tracking", label: "Em acompanhamento" },
  { key: "snoozed", label: "Adiadas" },
  { key: "resolved", label: "Resolvidas" },
  { key: "archived", label: "Arquivadas" },
  { key: "", label: "Todas" },
];

const TIMELINE_LABELS = {
  created: "Criada", updated: "Atualizada", reopened: "Reaberta", read: "Vista",
  tracking: "Em acompanhamento", untracked: "Deixou de ser acompanhada", snoozed: "Adiada",
  woke: "Reativada", resolved_auto: "Resolvida automaticamente", resolved_manual: "Resolvida manualmente",
  pinned: "Fixada", unpinned: "Desafixada", archived: "Arquivada", expired: "Expirou",
  sent: "Entregue ao dispositivo", send_attempt: "Tentativa de entrega", delivered: "Confirmada no dispositivo",
};

const PAGE_SIZE = 30;

function pillClass(active) {
  return `shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${active
    ? "bg-foreground text-background shadow-md shadow-slate-400/40"
    : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:border-input hover:shadow-md"}`;
}

function NotificationBadges({ n }) {
  const badges = [];
  if (n.status === "new" && (n.occurrence_count || 1) <= 1) badges.push({ key: "nova", label: "NOVA", cls: "bg-foreground text-background" });
  if (n.status === "new" && (n.occurrence_count || 1) > 1) badges.push({ key: "atualizada", label: "ATUALIZADA", cls: "bg-warning text-warning-foreground" });
  if (n.computed_priority === "critica") badges.push({ key: "urgente", label: "URGENTE", cls: "bg-destructive text-destructive-foreground" });
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {badges.map((b) => (
        <span key={b.key} className={`rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${b.cls}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function ContextPanel({ notificationId, navigate }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/notifications/${notificationId}/context`).then(({ data }) => {
      if (alive) setCtx(data);
    }).catch(() => {
      if (alive) setCtx(null);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [notificationId]);

  if (loading) return <div className="p-3 text-center text-xs text-muted-foreground">A carregar contexto…</div>;
  if (!ctx) return <div className="p-3 text-center text-xs text-muted-foreground">Não foi possível carregar o contexto.</div>;

  const { notification: n, note, task, supplier_name, assignee_name, last_email, last_pdf,
    bricoaval, relations, related_notifications, timeline } = ctx;

  return (
    <div className="space-y-3 border-t border-border/70 p-3.5 pt-3">
      {n.reason ? (
        <div className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
          <span className="font-bold text-foreground">Motivo: </span>{n.reason}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        {note ? <span className="rounded-full border border-border px-2 py-1">{note.customer_name || "Pedido"} · {note.status_label}</span> : null}
        {supplier_name ? <span className="rounded-full border border-border px-2 py-1">Fornecedor: {supplier_name}</span> : null}
        {bricoaval ? <span className="rounded-full border border-border px-2 py-1">BricoAval {bricoaval.number}</span> : null}
        {assignee_name ? <span className="rounded-full border border-border px-2 py-1">Responsável: {assignee_name}</span> : null}
        {last_email ? <span className="rounded-full border border-border px-2 py-1">Último email: {timeAgo(last_email.sent_at || last_email.received_at)}</span> : null}
        {last_pdf ? <span className="rounded-full border border-border px-2 py-1">Último PDF: {last_pdf.filename}</span> : null}
      </div>

      {note ? (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-muted-foreground">
          {note.is_overdue ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Atrasado</span> : null}
          {note.waiting_on && note.waiting_on !== "none" ? (
            <span className="rounded-full bg-muted px-2 py-1">À espera de {note.waiting_on === "supplier" ? "fornecedor" : note.waiting_on === "client" ? "cliente" : "mim"}</span>
          ) : null}
          {note.needs_callback ? <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">Recontacto pendente</span> : null}
          {(note.measurement_warnings || []).length ? <span className="rounded-full bg-warning-bg px-2 py-1 text-warning">Medidas a confirmar</span> : null}
        </div>
      ) : null}

      {relations?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {relations.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              type="button"
              onClick={() => navigate(r.url)}
              className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold text-foreground hover:bg-accent"
            >
              <ExternalLink className="h-2.5 w-2.5" /> {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {related_notifications?.length ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Notificações relacionadas</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {related_notifications.map((r) => (
              <span key={r.id} className="rounded-full border border-dashed border-border px-2 py-1 text-[10px] font-bold text-muted-foreground">
                {r.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {timeline?.length ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Linha temporal</p>
          <div className="mt-1.5 space-y-1.5 border-l-2 border-border pl-3">
            {timeline.filter((e) => TIMELINE_LABELS[e.event]).map((e, i) => (
              <div key={i} className="text-[10px] text-muted-foreground">
                <span className="font-bold text-foreground">{TIMELINE_LABELS[e.event] || e.event}</span>
                {" · "}{timeAgo(e.at)}
                {e.detail ? ` · ${e.detail}` : ""}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationGroup({
  items, selectedSet, onSelect, expandedId, onToggleExpand, onPrimaryAction, onSecondaryAction, navigate,
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
            <span className="text-xs font-bold text-foreground">{items.length} notificações relacionadas</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 border-t border-border/70 p-2">
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              selected={selectedSet.has(n.id)}
              onSelect={onSelect}
              expanded={expandedId === n.id}
              onToggleExpand={onToggleExpand}
              onPrimaryAction={onPrimaryAction}
              onSecondaryAction={onSecondaryAction}
              navigate={navigate}
            />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function NotificationRow({
  n, selected, onSelect, expanded, onToggleExpand, onPrimaryAction, onSecondaryAction, navigate,
}) {
  const style = PRIORITY_STYLE[n.computed_priority || n.priority] || PRIORITY_STYLE.media;
  const outOfSight = n.status !== "new" && n.status !== "seen" && n.status !== "tracking";
  const nba = n.next_best_action || { type: "open", label: "Abrir", url: n.url };
  const NbaIcon = ACTION_ICONS[nba.type] || ACTION_ICONS.open;

  return (
    <div
      data-testid={`notification-row-${n.id}`}
      className={`rounded-xl border transition-all ${style.ring} ${outOfSight ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3 p-3">
        <Checkbox className="mt-1.5 shrink-0" checked={selected} onCheckedChange={() => onSelect(n.id)} />
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onToggleExpand(n.id)} className="block w-full text-left">
            <div className="flex items-center gap-2">
              {n.pinned ? <Pin className="h-3 w-3 shrink-0 text-foreground" /> : null}
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{n.title}</p>
              <span className="shrink-0 text-meta text-text-tertiary">{timeAgo(n.created_at)}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-text-body">{n.body}</p>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <NotificationBadges n={n} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground">
              {style.label}
            </span>
            <button
              type="button"
              data-testid={`notification-primary-${n.id}`}
              onClick={() => onPrimaryAction(n)}
              className="flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold text-background hover:opacity-90"
            >
              <NbaIcon className="h-3 w-3" /> {nba.label}
            </button>
            {getSecondaryActions(n).map((key) => {
              const Icon = ACTION_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  title={ACTION_LABELS[key]}
                  onClick={() => onSecondaryAction(n, key)}
                  className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent"
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {expanded ? <ContextPanel notificationId={n.id} navigate={navigate} /> : null}
    </div>
  );
}

// Centro de Operações — histórico permanente e acionável (db.notifications):
// cada notificação representa uma situação viva, não só um evento — pode
// evoluir, resolver-se sozinha, ser adiada, fixada ou acompanhada.
// Sincronizado em tempo real (useNotificationStream).
export default function Notifications() {
  const navigate = useNavigate();
  const { summary, refresh: refreshSummary } = useNotificationsSummary();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("new");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [snoozeTarget, setSnoozeTarget] = useState(null); // { ids: [...] } | null
  const [snoozeCustom, setSnoozeCustom] = useState("");

  const load = useCallback(async (opts = {}) => {
    const { before, append } = opts;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, sort: "impact" };
      if (status) params.status = status;
      if (pinnedOnly) params.pinned_only = true;
      if (q.trim()) params.q = q.trim();
      if (before) params.before = before;
      const { data } = await api.get("/notifications", { params });
      setItems((list) => (append ? [...list, ...data.items] : data.items));
      setHasMore(data.items.length === PAGE_SIZE);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar o Centro de Operações"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status, pinnedOnly, q]);

  useEffect(() => {
    setSelected(new Set());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pinnedOnly, q]);

  useNotificationStream(() => { load(); refreshSummary(); });

  const displayItems = useMemo(
    () => (urgentOnly ? items.filter((n) => n.computed_priority === "critica") : items),
    [items, urgentOnly],
  );

  // Agrupamento (§2, §21) — por group_id (note_id/task_id), computado pelo
  // backend; grupos de 1 renderizam a linha diretamente, sem cabeçalho.
  const groups = useMemo(() => {
    const byGroup = new Map();
    const order = [];
    for (const n of displayItems) {
      const key = n.group_id || `solo-${n.id}`;
      if (!byGroup.has(key)) {
        byGroup.set(key, []);
        order.push(key);
      }
      byGroup.get(key).push(n);
    }
    return order.map((key) => ({ key, items: byGroup.get(key) }));
  }, [displayItems]);

  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const reloadAfterAction = () => { load(); refreshSummary(); };

  const handlePrimaryAction = async (n) => {
    const type = n.next_best_action?.type || "open";
    try {
      if (type === "open") {
        await runNotificationAction(n, "open");
        if (n.next_best_action?.url) navigate(n.next_best_action.url);
      } else if (type === "complete_task") {
        await runNotificationAction(n, "complete_task");
        toast.success("Tarefa concluída");
      } else {
        await runNotificationAction(n, type);
      }
      reloadAfterAction();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível concluir a ação"));
    }
  };

  const handleSecondaryAction = async (n, key) => {
    if (key === "snooze") { setSnoozeTarget({ ids: [n.id] }); return; }
    try {
      await runNotificationAction(n, key);
      reloadAfterAction();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível concluir a ação"));
    }
  };

  const confirmSnooze = async (untilDate) => {
    if (!snoozeTarget || !untilDate) return;
    try {
      const until = untilDate.toISOString ? untilDate.toISOString() : new Date(untilDate).toISOString();
      if (snoozeTarget.ids.length === 1) {
        await api.post(`/notifications/${snoozeTarget.ids[0]}/snooze`, { until });
      } else {
        await api.post("/notifications/bulk/snooze", { ids: snoozeTarget.ids, until });
      }
      toast.success("Notificação(ões) adiada(s)");
      setSnoozeTarget(null);
      setSnoozeCustom("");
      setSelected(new Set());
      reloadAfterAction();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível adiar"));
    }
  };

  const bulkAction = async (endpoint, extra = {}) => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      await api.post(endpoint, { ids, ...extra });
      setSelected(new Set());
      reloadAfterAction();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível concluir a operação em lote"));
    }
  };

  return (
    <div className="pb-4">
      <div className="flex flex-col gap-1">
        <p className="kicker">Sistema</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Centro de Operações
        </h1>
      </div>

      {summary ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-meta text-text-tertiary">
          <span>{summary.by_status?.new || 0} novas</span>
          <span>{summary.by_priority?.critica || 0} críticas ativas</span>
          <span>{summary.pinned_count || 0} fixadas</span>
          <span>{summary.created_today || 0} criadas hoje</span>
          <span>{summary.resolved_today || 0} resolvidas hoje</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="notifications-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {STATUS_PILLS.map((p) => (
          <button key={p.key} data-testid={`notif-status-${p.key || "all"}`} onClick={() => setStatus(p.key)} className={pillClass(status === p.key)}>
            {p.label}
          </button>
        ))}
        <button data-testid="notif-filter-pinned" onClick={() => setPinnedOnly((v) => !v)} className={pillClass(pinnedOnly)}>
          Fixadas
        </button>
        <button data-testid="notif-filter-urgent" onClick={() => setUrgentOnly((v) => !v)} className={pillClass(urgentOnly)}>
          Urgentes agora
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
          <span className="text-xs font-bold text-foreground">{selected.size} selecionada(s)</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => bulkAction("/notifications/mark-read")} className="rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background hover:opacity-90">
              Marcar como lidas
            </button>
            <button type="button" onClick={() => bulkAction("/notifications/bulk/resolve")} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent">
              Resolver
            </button>
            <button type="button" onClick={() => bulkAction("/notifications/bulk/pin", { pinned: true })} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent">
              Fixar
            </button>
            <button type="button" onClick={() => setSnoozeTarget({ ids: [...selected] })} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent">
              Adiar
            </button>
            <button type="button" onClick={() => bulkAction("/notifications/bulk/archive")} className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent">
              Arquivar
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sem notificações.</div>
        ) : (
          groups.map((g) => {
            if (g.items.length === 1) {
              const n = g.items[0];
              return (
                <NotificationRow
                  key={n.id}
                  n={n}
                  selected={selected.has(n.id)}
                  onSelect={toggleSelect}
                  expanded={expandedId === n.id}
                  onToggleExpand={toggleExpand}
                  onPrimaryAction={handlePrimaryAction}
                  onSecondaryAction={handleSecondaryAction}
                  navigate={navigate}
                />
              );
            }
            return (
              <NotificationGroup
                key={g.key}
                items={g.items}
                selectedSet={selected}
                onSelect={toggleSelect}
                expandedId={expandedId}
                onToggleExpand={toggleExpand}
                onPrimaryAction={handlePrimaryAction}
                onSecondaryAction={handleSecondaryAction}
                navigate={navigate}
              />
            );
          })
        )}
      </div>

      {hasMore && displayItems.length > 0 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => load({ before: items[items.length - 1]?.created_at, append: true })}
            className="rounded-xl border border-border bg-muted px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loadingMore ? "A carregar…" : "Carregar mais"}
          </button>
        </div>
      ) : null}

      <Dialog open={!!snoozeTarget} onOpenChange={(v) => { if (!v) { setSnoozeTarget(null); setSnoozeCustom(""); } }}>
        <DialogContent data-testid="notif-snooze-dialog" className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold tracking-tight">Adiar notificação</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {SNOOZE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                data-testid={`notif-snooze-preset-${p.key}`}
                onClick={() => confirmSnooze(p.getDate())}
                className="block w-full rounded-xl border border-border px-3 py-2 text-left text-sm font-bold text-foreground hover:bg-accent"
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="datetime-local"
                data-testid="notif-snooze-custom-input"
                value={snoozeCustom}
                onChange={(e) => setSnoozeCustom(e.target.value)}
                className="h-9 flex-1"
              />
              <Button data-testid="notif-snooze-custom-confirm" disabled={!snoozeCustom} onClick={() => confirmSnooze(new Date(snoozeCustom))}>
                Adiar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
