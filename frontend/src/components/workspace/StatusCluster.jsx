import { useEffect, useState } from "react";
import { Mail, ClipboardList, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import api from "@/lib/api";
import { isOverdue, isToday } from "@/lib/taskMeta";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { timeAgo } from "@/lib/pedido";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// Mini-calendário do mês atual desenhado à mão (sem dependências): hoje em
// destaque e um ponto vermelho nos dias com tarefas por fazer.
function MonthGrid({ now, dueDays }) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div className="px-1">
      <div className="grid grid-cols-7 text-center">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span
            key={`wd-${i}`}
            className="py-1 text-[8px] font-black uppercase text-neutral-400"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((day, i) =>
          day === null ? (
            <span key={`empty-${i}`} />
          ) : (
            <span
              key={`day-${day}`}
              className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-lg font-mono text-[10px] font-bold tabular-nums ${day === now.getDate() ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600"}`}
            >
              {day}
              {dueDays.has(day) && day !== now.getDate() ? (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-red-500" />
              ) : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// Relógio da barra global vira um verdadeiro widget de SO: clicar abre o
// calendário do mês com a agenda de tarefas do dia.
function ClockAgenda({ now }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [allTasks, setAllTasks] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    api
      .get("/tasks")
      .then(({ data }) => {
        if (alive) setAllTasks((data || []).filter((t) => !t.done));
      })
      .catch(() => {
        if (alive) setAllTasks([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const todayTasks = (allTasks || [])
    .filter((t) => isToday(t.due_date) || isOverdue(t.due_date, t.done))
    .slice(0, 5);
  const dueDays = new Set(
    (allTasks || [])
      .map((t) => {
        if (!t.due_date) return null;
        const d = new Date(t.due_date);
        return d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
          ? d.getDate()
          : null;
      })
      .filter(Boolean),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="menubar-clock"
          className="whitespace-nowrap rounded-lg px-1.5 py-1 text-right font-mono text-[11px] font-extrabold tabular-nums text-neutral-900 transition-colors hover:bg-neutral-900/[0.06]"
          title="Calendário e agenda do dia"
        >
          {now.toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-72 rounded-2xl p-0"
        data-testid="clock-agenda"
      >
        <div className="border-b border-border px-4 pb-3 pt-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            {now.toLocaleDateString("pt-PT", { weekday: "long" })}
          </p>
          <p className="mt-1 font-heading text-xl font-extrabold capitalize tracking-tight text-foreground">
            {now.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="px-3 py-3">
          <MonthGrid now={now} dueDays={dueDays} />
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Agenda de hoje
          </p>
          {allTasks == null ? (
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              A carregar…
            </p>
          ) : todayTasks.length === 0 ? (
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              Sem tarefas com prazo para hoje.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {todayTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOverdue(t.due_date, t.done) ? "bg-red-500" : "bg-emerald-500"}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-foreground">
                    {t.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            data-testid="clock-agenda-open-tasks"
            onClick={() => {
              setOpen(false);
              navigate("/tarefas");
            }}
            className="mt-3 flex w-full items-center justify-center rounded-xl border border-border bg-muted px-3 py-2 text-[10px] font-extrabold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Abrir Tarefas
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Barra de estado ao estilo de um SO, no rodapé da sidebar: ligação,
// contadores em tempo real e há quanto tempo a caixa de entrada foi
// verificada — sempre visível, sem abrir nada.
export default function StatusCluster({ variant = "sidebar" }) {
  const { status, online } = useSystemStatus();
  const now = useClock();

  if (variant === "menubar") {
    return (
      <div
        data-testid="system-status"
        className="flex min-w-0 items-center gap-2.5 text-[10px] font-bold text-neutral-500"
      >
        <span
          className="flex items-center gap-1.5"
          title={online ? "Ligado ao servidor" : "Sem ligação ao servidor"}
        >
          <span className={`led ${online ? "led-ok" : "led-alert"}`} />
          <span className="hidden 2xl:inline">
            {online ? "Ligado" : "Sem ligação"}
          </span>
        </span>
        {status ? (
          <span
            className="hidden items-center gap-1.5 font-mono tabular-nums xl:flex"
            title={`${status.emails_nao_vistos} emails por ver · ${status.pedidos_ativos} pedidos ativos`}
          >
            <Mail className="h-3 w-3" /> {status.emails_nao_vistos}
            <span className="text-neutral-300">·</span>
            <ClipboardList className="h-3 w-3" /> {status.pedidos_ativos}
          </span>
        ) : null}
        <ClockAgenda now={now} />
      </div>
    );
  }

  if (variant === "desktop") {
    return (
      <div
        data-testid="desktop-status"
        className="rounded-2xl border border-neutral-900/[0.08] bg-white/70 p-4 text-neutral-900 shadow-[0_24px_60px_-28px_rgba(16,17,20,0.4)] backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="font-heading text-3xl font-extrabold tracking-tight tabular-nums">
              {now.toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold capitalize text-neutral-500">
              {now.toLocaleDateString("pt-PT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-neutral-900/10 bg-neutral-900/[0.04] px-2 py-1 text-[10px] font-bold text-neutral-600">
            <span className={`led ${online ? "led-ok" : "led-alert"}`} />{" "}
            {online ? "Sistema online" : "Sem ligação"}
          </span>
        </div>
        {status ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-neutral-900/[0.04] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <ClipboardList className="h-3 w-3" /> Pedidos
              </div>
              <p className="mt-1 font-mono text-xl font-black tabular-nums">
                {status.pedidos_ativos}
              </p>
            </div>
            <div className="rounded-xl bg-neutral-900/[0.04] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                <Mail className="h-3 w-3" /> Por ver
              </div>
              <p className="mt-1 font-mono text-xl font-black tabular-nums">
                {status.emails_nao_vistos}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="sidebar-status"
      className="relative flex flex-col gap-2 text-[11px] font-semibold text-[color:var(--chrome-muted)]"
    >
      <div className="flex items-center justify-between">
        <span
          data-testid="sidebar-clock"
          className="font-mono tabular-nums text-neutral-900"
          title={now.toLocaleDateString("pt-PT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        >
          {now.toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          className="flex items-center gap-1.5"
          title={online ? "Ligado ao servidor" : "Sem ligação ao servidor"}
        >
          <span className={`led ${online ? "led-ok" : "led-alert"}`} />
          {online ? "Ligado" : "Sem ligação"}
        </span>
      </div>
      {status ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1" title="Emails por ver">
            <Mail className="h-3.5 w-3.5" /> {status.emails_nao_vistos}
          </span>
          <span className="flex items-center gap-1" title="Pedidos ativos">
            <ClipboardList className="h-3.5 w-3.5" /> {status.pedidos_ativos}
          </span>
          {status.last_sync ? (
            <span
              className="flex items-center gap-1"
              title="Última verificação da caixa de entrada"
            >
              <RefreshCw className="h-3 w-3" /> {timeAgo(status.last_sync)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
