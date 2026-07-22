import { useEffect, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { BarChart3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const CATEGORY_LABELS = { orcamento: "Orçamento", reclamacao: "Reclamação", duvida: "Dúvida", urgente: "Urgente", outro: "Outro" };
const PRIORITY_LABELS = { alta: "Alta", normal: "Normal", baixa: "Baixa" };
const PRIORITY_COLORS = { alta: "bg-red-400", normal: "bg-amber-400", baixa: "bg-emerald-300" };

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-muted/60 p-3">
      <p className="text-xl font-extrabold text-foreground">{value}</p>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function BarRow({ label, count, max, colorCls = "bg-blue-400" }) {
  const pct = max ? Math.max((count / max) * 100, count > 0 ? 4 : 0) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 truncate text-muted-foreground sm:w-24">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right font-bold text-foreground">{count}</span>
    </div>
  );
}

// Painel de estatísticas de email — tempo médio de resposta, volume dos
// últimos 30 dias e distribuição por categoria/prioridade da IA.
export default function EmailStatsDialog({ open, onOpenChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    api.get("/emails/stats", { signal: controller.signal }).then(({ data }) => setStats(data))
      .catch((e) => {
        if (axios.isCancel(e)) return;
        // Antes disto, uma falha deixava loading=false mas stats=null para
        // sempre — a condição de render (loading || !stats) ficava presa a
        // mostrar o spinner indefinidamente, como se ainda estivesse a carregar.
        toast.error(getErrorMessage(e, "Erro ao carregar estatísticas"));
        setLoadError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open]);

  const maxDaily = stats ? Math.max(1, ...stats.daily.map((d) => Math.max(d.received, d.sent))) : 1;
  const maxCategory = stats ? Math.max(1, ...Object.values(stats.by_category)) : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="email-stats-dialog" className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <BarChart3 className="h-5 w-5" /> Estatísticas de email
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Últimos 30 dias.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>
          ) : loadError ? (
            <p className="flex items-center justify-center gap-2 py-10 text-center text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar as estatísticas.
            </p>
          ) : !stats ? null : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
                <Tile label="Tempo médio de resposta" value={stats.avg_response_hours != null ? `${stats.avg_response_hours}h` : "—"} />
                <Tile label="Recebidos (30d)" value={stats.total_received_30d} />
                <Tile label="Enviados (30d)" value={stats.total_sent_30d} />
              </div>

              {stats.fastest_suppliers.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Fornecedores mais rápidos a responder</p>
                  <div className="space-y-1.5">
                    {stats.fastest_suppliers.map((s) => (
                      <div key={s.supplier} className="flex items-center justify-between text-xs">
                        <span className="truncate text-foreground">{s.supplier}</span>
                        <span className="shrink-0 font-bold text-muted-foreground">{s.avg_hours}h · {s.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {stats.daily.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Volume diário</p>
                  <div className="flex h-16 items-end gap-0.5">
                    {stats.daily.map((d) => (
                      <div key={d.date} title={`${d.date}: ${d.received} recebidos, ${d.sent} enviados`} className="flex flex-1 items-end gap-px">
                        <div className="flex-1 rounded-t bg-blue-300" style={{ height: `${Math.max((d.received / maxDaily) * 100, d.received > 0 ? 6 : 0)}%` }} />
                        <div className="flex-1 rounded-t bg-emerald-300" style={{ height: `${Math.max((d.sent / maxDaily) * 100, d.sent > 0 ? 6 : 0)}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-300" /> Recebidos</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Enviados</span>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Por categoria</p>
                <div className="space-y-1.5">
                  {Object.entries(stats.by_category).map(([k, v]) => (
                    <BarRow key={k} label={CATEGORY_LABELS[k] || k} count={v} max={maxCategory} />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Por prioridade</p>
                <div className="space-y-1.5">
                  {Object.entries(stats.by_priority).map(([k, v]) => (
                    <BarRow key={k} label={PRIORITY_LABELS[k] || k} count={v} max={Math.max(1, ...Object.values(stats.by_priority))} colorCls={PRIORITY_COLORS[k]} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
