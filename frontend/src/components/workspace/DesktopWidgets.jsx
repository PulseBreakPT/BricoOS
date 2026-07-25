import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Mail,
} from "lucide-react";
import api from "@/lib/api";
import { isOverdue, isToday, getTaskPriority } from "@/lib/taskMeta";
import { timeAgo } from "@/lib/pedido";
import { useSystemStatus } from "@/context/SystemStatusContext";

function greetingFor(hour) {
  if (hour < 12) return "Bom dia";
  if (hour < 20) return "Boa tarde";
  return "Boa noite";
}

function Widget({ title, icon: Icon, count, children, onOpen, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onOpen}
      className="os-desktop-widget group flex min-w-0 flex-col rounded-[22px] border border-neutral-900/[0.08] bg-white/70 p-4 text-left shadow-[0_24px_60px_-28px_rgba(16,17,20,0.35)] backdrop-blur-2xl transition-all duration-200 hover:-translate-y-1 hover:border-neutral-900/[0.16] hover:bg-white/85 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-neutral-400">
          <Icon className="h-3.5 w-3.5" /> {title}
        </span>
        <span className="flex items-center gap-1.5">
          {count != null ? (
            <span className="font-mono text-[11px] font-black tabular-nums text-neutral-900">
              {count}
            </span>
          ) : null}
          <ArrowUpRight className="h-3.5 w-3.5 text-neutral-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neutral-600" />
        </span>
      </div>
      <div className="mt-3 min-h-[74px] flex-1">{children}</div>
    </button>
  );
}

function EmptyLine({ children }) {
  return (
    <p className="pt-2 text-[11px] font-semibold text-neutral-400">{children}</p>
  );
}

// Widgets do ambiente de trabalho — a secretária deixa de ser um espaço
// vazio e passa a mostrar o pulso real da loja (tarefas do dia, pedidos em
// aberto e correio por ver), como os widgets de um SO moderno.
const DEFAULT_LIMITS = { agenda_limit: 4, pedidos_limit: 3, correio_limit: 3 };

export default function DesktopWidgets({ onOpenRoute }) {
  const { status } = useSystemStatus();
  const [tasks, setTasks] = useState(null);
  const [notes, setNotes] = useState(null);
  const [mail, setMail] = useState(null);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const now = new Date();

  // Quantas linhas cada widget mostra — configurável em definições →
  // Resumo no ambiente de trabalho, em vez de um .slice(N) fixo.
  useEffect(() => {
    let alive = true;
    api.get("/settings/desktop_widget_limits")
      .then(({ data }) => { if (alive) setLimits(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [t, n, m] = await Promise.allSettled([
        api.get("/tasks"),
        api.get("/notes"),
        api.get("/emails/unseen"),
      ]);
      if (!alive) return;
      if (t.status === "fulfilled") {
        const list = (t.value.data || []).filter(
          (task) =>
            !task.done &&
            (isToday(task.due_date) || isOverdue(task.due_date, task.done)),
        );
        setTasks(list.slice(0, limits.agenda_limit));
      } else setTasks([]);
      if (n.status === "fulfilled")
        setNotes((n.value.data?.items || []).slice(0, limits.pedidos_limit));
      else setNotes([]);
      if (m.status === "fulfilled") setMail(m.value.data);
      else setMail({ count: 0, items: [] });
    };
    load();
    // A secretária pode ficar visível horas a fio — sem uma atualização
    // periódica, os widgets congelavam no instante em que o ambiente de
    // trabalho foi mostrado pela primeira vez.
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [limits.agenda_limit, limits.pedidos_limit]);

  return (
    <div className="os-widget-deck animate-fade-up">
      <div className="mb-3 flex items-end justify-between px-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.28em] text-neutral-400">
            Ambiente de trabalho
          </p>
          <p className="mt-1.5 font-heading text-2xl font-extrabold tracking-tight text-neutral-900">
            {greetingFor(now.getHours())}, Tiago.
          </p>
        </div>
        <p className="hidden pb-1 text-xs font-semibold capitalize text-neutral-400 lg:block">
          {now.toLocaleDateString("pt-PT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 3xl:gap-5">
        <Widget
          title="Agenda de hoje"
          icon={CalendarDays}
          count={tasks?.length ?? null}
          onOpen={() => onOpenRoute?.("/tarefas")}
          testid="widget-agenda"
        >
          {tasks == null ? (
            <EmptyLine>A carregar…</EmptyLine>
          ) : tasks.length === 0 ? (
            <EmptyLine>Sem tarefas com prazo para hoje.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {tasks.map((task) => {
                const overdue = isOverdue(task.due_date, task.done);
                const pr = getTaskPriority(task.priority);
                return (
                  <li key={task.id} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-destructive" : "bg-success"}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-neutral-800">
                      {task.title}
                    </span>
                    <span className="shrink-0 font-mono text-[8px] font-black uppercase text-neutral-400">
                      {overdue ? "atrasada" : pr?.label || ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Widget>
        <Widget
          title="Pedidos em aberto"
          icon={ClipboardList}
          count={status?.pedidos_ativos ?? null}
          onOpen={() => onOpenRoute?.("/")}
          testid="widget-pedidos"
        >
          {notes == null ? (
            <EmptyLine>A carregar…</EmptyLine>
          ) : notes.length === 0 ? (
            <EmptyLine>Sem pedidos em aberto. Bom trabalho!</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {notes.map((note) => (
                <li key={note.id} className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${note.is_overdue ? "bg-destructive" : "bg-neutral-400"}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-neutral-800">
                    {note.customer_name || note.title || "Pedido"}
                  </span>
                  {note.is_overdue ? (
                    <span className="shrink-0 font-mono text-[8px] font-black uppercase text-destructive">
                      parado
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Widget>
        <Widget
          title="Correio por ver"
          icon={Mail}
          count={mail?.count ?? null}
          onOpen={() => onOpenRoute?.("/emails")}
          testid="widget-correio"
        >
          {mail == null ? (
            <EmptyLine>A carregar…</EmptyLine>
          ) : !mail.count ? (
            <EmptyLine>Caixa de entrada em dia.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {(mail.items || []).slice(0, limits.correio_limit).map((message) => (
                <li key={message.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-neutral-800">
                    {message.supplier_name ||
                      message.from_name ||
                      message.from_email}
                    <span className="ml-1 font-semibold text-neutral-400">
                      {message.subject || "(sem assunto)"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[8px] font-bold text-neutral-400">
                    {timeAgo(message.received_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
}
