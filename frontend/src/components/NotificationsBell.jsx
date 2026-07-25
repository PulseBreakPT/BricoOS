import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Clock, AlarmClockOff, Zap, ShieldAlert, FileDiff, Mail, ClipboardList, AlertTriangle,
  ListChecks, Link as LinkIcon,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import api from "@/lib/api";
import { useNotificationStream } from "@/hooks/useNotificationStream";

const CATEGORY_ICON = {
  waiting_supplier: Clock, deadline_approaching: Clock, forgotten: AlarmClockOff,
  urgent: Zap, task_urgent: Zap, reminder_overdue: Bell, task_reminder: ListChecks,
  tasks_overdue_digest: ListChecks,
  quote_quality_issue: ShieldAlert, processing_error: AlertTriangle,
  quote_changed: FileDiff,
  client_new_note: ClipboardList, supplier: Mail, client: Mail, unmatched: Mail,
  bricoaval_backfill: LinkIcon,
};
const PRIORITY_STYLE = {
  critica: { ring: "border-red-200 bg-[var(--pastel-red-bg)]", icon: "bg-[var(--pastel-red-bg)] text-red-600" },
  alta: { ring: "border-orange-200 bg-[var(--pastel-orange-bg)]", icon: "bg-[var(--pastel-orange-bg)] text-orange-600" },
  media: { ring: "border-amber-200 bg-[var(--pastel-amber-bg)]", icon: "bg-[var(--pastel-amber-bg)] text-amber-600" },
  baixa: { ring: "border-sky-200 bg-[var(--pastel-sky-bg)]", icon: "bg-[var(--pastel-sky-bg)] text-sky-600" },
};

// Acesso rápido às últimas não lidas — o histórico completo, com
// pesquisa/filtros/arquivo/agrupamento, fica no Centro de Operações ("Ver
// todas"); o sino mantém-se um atalho simples, sem lote/expansão.
// Sincronizado em tempo real (SSE + push do próprio service worker), com
// o poll de 45s como reserva para quando a ligação em tempo real falhar.
export default function NotificationsBell({ variant = "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const navigate = useNavigate();
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    // Sem isto, um poll fora de ordem (ex.: uma chamada disparada ao abrir
    // o painel, mais lenta que o poll seguinte) podia repor a contagem
    // para um valor já ultrapassado.
    const seq = ++loadSeq.current;
    try {
      const [countRes, listRes] = await Promise.all([
        api.get("/notifications/unread-count"),
        api.get("/notifications", { params: { status: "new", limit: 8 } }),
      ]);
      if (seq !== loadSeq.current) return;
      setCount(countRes.data.count || 0);
      setItems(listRes.data.items || []);
    } catch { /* ignore — poll de fundo, uma falha isolada não merece alarido */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 45000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useNotificationStream(() => load());

  const go = async (n) => {
    setOpen(false);
    try { await api.post(`/notifications/${n.id}/read`); } catch { /* segue mesmo assim */ }
    setItems((list) => list.filter((x) => x.id !== n.id));
    setCount((c) => Math.max(0, c - 1));
    navigate(n.url || "/");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          data-testid="notifications-bell"
          className={`group relative flex items-center justify-center rounded-xl transition-all duration-200 active:scale-90 ${
            variant === "sidebar"
              ? "h-9 w-9 text-[color:var(--chrome-muted)] hover:bg-neutral-900/[0.06] hover:text-neutral-900"
              : "h-10 w-10 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Bell className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110 ${count > 0 ? "animate-shake" : ""}`} strokeWidth={2.2} />
          {count > 0 ? (
            <span key={count} data-testid="notifications-count" className="absolute -right-1 -top-1 flex h-5 min-w-[20px] animate-pop items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </SheetTrigger>
      <SheetContent data-testid="notifications-panel" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-xl font-bold tracking-tight">
            Notificações {count > 0 ? <span className="text-muted-foreground">({count})</span> : null}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 flex-1 space-y-2.5 overflow-y-auto">
          {items.length === 0 ? (
            <Empty className="mt-16 text-muted-foreground">
              <EmptyMedia>
                <div className="flex h-16 w-16 animate-in items-center justify-center rounded-2xl bg-[var(--pastel-emerald-bg)] text-emerald-500 zoom-in-50 duration-500">
                  <Bell className="h-7 w-7" />
                </div>
              </EmptyMedia>
              <EmptyHeader className="gap-1">
                <EmptyTitle className="font-heading font-extrabold text-foreground">Tudo em dia</EmptyTitle>
                <EmptyDescription className="text-sm text-muted-foreground">Sem notificações por ler.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : items.map((n) => {
            const Icon = CATEGORY_ICON[n.category] || Bell;
            const style = PRIORITY_STYLE[n.priority] || PRIORITY_STYLE.media;
            return (
              <Item
                key={n.id}
                asChild
                size="sm"
                className={`items-start rounded-xl border p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${style.ring}`}
              >
                <button data-testid={`notification-${n.id}`} onClick={() => go(n)}>
                  <ItemMedia variant="icon" className={`size-9 rounded-lg ${style.icon}`}>
                    <Icon className="h-4 w-4" />
                  </ItemMedia>
                  <ItemContent className="gap-0">
                    <div className="flex items-center gap-1.5">
                      <ItemTitle className="truncate text-sm text-foreground">{n.title}</ItemTitle>
                      {n.computed_priority === "critica" ? (
                        <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">URGENTE</span>
                      ) : null}
                      {(n.occurrence_count || 1) > 1 ? (
                        <span className="shrink-0 rounded-full bg-amber-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">ATUALIZADA</span>
                      ) : null}
                    </div>
                    <ItemDescription className="line-clamp-none text-xs text-muted-foreground">{n.body}</ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            );
          })}
        </div>
        <button
          type="button"
          data-testid="notifications-view-all"
          onClick={() => { setOpen(false); navigate("/notificacoes"); }}
          className="mt-3 shrink-0 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent"
        >
          Ver todas
        </button>
      </SheetContent>
    </Sheet>
  );
}
