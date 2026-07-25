import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  ListChecks,
  Mail,
  Truck,
} from "lucide-react";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { useClock } from "@/hooks/useClock";
import { haptics } from "@/lib/haptics";
import { PANEL_TYPES, MOBILE_TOOL_TYPES } from "@/lib/panelRegistry";

const HOME_APPS = [
  {
    path: "/",
    label: "Pedidos",
    detail: "Clientes e obra",
    icon: ClipboardList,
    gradient: "from-slate-700 to-slate-950",
  },
  {
    path: "/emails",
    label: "Correio",
    detail: "Entrada e respostas",
    icon: Mail,
    gradient: "from-sky-500 to-blue-700",
  },
  {
    path: "/tarefas",
    label: "Tarefas",
    detail: "Prioridades",
    icon: ListChecks,
    gradient: "from-emerald-500 to-teal-700",
  },
  {
    path: "/fornecedores",
    label: "Fornecedores",
    detail: "Parceiros e compras",
    icon: Truck,
    gradient: "from-amber-400 to-orange-600",
  },
  {
    path: "/catalogo-tecnico",
    label: "Catálogo",
    detail: "Produtos e medidas",
    icon: BookOpenCheck,
    gradient: "from-red-500 to-red-800",
  },
  {
    path: "/estatisticas",
    label: "Análise",
    detail: "Pulso da operação",
    icon: BarChart3,
    gradient: "from-violet-500 to-indigo-700",
  },
];

const METRICS = [
  { key: "pedidos_ativos", label: "Pedidos ativos", route: "/" },
  { key: "emails_nao_vistos", label: "Emails por ver", route: "/emails" },
  { key: "tarefas_pendentes", label: "Tarefas pendentes", route: "/tarefas" },
];

function greetingFor(hour) {
  if (hour < 12) return "Bom dia";
  if (hour < 20) return "Boa tarde";
  return "Boa noite";
}

