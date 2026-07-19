import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Clock, AlarmClockOff, Zap, X } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import api from "@/lib/api";

const KIND_ICON = {
  waiting_supplier: Clock,
  forgotten: AlarmClockOff,
  urgent: Zap,
  reminder_overdue: Bell,
};
const SEV = {
  high: { ring: "border-red-200 bg-red-50", icon: "bg-red-100 text-red-600", dot: "#DC2626" },
  medium: { ring: "border-amber-200 bg-amber-50", icon: "bg-amber-100 text-amber-600", dot: "#D97706" },
  low: { ring: "border-blue-200 bg-blue-50", icon: "bg-blue-100 text-blue-600", dot: "#2563EB" },
};

export default function NotificationsBell({ variant = "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], count: 0 });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setData(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
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
              ? "h-10 w-10 border border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-100 hover:shadow-md"
              : "h-10 w-10 text-slate-600 hover:bg-slate-100"
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
            Alertas {count > 0 ? <span className="text-slate-400">({count})</span> : null}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-2.5">
          {data.items.length === 0 ? (
            <div className="mt-16 flex flex-col items-center text-center text-slate-400">
              <div className="flex h-16 w-16 animate-in items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 zoom-in-50 duration-500">
                <Bell className="h-7 w-7" />
              </div>
              <p className="mt-4 font-heading text-base font-extrabold text-slate-700">Tudo em dia</p>
              <p className="text-sm">Nenhum pedido esquecido ou atrasado.</p>
            </div>
          ) : data.items.map((n) => {
            const Icon = KIND_ICON[n.kind] || Bell;
            const sev = SEV[n.severity] || SEV.low;
            return (
              <button
                key={n.id}
                data-testid={`notification-${n.id}`}
                onClick={() => go(n)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${sev.ring}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sev.icon}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-600">{n.message}</p>
                </div>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
