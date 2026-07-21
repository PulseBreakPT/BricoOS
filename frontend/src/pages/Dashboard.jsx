import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pie, PieChart, Cell } from "recharts";
import {
  ClipboardList, Clock, AlertTriangle, Timer, Mail, ArrowRight, CheckCircle2,
  Link2, Zap, Trophy, GripVertical, EyeOff, Eye, LayoutGrid,
} from "lucide-react";
import api, { API } from "@/lib/api";
import { getStatusCfg, getPriorityCfg, PRIORITY_ORDER, formatHours, STATUS_ORDER } from "@/lib/pedido";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const WIDGET_PREFS_KEY = "brico_dashboard_widgets_v1";
// wide = ocupa 2 das 3 colunas da grelha (lg:grid-flow-dense preenche os
// espaços livres com os widgets estreitos, por isso a ordem por omissão
// aproxima a disposição original em duas colunas mesmo sem posições fixas).
const WIDGETS = [
  { key: "alerts", title: "Precisa de atenção", wide: true },
  { key: "pipeline", title: "Pipeline por estado", wide: true },
  { key: "suppliers", title: "Fornecedores mais rápidos", wide: false },
  { key: "priorities", title: "Por prioridade", wide: false },
  { key: "gmail", title: "Envio de emails", wide: false },
];
const WIDGET_KEYS = WIDGETS.map((w) => w.key);

function loadWidgetPrefs() {
  let saved = { order: [], hidden: [] };
  try { saved = JSON.parse(window.localStorage.getItem(WIDGET_PREFS_KEY) || "null") || saved; } catch { /* noop */ }
  const known = (saved.order || []).filter((k) => WIDGET_KEYS.includes(k));
  const missing = WIDGET_KEYS.filter((k) => !known.includes(k));
  return { order: [...known, ...missing], hidden: (saved.hidden || []).filter((k) => WIDGET_KEYS.includes(k)) };
}

// Moldura comum a cada widget do Dashboard — arrastar para reordenar,
// ocultar para tirar da vista (sem apagar dados, só preferência local ao
// dispositivo). O conteúdo de cada widget não muda nada do que já existia.
function DashboardWidget({ widgetKey, title, wide, onDragStartKey, onDropOnKey, onHide, children }) {
  return (
    <div
      data-testid={`dashboard-widget-${widgetKey}`}
      draggable
      onDragStart={() => onDragStartKey(widgetKey)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOnKey(widgetKey)}
      className={`group relative ${wide ? "lg:col-span-2" : ""}`}
    >
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <span title="Arrastar para reordenar" className="cursor-grab rounded-md bg-white/90 p-1 text-slate-400 shadow-sm">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          data-testid={`dashboard-widget-hide-${widgetKey}`}
          title={`Ocultar "${title}"`}
          onClick={() => onHide(widgetKey)}
          className="rounded-md bg-white/90 p-1 text-slate-400 shadow-sm hover:bg-red-50 hover:text-red-500"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

// Contagem animada — os números "sobem" até ao valor real quando os dados
// chegam. Só anima valores numéricos; strings (ex.: "3h") passam direto.
function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (typeof value !== "number") return undefined;
    const start = performance.now();
    const dur = 700;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  if (typeof value !== "number") return <>{value}</>;
  return <span className="tabular-nums">{display}</span>;
}

const StatCard = ({ icon: Icon, label, value, accent, testid, danger, index = 0 }) => (
  <div
    data-testid={testid}
    className={`group relative animate-fade-up overflow-hidden rounded-2xl border bg-white p-4 card-elevated card-elevated-hover transition-all duration-200 hover:-translate-y-1 sm:p-5 ${danger && value > 0 ? "border-red-200" : "border-slate-200/90 hover:border-slate-300"}`}
    style={{ "--stagger-i": index }}
  >
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
      style={{ backgroundColor: accent }}
    />
    <div
      className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6 sm:h-10 sm:w-10"
      style={{ backgroundColor: `${accent}1a`, color: accent }}
    >
      <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.2} />
    </div>
    <p className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:mt-4 sm:text-4xl">
      <CountUp value={value} />
    </p>
    <p className="mt-0.5 text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
  </div>
);

const SEV_ICON = {
  high: { bg: "bg-red-100 text-red-600", ring: "border-red-100 bg-red-50/60" },
  medium: { bg: "bg-amber-100 text-amber-600", ring: "border-amber-100 bg-amber-50/60" },
  low: { bg: "bg-blue-100 text-blue-600", ring: "border-blue-100 bg-blue-50/60" },
};

