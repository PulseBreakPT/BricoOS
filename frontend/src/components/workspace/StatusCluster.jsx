import { useEffect, useState } from "react";
import { Mail, ClipboardList, RefreshCw } from "lucide-react";
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
        <span
          className="whitespace-nowrap text-right font-mono text-[11px] font-extrabold tabular-nums text-neutral-900"
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
