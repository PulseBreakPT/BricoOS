import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardList, Clock, AlertTriangle, Timer, Mail, ArrowRight, CheckCircle2,
  Link2, Zap, Trophy,
} from "lucide-react";
import api, { API } from "@/lib/api";
import { getStatusCfg, getPriorityCfg, PRIORITY_ORDER, formatHours, STATUS_ORDER } from "@/lib/pedido";
import { Button } from "@/components/ui/button";

const StatCard = ({ icon: Icon, label, value, accent, testid, danger }) => (
  <div data-testid={testid} className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${danger && value > 0 ? "border-red-200" : "border-slate-200"}`}>
    <div className="flex h-9 w-9 items-center justify-center rounded-xl sm:h-10 sm:w-10" style={{ backgroundColor: `${accent}1a`, color: accent }}>
      <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.2} />
    </div>
    <p className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:mt-4 sm:text-3xl">{value}</p>
    <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
  </div>
);

const SEV_ICON = {
  high: { bg: "bg-red-100 text-red-600", ring: "border-red-100 bg-red-50/60" },
  medium: { bg: "bg-amber-100 text-amber-600", ring: "border-amber-100 bg-amber-50/60" },
  low: { bg: "bg-slate-100 text-slate-600", ring: "border-slate-100 bg-slate-50/60" },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [notifs, setNotifs] = useState({ items: [], count: 0 });
  const [gmail, setGmail] = useState({ connected: false, configured: false });
  const navigate = useNavigate();

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

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold capitalize text-slate-400 sm:text-sm">{today}</p>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">Painel da loja</h1>
        <p className="text-sm text-slate-500">Bricomarché de Faro · visão em tempo real dos pedidos.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-7 sm:gap-4 lg:grid-cols-4">
        <StatCard testid="stat-open" icon={ClipboardList} label="Pedidos abertos" value={stats?.open_notes ?? "–"} accent="#0F172A" />
        <StatCard testid="stat-waiting" icon={Clock} label="À espera de fornecedor" value={stats?.pending_supplier ?? "–"} accent="#2563EB" />
        <StatCard testid="stat-overdue" icon={AlertTriangle} label="Atrasados" value={stats?.overdue ?? "–"} accent="#DC2626" danger />
        <StatCard testid="stat-avg" icon={Timer} label="Tempo médio resposta" value={stats ? formatHours(stats.avg_response_hours) : "–"} accent="#16A34A" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Alerts */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">
                Precisa de atenção {notifs.count > 0 ? <span className="text-red-500">({notifs.count})</span> : null}
              </h2>
              <Link to="/clientes" data-testid="link-ver-pedidos" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900">Ver pedidos <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="mt-4 space-y-2">
              {notifs.items.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Tudo em dia. Nenhum pedido esquecido!</div>
              ) : notifs.items.slice(0, 6).map((n) => {
                const sev = SEV_ICON[n.severity] || SEV_ICON.low;
                return (
                  <button key={n.id} data-testid={`dash-alert-${n.id}`} onClick={() => n.note_id ? navigate(`/clientes?open=${n.note_id}`) : navigate("/tarefas")}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:brightness-[0.98] ${sev.ring}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sev.bg}`}>
                      {n.kind === "urgent" ? <Zap className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{n.title}</p>
                      <p className="truncate text-xs text-slate-500">{n.message}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pipeline */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">Pipeline por estado</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {pipeline.length === 0 ? <p className="text-sm text-slate-400">Sem dados.</p> : pipeline.map((s) => {
                const cfg = getStatusCfg(s);
                return (
                  <div key={s} data-testid={`pipeline-${s}`} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
                    <span className="text-xs font-semibold text-slate-600">{cfg.label}</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{stats.by_status[s]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side */}
        <div className="flex flex-col gap-6">
          {/* Fastest suppliers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-slate-700" />
              <h2 className="font-heading text-base font-bold text-slate-900">Fornecedores mais rápidos</h2>
            </div>
            <div className="mt-3 space-y-2">
              {(stats?.fastest_suppliers || []).length === 0 ? (
                <p className="text-sm text-slate-400">Ainda sem dados de resposta.</p>
              ) : stats.fastest_suppliers.map((f, i) => (
                <div key={f.supplier} data-testid={`fast-supplier-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                  <span className="truncate text-sm font-semibold text-slate-700">{i + 1}. {f.supplier}</span>
                  <span className="font-mono text-xs font-bold text-emerald-600">{formatHours(f.avg_hours)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Priorities */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="font-heading text-base font-bold text-slate-900">Por prioridade</h2>
            <div className="mt-4 space-y-3">
              {PRIORITY_ORDER.map((p) => {
                const cfg = getPriorityCfg(p);
                const val = stats?.by_priority?.[p] ?? 0;
                return (
                  <div key={p} data-testid={`prio-stat-${p}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{cfg.label}</span>
                      <span className="font-mono font-bold text-slate-900">{val}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(val / maxPrio) * 100}%`, backgroundColor: cfg.dot }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gmail */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-700" />
              <h2 className="font-heading text-base font-bold text-slate-900">Envio de emails</h2>
            </div>
            {gmail.connected ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /><span className="truncate">{gmail.email}</span></div>
                <Button data-testid="disconnect-gmail-btn" variant="outline" size="sm" onClick={async () => { await api.post("/gmail/disconnect"); load(); }} className="mt-3 w-full rounded-xl">Desligar Gmail</Button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-slate-500">Ligue o Gmail da loja para enviar pedidos de orçamento automaticamente.</p>
                {gmail.configured ? (
                  <Button data-testid="connect-gmail-btn" onClick={() => { window.location.href = `${API}/gmail/connect`; }} className="mt-3 w-full rounded-xl"><Link2 className="mr-2 h-4 w-4" /> Ligar Gmail</Button>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Credenciais Google por configurar no servidor.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