export default function MobileHomeSurface({ onOpenRoute, onOpenActivity, onOpenTool }) {
  const now = useClock();
  const { status, online } = useSystemStatus();

  const attentionTotal = useMemo(
    () =>
      Number(status?.emails_nao_vistos || 0) +
      Number(status?.tarefas_pendentes || 0),
    [status],
  );

  const openRoute = (path) => {
    haptics.tap();
    onOpenRoute?.(path);
  };

  const openTool = (type) => {
    haptics.tap();
    onOpenTool?.(type);
  };

  return (
    <section
      data-testid="mobile-home-surface"
      aria-label="Ambiente de trabalho"
      className="os-mobile-home mx-auto w-full max-w-7xl animate-page-enter"
    >
      <div className="os-home-hero relative overflow-hidden rounded-[28px] border border-border px-5 pb-5 pt-4 text-foreground shadow-[0_28px_70px_-28px_rgba(0,0,0,0.25)] sm:px-7 sm:pb-7 sm:pt-5">
        <div aria-hidden="true" className="os-home-grid absolute inset-0" />
        <div className="relative flex flex-wrap items-center justify-center gap-3">
          <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <span className={`led ${online ? "led-ok" : "led-alert"}`} />
            Ambiente 01
          </span>
        </div>

        <div className="relative mt-8 flex flex-col items-center text-center sm:mt-10">
          <div className="relative">
            <div aria-hidden="true" className="os-home-clock-glow absolute -inset-x-4 -inset-y-6 sm:-inset-x-10 sm:-inset-y-12" />
            <p className="relative font-heading text-[clamp(3.6rem,16vw,6.5rem)] font-black leading-[0.78] tracking-[-0.075em] tabular-nums whitespace-nowrap sm:text-[clamp(6.5rem,15vw,8.5rem)]">
              {now.toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <p className="mt-4 text-xs font-bold capitalize text-muted-foreground sm:text-sm">
            {now.toLocaleDateString("pt-PT", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="mt-6 max-w-2xl font-heading text-2xl font-extrabold tracking-tight sm:text-4xl">
            {greetingFor(now.getHours())}, Tiago.
          </h1>
        </div>

        <div className="relative mt-6 sm:max-w-md">
          <button
            type="button"
            onClick={onOpenActivity}
            className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-2xl border border-border bg-muted px-3 text-left text-xs font-extrabold text-foreground/75 transition-colors hover:bg-accent hover:text-foreground active:scale-[0.98] sm:max-w-xs"
          >
            <Activity className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Atividade</span>
            {attentionTotal > 0 ? (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[8px] font-black text-white">
                {attentionTotal > 99 ? "99+" : attentionTotal}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="os-home-metrics mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
        {METRICS.map((metric) => (
          <button
            type="button"
            key={metric.key}
            onClick={() => openRoute(metric.route)}
            className="themed-surface min-w-0 rounded-[20px] border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] sm:p-4"
          >
            <span className="block font-mono text-xl font-black leading-none text-foreground tabular-nums sm:text-2xl">
              {status?.[metric.key] ?? "–"}
            </span>
            <span className="mt-2 block text-[9px] font-extrabold leading-tight text-muted-foreground sm:text-[11px]">
              {metric.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-7 px-1 sm:mt-9">
        <p className="kicker">Aplicações</p>
        <h2 className="mt-2 font-heading text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          Bancada de trabalho
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6 sm:gap-4 lg:grid-cols-6">
        {HOME_APPS.map((app) => {
          const Icon = app.icon;
          return (
            <button
              type="button"
              key={app.path}
              onClick={() => openRoute(app.path)}
              className="group flex min-w-0 flex-col items-center rounded-[22px] px-1 py-2 text-center transition-colors hover:bg-muted active:scale-95 sm:px-2"
            >
              <span
                className={`os-home-app-icon flex h-14 w-14 items-center justify-center rounded-[19px] border border-white/25 bg-gradient-to-br ${app.gradient} text-white shadow-[0_16px_28px_-14px_rgba(16,17,20,0.45),inset_0_1px_0_rgba(255,255,255,0.28)] transition-transform group-hover:-translate-y-1 group-hover:scale-105 sm:h-16 sm:w-16 sm:rounded-[21px]`}
              >
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
              </span>
              <span className="mt-2 block max-w-full text-[11px] font-extrabold leading-tight text-foreground sm:text-xs">
                {app.label}
              </span>
              <span className="mt-1 hidden max-w-full text-[9px] font-semibold leading-tight text-muted-foreground sm:block">
                {app.detail}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 px-1 sm:mt-9">
        <p className="kicker">Extras</p>
        <h2 className="mt-2 font-heading text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          Ferramentas
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6 sm:gap-4 lg:grid-cols-6">
        {MOBILE_TOOL_TYPES.map((type) => {
          const meta = PANEL_TYPES[type];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <button
              type="button"
              key={type}
              data-testid={`mobile-home-tool-${type}`}
              onClick={() => openTool(type)}
              className="group flex min-w-0 flex-col items-center rounded-[22px] px-1 py-2 text-center transition-colors hover:bg-muted active:scale-95 sm:px-2"
            >
              <span className="os-home-app-icon flex h-14 w-14 items-center justify-center rounded-[19px] border border-white/25 bg-gradient-to-br from-neutral-600 to-neutral-900 text-white shadow-[0_16px_28px_-14px_rgba(16,17,20,0.45),inset_0_1px_0_rgba(255,255,255,0.28)] transition-transform group-hover:-translate-y-1 group-hover:scale-105 sm:h-16 sm:w-16 sm:rounded-[21px]">
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
              </span>
              <span className="mt-2 block max-w-full text-[11px] font-extrabold leading-tight text-foreground sm:text-xs">
                {meta.title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="themed-surface mt-7 flex items-center justify-between gap-4 rounded-[24px] border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            <span className="led led-ok" /> Turno operacional
          </p>
          <p className="mt-2 font-heading text-lg font-extrabold text-foreground">
            Tudo pronto para trabalhar
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
            {attentionTotal
              ? `${attentionTotal} sinais pedem atenção neste momento.`
              : "Não existem alertas críticos neste momento."}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-border bg-muted px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:block">
          {online ? "Ao vivo" : "Offline"}
        </span>
      </div>
    </section>
  );
}