const MEDALS = ["bg-amber-100 text-amber-700", "bg-slate-200 text-slate-600", "bg-orange-100 text-orange-700"];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [notifs, setNotifs] = useState({ items: [], count: 0 });
  const [gmail, setGmail] = useState({ connected: false, configured: false });
  const [widgetPrefs, setWidgetPrefs] = useState(loadWidgetPrefs);
  const dragKeyRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    try { window.localStorage.setItem(WIDGET_PREFS_KEY, JSON.stringify(widgetPrefs)); } catch { /* quota cheia ou modo privado */ }
  }, [widgetPrefs]);

  const dropOnWidget = (targetKey) => {
    const dragKey = dragKeyRef.current;
    dragKeyRef.current = null;
    if (!dragKey || dragKey === targetKey) return;
    setWidgetPrefs((prev) => {
      const next = prev.order.filter((k) => k !== dragKey);
      next.splice(next.indexOf(targetKey), 0, dragKey);
      return { ...prev, order: next };
    });
  };
  const hideWidget = (key) => setWidgetPrefs((prev) => ({ ...prev, hidden: [...prev.hidden, key] }));
  const showWidget = (key) => setWidgetPrefs((prev) => ({ ...prev, hidden: prev.hidden.filter((k) => k !== key) }));

  const load = useCallback(async () => {
    const [s, n, g] = await Promise.all([
      api.get("/stats"), api.get("/notifications"), api.get("/gmail/status"),
    ]);
    setStats(s.data); setNotifs(n.data); setGmail(g.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  const maxPrio = stats ? Math.max(1, ...Object.values(stats.by_priority)) : 1;
  const pipeline = stats ? STATUS_ORDER.filter((s) => (stats.by_status[s] || 0) > 0) : [];
  const pipelineTotal = pipeline.reduce((acc, s) => acc + (stats?.by_status?.[s] || 0), 0);

  // Dados do donut "Pipeline por estado" — mesma cor de marca de cada
  // estado (getStatusCfg) usada em toda a app, agora também no gráfico.
  const pieData = useMemo(
    () => pipeline.map((s) => ({ status: s, label: getStatusCfg(s).label, count: stats?.by_status?.[s] || 0, fill: getStatusCfg(s).dot })),
    [pipeline, stats]
  );
  const pieConfig = useMemo(
    () => Object.fromEntries(pipeline.map((s) => [s, { label: getStatusCfg(s).label, color: getStatusCfg(s).dot }])),
    [pipeline]
  );

  const hiddenWidgets = WIDGETS.filter((w) => widgetPrefs.hidden.includes(w.key));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="kicker capitalize">{today}</p>
          <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">Painel da loja</h1>
          <p className="text-sm text-slate-500">A fotografia do momento: pedidos, prazos e fornecedores em tempo real.</p>
        </div>
        {hiddenWidgets.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="dashboard-hidden-widgets-btn"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-900"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Widgets ocultos ({hiddenWidgets.length})
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hiddenWidgets.map((w) => (
                <DropdownMenuItem key={w.key} data-testid={`dashboard-widget-show-${w.key}`} onClick={() => showWidget(w.key)}>
                  <Eye className="mr-2 h-4 w-4" /> Mostrar "{w.title}"
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} testid="stat-open" icon={ClipboardList} label="Pedidos abertos" value={stats?.open_notes ?? "–"} accent="#7C3AED" />
        <StatCard index={1} testid="stat-waiting" icon={Clock} label="À espera de fornecedor" value={stats?.pending_supplier ?? "–"} accent="#2563EB" />
        <StatCard index={2} testid="stat-overdue" icon={AlertTriangle} label="Atrasados" value={stats?.overdue ?? "–"} accent="#DC2626" danger />
        <StatCard index={3} testid="stat-avg" icon={Timer} label="Tempo médio resposta" value={stats ? formatHours(stats.avg_response_hours) : "–"} accent="#16A34A" />
      </div>

      {(() => {
        const bodies = {
          alerts: (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-extrabold tracking-tight text-slate-900">
                  Precisa de atenção {notifs.count > 0 ? <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 align-middle font-mono text-xs font-bold text-red-700">{notifs.count}</span> : null}
                </h2>
                <Link to="/" data-testid="link-ver-pedidos" className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900">
                  Ver pedidos <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {notifs.items.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm font-semibold text-emerald-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100"><CheckCircle2 className="h-4 w-4" /></span>
                    Tudo em dia. Nenhum pedido esquecido!
                  </div>
                ) : notifs.items.slice(0, 6).map((n) => {
                  const sev = SEV_ICON[n.severity] || SEV_ICON.low;
                  return (
                    <button key={n.id} data-testid={`dash-alert-${n.id}`} onClick={() => n.note_id ? navigate(`/?open=${n.note_id}`) : navigate("/tarefas")}
                      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${sev.ring}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${sev.bg}`}>
                        {n.kind === "urgent" ? <Zap className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{n.title}</p>
                        <p className="truncate text-xs text-slate-500">{n.message}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-500" />
                    </button>
                  );
                })}
              </div>
            </div>
          ),
          pipeline: (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated sm:p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-lg font-extrabold tracking-tight text-slate-900">Pipeline por estado</h2>
                {pipelineTotal > 0 ? <span className="font-mono text-xs font-bold tabular-nums text-slate-400">{pipelineTotal} no total</span> : null}
              </div>
              {pipeline.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">Sem dados.</p>
              ) : (
                <>
                  {/* Donut — proporção de cada estado, com tooltip ao passar o rato/tocar */}
                  <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[200px]">
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent nameKey="status" hideLabel />}
                      />
                      <Pie data={pieData} dataKey="count" nameKey="status" innerRadius="55%" outerRadius="90%" strokeWidth={2} stroke="#fff">
                        {pieData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pipeline.map((s) => {
                      const cfg = getStatusCfg(s);
                      return (
                        <div key={s} data-testid={`pipeline-${s}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
                          <span className="text-xs font-semibold text-slate-600">{cfg.label}</span>
                          <span className="font-mono text-sm font-bold tabular-nums text-slate-900">{stats.by_status[s]}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ),
          suppliers: (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600"><Trophy className="h-4 w-4" /></span>
                <h2 className="font-heading text-base font-extrabold text-slate-900">Fornecedores mais rápidos</h2>
              </div>
              <div className="mt-3 space-y-2">
                {(stats?.fastest_suppliers || []).length === 0 ? (
                  <p className="text-sm text-slate-400">Ainda sem dados de resposta — chegam com os primeiros orçamentos.</p>
                ) : stats.fastest_suppliers.map((f, i) => (
                  <div key={f.supplier} data-testid={`fast-supplier-${i}`} className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 transition-all duration-150 hover:translate-x-1 hover:bg-slate-100">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${MEDALS[i] || "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{f.supplier}</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-emerald-600">{formatHours(f.avg_hours)}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
          priorities: (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated sm:p-6">
              <h2 className="font-heading text-base font-extrabold text-slate-900">Por prioridade</h2>
              <div className="mt-4 space-y-3">
                {PRIORITY_ORDER.map((p) => {
                  const cfg = getPriorityCfg(p);
                  const val = stats?.by_priority?.[p] ?? 0;
                  return (
                    <div key={p} data-testid={`prio-stat-${p}`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />{cfg.label}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-slate-900">{val}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(val / maxPrio) * 100}%`, backgroundColor: cfg.dot }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
          gmail: (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Mail className="h-4 w-4" /></span>
                <h2 className="font-heading text-base font-extrabold text-slate-900">Envio de emails</h2>
              </div>
              {gmail.connected ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate font-mono text-xs">{gmail.email}</span></div>
                  <Button data-testid="disconnect-gmail-btn" variant="outline" size="sm" onClick={async () => { await api.post("/gmail/disconnect"); load(); }} className="mt-3 w-full rounded-xl">Desligar Gmail</Button>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-slate-500">Liga o Gmail da loja para enviar pedidos de orçamento automaticamente.</p>
                  {gmail.configured ? (
                    <Button data-testid="connect-gmail-btn" onClick={() => { window.location.href = `${API}/gmail/connect`; }} className="mt-3 w-full rounded-xl"><Link2 className="mr-2 h-4 w-4" /> Ligar Gmail</Button>
                  ) : (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Credenciais Google por configurar no servidor.</div>
                  )}
                </div>
              )}
            </div>
          ),
        };
        const visible = WIDGETS.filter((w) => widgetPrefs.order.includes(w.key) && !widgetPrefs.hidden.includes(w.key));
        const ordered = widgetPrefs.order.map((key) => visible.find((w) => w.key === key)).filter(Boolean);
        return (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-flow-dense lg:grid-cols-3">
            {ordered.map((w) => (
              <DashboardWidget
                key={w.key}
                widgetKey={w.key}
                title={w.title}
                wide={w.wide}
                onDragStartKey={(k) => { dragKeyRef.current = k; }}
                onDropOnKey={dropOnWidget}
                onHide={hideWidget}
              >
                {bodies[w.key]}
              </DashboardWidget>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
