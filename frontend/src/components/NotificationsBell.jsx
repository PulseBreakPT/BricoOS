import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Clock, AlarmClockOff, Zap, X } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import api from "@/lib/api";

const KIND_ICON = {
  waiting_supplier: Clock,
  forgotten: AlarmClockOff,
  urgent: Zap,
  reminder_overdue: Bell,
};
const SEV = {
  high: { ring: "border-red-200 bg-[var(--pastel-red-bg)]", icon: "bg-[var(--pastel-red-bg)] text-red-600", dot: "#DC2626" },
  medium: { ring: "border-amber-200 bg-[var(--pastel-amber-bg)]", icon: "bg-[var(--pastel-amber-bg)] text-amber-600", dot: "#D97706" },
  low: { ring: "border-blue-200 bg-[var(--pastel-blue-bg)]", icon: "bg-[var(--pastel-blue-bg)] text-blue-600", dot: "#2563EB" },
};

export default function NotificationsBell({ variant = "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], count: 0 });
  const navigate = useNavigate();
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    // Sem isto, um poll de 60 em 60s que respondesse fora de ordem (ex.: uma
    // chamada disparada ao abrir o painel, mais lenta que o poll seguinte)
    // podia repor a contagem para um valor já ultrapassado.
    const seq = ++loadSeq.current;
    try {
      const { data } = await api.get("/notifications");
      if (seq === loadSeq.current) setData(data);
    } catch { /* ignore — poll de fundo, uma falha isolada não merece alarido */ }
  }, []);

  useEffect(() => {
    load();
    // Só vale a pena verificar com a aba visível — poupa pedidos quando a
    // app fica horas ao fundo numa aba esquecida.
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const go = (n) => {
    setOpen(false);
    if (n.note_id) navigate(`/?open=${n.note_id}`);
    else navigate("/tarefas");
  };

  const count = data.count || 0;

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
      <SheetContent data-testid="notifications-panel" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-xl font-bold tracking-tight">
            Alertas {count > 0 ? <span className="text-muted-foreground">({count})</span> : null}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-2.5">
          {data.items.length === 0 ? (
            <Empty className="mt-16 text-muted-foreground">
              <EmptyMedia>
                <div className="flex h-16 w-16 animate-in items-center justify-center rounded-2xl bg-[var(--pastel-emerald-bg)] text-emerald-500 zoom-in-50 duration-500">
                  <Bell className="h-7 w-7" />
                </div>
              </EmptyMedia>
              <EmptyHeader className="gap-1">
                <EmptyTitle className="font-heading font-extrabold text-foreground">Tudo em dia</EmptyTitle>
                <EmptyDescription className="text-sm text-muted-foreground">Nenhum pedido esquecido ou atrasado.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : data.items.map((n) => {
            const Icon = KIND_ICON[n.kind] || Bell;
            const sev = SEV[n.severity] || SEV.low;
            return (
              <Item
                key={n.id}
                asChild
                size="sm"
                className={`items-start rounded-xl border p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${sev.ring}`}
              >
                <button data-testid={`notification-${n.id}`} onClick={() => go(n)}>
                  <ItemMedia variant="icon" className={`size-9 rounded-lg ${sev.icon}`}>
                    <Icon className="h-4 w-4" />
                  </ItemMedia>
                  <ItemContent className="gap-0">
                    <ItemTitle className="truncate text-sm text-foreground">{n.title}</ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs text-muted-foreground">{n.message}</ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
