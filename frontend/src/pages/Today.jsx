import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sun, AlertTriangle, Inbox, Clock, PhoneCall, Bell, Layers, Brain, Zap,
  CheckCircle2, Loader2, TrendingUp, Hourglass, ArrowRight, ChevronRight,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { getCategory } from "@/lib/categories";
import { getStatusCfg, getPriorityCfg, formatEuro } from "@/lib/pedido";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

function PedidoRow({ n, onOpen, onAdvance }) {
  const c = getCategory(n.category);
  const st = getStatusCfg(n.status);
  const pr = getPriorityCfg(n.priority);
  return (
    <div
      data-testid={`today-row-${n.id}`}
      onClick={() => onOpen(n.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 transition-colors hover:bg-slate-50 ${n.is_overdue ? "border-red-200" : "border-slate-200"}`}
    >
      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: pr.bg, color: pr.text }}>{pr.label}</span>
          {n.is_overdue ? <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{n.waiting_days}d</span> : null}
        </div>
        <p className="truncate text-xs text-slate-500">{n.description || "—"}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-slate-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
          {n.next_action || st.label}
        </p>
      </div>
      {n.next_status ? (
        <Button
          data-testid={`today-advance-${n.id}`}
          size="sm" variant="outline"
          onClick={(e) => { e.stopPropagation(); onAdvance(n); }}
          className="h-8 shrink-0 rounded-lg text-xs"
          title={`Avançar: ${n.next_status_label}`}
        >
          <Zap className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{n.next_status_label}</span>
        </Button>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      )}
    </div>
  );
}

function SummaryChip({ label, value, tone = "slate", icon: Icon }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${tones[tone]}`}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span className="text-lg font-extrabold tabular-nums">{value}</span>
      <span className="text-xs font-semibold opacity-80">{label}</span>
    </div>
  );
}

export default function Today() {
  const [data, setData] = useState(null);
  const [learning, setLearning] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingIds, setSendingIds] = useState(new Set());
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, l, b] = await Promise.all([
        api.get("/today"), api.get("/learning/profile"), api.get("/batches"),
      ]);
      setData(t.data); setLearning(l.data); setBatches(b.data.batches || []);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar o painel de hoje"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNote = (id) => navigate(`/clientes?open=${id}`);
  const advance = async (n) => {
    try {
      await api.patch(`/notes/${n.id}/status`, { status: n.next_status });
      toast.success(`Avançado para "${n.next_status_label}"`);
      load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const sendReminder = async (n) => {
    if (!n.supplier_id) { openNote(n.id); return; }
    if (sendingIds.has(n.id)) return; // evita duplo clique = dois emails
    setSendingIds((prev) => new Set(prev).add(n.id));
    try {
      const { data: tpl } = await api.get(`/notes/${n.id}/quote-template`, { params: { supplier_id: n.supplier_id, is_reminder: true } });
      await api.post(`/notes/${n.id}/send-quote-request`, { supplier_id: n.supplier_id, subject: tpl.subject, body: tpl.body, is_reminder: true });
      toast.success("Lembrete enviado"); load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Verifique o Gmail"));
      openNote(n.id);
    } finally {
      setSendingIds((prev) => { const s = new Set(prev); s.delete(n.id); return s; });
    }
  };

  const today = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  const s = data?.summary || {};
  const counts = data?.counts || {};
  const attention = data?.attention || [];
  const inbox = data?.inbox || [];
  const waitingMe = data?.waiting_me || [];
  const waitingOthers = [...(data?.waiting_supplier || []), ...(data?.waiting_client || [])];
  const reminders = data?.reminder_due || [];
  const longClients = data?.long_waiting_clients || [];

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold capitalize text-slate-400">{today}</p>
        <h1 className="flex items-center gap-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          <Sun className="h-8 w-8 text-amber-400" /> {greeting()}, chefe
        </h1>
        <p className="text-sm text-slate-500">O que precisa da sua atenção primeiro — para nenhum pedido ficar esquecido.</p>
      </div>

      {loading && !data ? (
        <div className="mt-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          {/* Daily summary */}
          <div className="mt-5 flex flex-wrap gap-2">
            <SummaryChip label="novos" value={s.novo ?? 0} tone="slate" icon={Inbox} />
            <SummaryChip label="pendentes" value={s.pendentes ?? 0} tone="blue" icon={Clock} />
            <SummaryChip label="atrasados" value={s.atrasados ?? 0} tone="red" icon={AlertTriangle} />
            <SummaryChip label="novos hoje" value={s.novos_hoje ?? 0} tone="amber" icon={TrendingUp} />
            <SummaryChip label="concluídos hoje" value={s.concluidos_hoje ?? 0} tone="green" icon={CheckCircle2} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* MAIN column */}
            <div className="space-y-6 lg:col-span-2">
              {/* Precisa de atenção */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-heading text-base font-bold text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-red-500" /> Precisa de atenção
                    {attention.length ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{data.attention_count}</span> : null}
                  </h2>
                </div>
                <div className="mt-3 space-y-2">
                  {attention.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" /> Tudo em dia. Nenhum pedido esquecido!
                    </div>
                  ) : attention.map((a) => (
                    <button
                      key={a.id} data-testid={`attention-${a.id}`}
                      onClick={() => a.note_id ? openNote(a.note_id) : navigate("/tarefas")}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-slate-50 ${a.severity === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.severity === "high" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{a.title}</p>
                        <p className="truncate text-xs text-slate-500">{a.message}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>

              {/* Listas: à espera de mim / de terceiros / novos */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <Tabs defaultValue="me">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="me" data-testid="tab-waiting-me" className="text-xs">A tratar por mim ({counts.waiting_me ?? waitingMe.length})</TabsTrigger>
                    <TabsTrigger value="others" data-testid="tab-waiting-others" className="text-xs">À espera de terceiros ({waitingOthers.length})</TabsTrigger>
                    <TabsTrigger value="inbox" data-testid="tab-inbox" className="text-xs">Novos ({inbox.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="me" className="mt-3 space-y-2 focus-visible:outline-none">
                    {waitingMe.length === 0 ? <Empty text="Nada à sua espera. Bom trabalho!" /> :
                      waitingMe.map((n) => <PedidoRow key={n.id} n={n} onOpen={openNote} onAdvance={advance} />)}
                  </TabsContent>
                  <TabsContent value="others" className="mt-3 space-y-2 focus-visible:outline-none">
                    {waitingOthers.length === 0 ? <Empty text="Nada pendente de fornecedores ou clientes." /> :
                      waitingOthers.map((n) => <PedidoRow key={n.id} n={n} onOpen={openNote} onAdvance={advance} />)}
                  </TabsContent>
                  <TabsContent value="inbox" className="mt-3 space-y-2 focus-visible:outline-none">
                    {inbox.length === 0 ? <Empty text="Caixa de entrada vazia." /> :
                      inbox.map((n) => <PedidoRow key={n.id} n={n} onOpen={openNote} onAdvance={advance} />)}
                  </TabsContent>
                </Tabs>
              </section>
            </div>

            {/* SIDE column */}
            <div className="space-y-6">
              {/* Valor potencial */}
              <section className="rounded-2xl border border-slate-900 bg-slate-900 p-5 text-white">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                  <TrendingUp className="h-4 w-4" /> Vendas pendentes (potencial)
                </p>
                <p className="mt-2 font-heading text-3xl font-extrabold">{formatEuro(data?.potential_value)}</p>
                <p className="mt-1 text-xs text-slate-400">Soma dos melhores orçamentos em aberto.</p>
              </section>

              {/* Lembretes a enviar */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900"><Bell className="h-4 w-4 text-blue-500" /> Lembretes a enviar</h3>
                <div className="mt-3 space-y-2">
                  {reminders.length === 0 ? <Empty text="Sem lembretes pendentes." /> :
                    reminders.map((n) => (
                      <div key={n.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{n.customer_name}</p>
                          <p className="truncate text-xs text-slate-500">Enviado há {n.days_since_supplier}d</p>
                        </div>
                        <Button data-testid={`reminder-send-${n.id}`} size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={sendingIds.has(n.id)} onClick={() => sendReminder(n)}>
                          {sendingIds.has(n.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enviar"}
                        </Button>
                      </div>
                    ))}
                </div>
              </section>

              {/* Clientes à espera há demasiado tempo */}
              {longClients.length > 0 ? (
                <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-orange-800"><Hourglass className="h-4 w-4" /> Clientes à espera</h3>
                  <div className="mt-3 space-y-2">
                    {longClients.map((n) => (
                      <button key={n.id} onClick={() => openNote(n.id)} className="flex w-full items-center gap-2 rounded-xl bg-white p-2.5 text-left hover:bg-orange-50">
                        <PhoneCall className="h-4 w-4 shrink-0 text-orange-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{n.customer_name}</p>
                          <p className="truncate text-xs text-slate-500">Há {n.days_since_client}d sem contacto</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Agrupar para o mesmo fornecedor */}
              {batches.length > 0 ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900"><Layers className="h-4 w-4 text-indigo-500" /> Agrupar pedidos</h3>
                  <p className="mt-1 text-xs text-slate-500">Envie num só email por fornecedor.</p>
                  <div className="mt-3 space-y-2">
                    {batches.map((b, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 p-2.5">
                        <p className="text-sm font-bold text-slate-900">{b.supplier?.name || "Fornecedor"}</p>
                        <p className="text-xs text-slate-500">{b.count} pedidos por enviar</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Motor de aprendizagem */}
              <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 sm:p-5">
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-violet-800"><Brain className="h-4 w-4" /> O assistente aprendeu</h3>
                <div className="mt-3 space-y-1.5">
                  {(learning?.habits || []).length === 0 ? (
                    <p className="text-xs text-violet-700/80">Ainda a aprender os seus hábitos. Com o uso, começa a sugerir automaticamente.</p>
                  ) : (learning.habits.slice(0, 5).map((h, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-violet-900"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /> {h}</p>
                  )))}
                </div>
              </section>
            </div>
          </div>

          {/* Fim do dia */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:p-5">
            <p className="font-bold text-slate-900">Fim do dia</p>
            <p className="mt-1">
              {counts.waiting_me
                ? `Ficaram ${counts.waiting_me} pedido(s) por tratar. Amanhã voltam ao topo automaticamente.`
                : "Tudo tratado. Nada ficou por fazer hoje."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">{text}</p>;
}
