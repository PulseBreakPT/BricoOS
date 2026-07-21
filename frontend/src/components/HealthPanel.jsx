import { useEffect, useState } from "react";
import { RefreshCw, ClipboardList, Mail, ListChecks, FileClock, Paperclip, Zap, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { timeAgo } from "@/lib/pedido";

function Tile({ icon: Icon, label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50/60 text-slate-900",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-xl border border-slate-200 p-3 ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function StatusRow({ ok, label, detail }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs">
      <span className="flex items-center gap-2 font-semibold text-slate-700">
        <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`} />
        {label}
      </span>
      <span className="text-slate-400">{detail}</span>
    </div>
  );
}

// Painel de Saúde — como um gestor de tarefas: um relance para saber se
// está tudo a funcionar (automações, sincronização) e o que está à espera
// de atenção, sem abrir cada área da app uma a uma.
export default function HealthPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/system/health")
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-slate-400" /></div>;
  }
  if (!data) {
    return <p className="py-10 text-center text-xs text-slate-400">Não foi possível carregar o estado da app.</p>;
  }

  const a = data.automacao;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Em espera de atenção</p>
        <button data-testid="health-refresh" onClick={load} className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile icon={ClipboardList} label="Pedidos ativos" value={data.pedidos_ativos} />
        <Tile icon={Mail} label="Emails por ver" value={data.emails_nao_vistos} />
        <Tile icon={ListChecks} label="Tarefas por fazer" value={data.tarefas_pendentes} />
        <Tile icon={FileClock} label="Rascunhos por confirmar" value={data.rascunhos} />
        <Tile icon={Paperclip} label="Anexos guardados" value={data.anexos_totais} />
        <Tile icon={Mail} label="Emails hoje" value={data.emails_hoje} />
      </div>
      {data.pedidos_esquecidos > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {data.pedidos_esquecidos} pedido{data.pedidos_esquecidos === 1 ? "" : "s"} parado{data.pedidos_esquecidos === 1 ? "" : "s"} sem avançar (novo/pendente/em preparação)
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
          <Zap className="h-3.5 w-3.5" /> Automações
        </p>
        <div className="space-y-0.5 rounded-xl border border-slate-200 bg-white p-1">
          <StatusRow
            ok={a.imap_configurado}
            label="Verificação automática de emails"
            detail={a.imap_configurado ? `a cada ${a.imap_intervalo_min} min` : "não configurada"}
          />
          <StatusRow
            ok={!!a.ultima_verificacao_receb}
            label="Última verificação — recebidos"
            detail={a.ultima_verificacao_receb ? timeAgo(a.ultima_verificacao_receb) : "—"}
          />
          <StatusRow
            ok={!!a.ultima_verificacao_env}
            label="Última verificação — enviados"
            detail={a.ultima_verificacao_env ? timeAgo(a.ultima_verificacao_env) : "—"}
          />
          <StatusRow ok={a.ia_configurada} label="Integração de IA" detail={a.ia_configurada ? "ativa" : "não configurada"} />
        </div>
      </div>
    </div>
  );
}
