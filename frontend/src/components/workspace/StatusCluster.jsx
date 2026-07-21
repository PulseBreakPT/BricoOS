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
export default function StatusCluster() {
  const { status, online } = useSystemStatus();
  const now = useClock();
  return (
    <div data-testid="sidebar-status" className="relative flex flex-col gap-2 text-[11px] font-semibold text-[color:var(--chrome-muted)]">
      <div className="flex items-center justify-between">
        <span data-testid="sidebar-clock" className="font-mono tabular-nums text-white" title={now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}>
          {now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="flex items-center gap-1.5" title={online ? "Ligado ao servidor" : "Sem ligação ao servidor"}>
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
            <span className="flex items-center gap-1" title="Última verificação da caixa de entrada">
              <RefreshCw className="h-3 w-3" /> {timeAgo(status.last_sync)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
