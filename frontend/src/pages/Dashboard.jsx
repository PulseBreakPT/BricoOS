import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList, Euro, ListChecks, Truck, Mail, ArrowRight, CheckCircle2, Link2,
} from "lucide-react";
import api, { API } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { CategoryBadge, StatusPill } from "@/components/CategoryBadge";
import { Button } from "@/components/ui/button";

const StatCard = ({ icon: Icon, label, value, accent, testid }) => (
  <div
    data-testid={testid}
    className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
  >
    <div className="flex items-center justify-between">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
    </div>
    <p className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
    <p className="text-sm font-medium text-slate-500">{label}</p>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [notes, setNotes] = useState([]);
  const [gmail, setGmail] = useState({ connected: false, configured: false });

  const load = useCallback(async () => {
    const [s, n, g] = await Promise.all([
      api.get("/stats"),
      api.get("/notes"),
      api.get("/gmail/status"),
    ]);
    setStats(s.data);
    setNotes(n.data);
    setGmail(g.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long",
  });

  const attention = notes
    .filter((n) => !n.done && (n.status === "aberto" || n.status === "preco_pedido"))
    .slice(0, 6);

  const maxCat = stats ? Math.max(1, ...Object.values(stats.by_category)) : 1;

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold capitalize text-slate-400">{today}</p>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Olá, responsável
        </h1>
        <p className="text-sm text-slate-500">Resumo da loja Bricomarché de Faro.</p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard testid="stat-notes" icon={ClipboardList} label="Notas ativas" value={stats?.open_notes ?? "–"} accent="#0F172A" />
        <StatCard testid="stat-prices" icon={Euro} label="Preços por tratar" value={stats?.pending_prices ?? "–"} accent="#EA580C" />
        <StatCard testid="stat-tasks" icon={ListChecks} label="Tarefas pendentes" value={stats?.tasks_pending ?? "–"} accent="#2563EB" />
        <StatCard testid="stat-suppliers" icon={Truck} label="Fornecedores" value={stats?.suppliers ?? "–"} accent="#16A34A" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Attention list */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">Precisa de atenção</h2>
              <Link to="/clientes" data-testid="link-ver-clientes" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-900">
                Ver todos <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {attention.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Tudo em dia. Sem pedidos por tratar!
                </div>
              ) : (
                attention.map((n) => {
                  const c = getCategory(n.category);
                  return (
                    <Link
                      to="/clientes"
                      key={n.id}
                      data-testid={`attention-${n.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:bg-slate-100"
                    >
                      <span className="h-9 w-1 rounded-full" style={{ backgroundColor: c.accent }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
                        <p className="truncate text-xs text-slate-500">{n.description}</p>
                      </div>
                      <StatusPill status={n.status} />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Side: Gmail + categories */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-700" />
              <h2 className="font-heading text-base font-bold text-slate-900">Envio de emails</h2>
            </div>
            {gmail.connected ? (
              <div className="mt-3">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="truncate">{gmail.email}</span>
                </div>
                <Button
                  data-testid="disconnect-gmail-btn"
                  variant="outline"
                  size="sm"
                  onClick={async () => { await api.post("/gmail/disconnect"); load(); }}
                  className="mt-3 w-full rounded-xl"
                >
                  Desligar Gmail
                </Button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-slate-500">
                  Ligue o Gmail da loja para enviar pedidos de orçamento automaticamente aos fornecedores.
                </p>
                {gmail.configured ? (
                  <Button
                    data-testid="connect-gmail-btn"
                    onClick={() => { window.location.href = `${API}/gmail/connect`; }}
                    className="mt-3 w-full rounded-xl"
                  >
                    <Link2 className="mr-2 h-4 w-4" /> Ligar Gmail
                  </Button>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Credenciais Google por configurar no servidor. Contacte o administrador.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-base font-bold text-slate-900">Por secção</h2>
            <div className="mt-4 space-y-3.5">
              {CATEGORY_LIST.map((c) => {
                const val = stats?.by_category?.[c.key] ?? 0;
                return (
                  <div key={c.key} data-testid={`cat-stat-${c.key}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{c.label}</span>
                      <span className="font-mono font-bold text-slate-900">{val}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(val / maxCat) * 100}%`, backgroundColor: c.accent }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
