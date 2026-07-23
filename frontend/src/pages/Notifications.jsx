import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import api, { getErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { useNotificationStream } from "@/hooks/useNotificationStream";

const PRIORITY_STYLE = {
  critica: { label: "Crítica", ring: "border-red-200 bg-[var(--pastel-red-bg)]", dot: "bg-red-600" },
  alta: { label: "Alta", ring: "border-orange-200 bg-[var(--pastel-orange-bg)]", dot: "bg-orange-500" },
  media: { label: "Média", ring: "border-amber-200 bg-[var(--pastel-amber-bg)]", dot: "bg-amber-500" },
  baixa: { label: "Baixa", ring: "border-sky-200 bg-[var(--pastel-sky-bg)]", dot: "bg-sky-500" },
};

const STATUS_OPTIONS = [
  { key: "unread", label: "Não lidas" },
  { key: "read", label: "Lidas" },
  { key: "archived", label: "Arquivadas" },
  { key: "", label: "Todas" },
];

const PAGE_SIZE = 30;

function NotificationRow({ n, selected, onSelect, onMarkRead, onArchive, onOpen }) {
  const style = PRIORITY_STYLE[n.priority] || PRIORITY_STYLE.media;
  return (
    <div
      data-testid={`notification-row-${n.id}`}
      className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${style.ring} ${n.status === "unread" ? "" : "opacity-60"}`}
    >
      <Checkbox className="mt-1.5 shrink-0" checked={selected} onCheckedChange={() => onSelect(n.id)} />
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(n)} className="block w-full text-left">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{n.title}</p>
            <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{timeAgo(n.created_at)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
        </button>
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground">
            {style.label}
          </span>
          {n.status === "unread" ? (
            <button type="button" onClick={() => onMarkRead(n.id)} className="text-[10px] font-bold text-foreground hover:underline">
              Marcar como lida
            </button>
          ) : null}
          {n.status !== "archived" ? (
            <button type="button" onClick={() => onArchive(n.id)} className="text-[10px] font-bold text-muted-foreground hover:underline">
              Arquivar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Centro de Notificações — histórico permanente (db.notifications), ao
// contrário do sino (NotificationsBell), que só mostra as últimas não
// lidas. Sincronizado em tempo real (useNotificationStream) — uma
// notificação nova, ou lida/arquivada noutro dispositivo, aparece aqui de
// imediato, sem precisar de recarregar.
export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState("unread");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async (opts = {}) => {
    const { before, append } = opts;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = { limit: PAGE_SIZE };
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (q.trim()) params.q = q.trim();
      if (before) params.before = before;
      const { data } = await api.get("/notifications", { params });
      setItems((list) => (append ? [...list, ...data.items] : data.items));
      setHasMore(data.items.length === PAGE_SIZE);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar notificações"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status, priority, q]);

  useEffect(() => {
    setSelected(new Set());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, q]);

  // Sincronização em tempo real (SSE) — qualquer alteração, neste ou
  // noutro dispositivo, recarrega a primeira página.
  useNotificationStream(() => load());

  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markRead = async (id) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, status: "read" } : n)));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível marcar como lida"));
    }
  };

  const archiveOne = async (id) => {
    setItems((list) => list.filter((n) => n.id !== id));
    try {
      await api.post(`/notifications/${id}/archive`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível arquivar"));
    }
  };

  const markSelectedRead = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, status: "read" } : n)));
    setSelected(new Set());
    try {
      await api.post("/notifications/mark-read", { ids });
      toast.success(`${ids.length} notificação(ões) marcada(s) como lida(s)`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível marcar como lidas"));
    }
  };

  const openNotification = (n) => {
    if (n.status === "unread") markRead(n.id);
    if (n.url) navigate(n.url);
  };

  return (
    <div className="pb-4">
      <div className="flex flex-col gap-1">
        <p className="kicker">Sistema</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Notificações
        </h1>
        <p className="text-sm text-muted-foreground">Histórico completo, com pesquisa e filtros — nada desaparece sozinho.</p>
      </div>

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
        <NativeSelect size="sm" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          {STATUS_OPTIONS.map((o) => (
            <NativeSelectOption key={o.key} value={o.key}>{o.label}</NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect size="sm" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-auto">
          <NativeSelectOption value="">Todas as prioridades</NativeSelectOption>
          {Object.entries(PRIORITY_STYLE).map(([key, s]) => (
            <NativeSelectOption key={key} value={key}>{s.label}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {selected.size > 0 ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-2">
          <span className="text-xs font-bold text-foreground">{selected.size} selecionada(s)</span>
          <button
            type="button"
            onClick={markSelectedRead}
            className="rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90"
          >
            Marcar como lidas
          </button>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Sem notificações.</div>
        ) : (
          items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              selected={selected.has(n.id)}
              onSelect={toggleSelect}
              onMarkRead={markRead}
              onArchive={archiveOne}
              onOpen={openNotification}
            />
          ))
        )}
      </div>

      {hasMore && items.length > 0 ? (
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
    </div>
  );
}
