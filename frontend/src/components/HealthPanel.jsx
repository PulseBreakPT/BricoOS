import { useEffect, useState, useRef } from "react";
import { RefreshCw, ClipboardList, Mail, ListChecks, FileClock, Paperclip, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { timeAgo } from "@/lib/pedido";

function Tile({ icon: Icon, label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-muted/60 text-foreground",
    amber: "bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)]",
  };
  return (
    <div className={`rounded-xl border border-border p-3 ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

const LOOP_LABELS = {
  imap_poll: "Verificação de emails",
  daily_maintenance: "Arquivamento automático",
  notification_retry: "Repetição de notificações",
  notification_scan: "Alertas de pedidos parados/urgentes",
};

function StatusRow({ ok, label, detail }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs">
      <span className="flex items-center gap-2 font-semibold text-foreground">
        <span className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`} />
        {label}
      </span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}

// Painel de Saúde — como um gestor de tarefas: um relance para saber se
// está tudo a funcionar (automações, sincronização) e o que está à espera
// de atenção, sem abrir cada área da app uma a uma.
export default function HealthPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    api.get("/system/health")
      .then(({ data: d }) => { if (seq === loadSeq.current) setData(d); })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        if (data) {
          // Já havia dados na página — um "Atualizar" que falha (ex.: sem
          // rede por um instante) não deve apagar o último estado conhecido.
          toast.error(getErrorMessage(e, "Não foi possível atualizar"));
        } else {
          setData(null);
        }
      })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>;
  }
  if (!data) {
    return <p className="py-10 text-center text-xs text-muted-foreground">Não foi possível carregar o estado da app.</p>;
  }

  const a = data.automacao;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Em espera de atenção</p>
        <button data-testid="health-refresh" onClick={load} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
        <Tile icon={ClipboardList} label="Pedidos ativos" value={data.pedidos_ativos} />
        <Tile icon={Mail} label="Emails por ver" value={data.emails_nao_vistos} />
        <Tile icon={ListChecks} label="Tarefas por fazer" value={data.tarefas_pendentes} />
        <Tile icon={FileClock} label="Rascunhos por confirmar" value={data.rascunhos} />
        <Tile icon={Paperclip} label="Anexos guardados" value={data.anexos_totais} />
        <Tile icon={Mail} label="Emails hoje" value={data.emails_hoje} />
      </div>
      {data.pedidos_esquecidos > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-[var(--pastel-amber-bg)] px-3 py-2 text-xs font-bold text-[color:var(--pastel-amber-text)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {data.pedidos_esquecidos} pedido{data.pedidos_esquecidos === 1 ? "" : "s"} parado{data.pedidos_esquecidos === 1 ? "" : "s"} sem avançar (novo/pendente/em preparação)
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Zap className="h-3.5 w-3.5" /> Automações
        </p>
        <div className="space-y-0.5 rounded-xl border border-border bg-card p-1">
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

      {data.background_loops?.length ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3.5 w-3.5" /> Processos de fundo
          </p>
          <div className="space-y-0.5 rounded-xl border border-border bg-card p-1">
            {data.background_loops.map((loop) => (
              <StatusRow
                key={loop.name}
                ok={loop.status === "disabled" || !loop.stale}
                label={LOOP_LABELS[loop.name] || loop.name}
                detail={
                  loop.status === "disabled" ? "desativado"
                    : loop.status === "unknown" ? "ainda não correu"
                      : loop.stale ? "parado — a reiniciar sozinho"
                        : `ativo · ${timeAgo(loop.last_heartbeat)}`
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
