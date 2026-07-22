import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Mail, Send, FileText, Phone, CircleDot } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import api from "@/lib/api";
import { timeAgo } from "@/lib/pedido";

// Ícone por tipo de evento — os tipos vêm de log_activity no backend.
const KIND_ICONS = {
  email_received: Mail,
  email_sent: Send,
  status_change: ArrowRight,
  contact_attempt: Phone,
  updated: FileText,
};

// Centro de Atividade — um único sítio onde aparece tudo o que aconteceu,
// por ordem cronológica: emails recebidos/enviados, mudanças de estado,
// PDFs processados, contactos… A cronologia individual de cada pedido
// continua na ficha do pedido; isto é a vista global.
export default function ActivityCenter({ open, onOpenChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get("/activity/global")
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const openEvent = (ev) => {
    if (!ev.note_id) return;
    onOpenChange(false);
    navigate(`/?open=${ev.note_id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <Activity className="h-5 w-5 text-red-600" /> Centro de Atividade
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Tudo o que aconteceu, no mesmo sítio — toca num evento para abrir o pedido.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Ainda sem atividade registada.</p>
          ) : (
            <div className="space-y-0.5">
              {items.map((ev, i) => {
                const Icon = KIND_ICONS[ev.kind] || CircleDot;
                const Row = ev.note_id ? "button" : "div";
                return (
                  <Row
                    key={`${ev.at}-${i}`}
                    data-testid={`activity-event-${i}`}
                    onClick={ev.note_id ? () => openEvent(ev) : undefined}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left ${ev.note_id ? "cursor-pointer transition-colors hover:bg-muted" : ""}`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold leading-snug text-foreground">{ev.message}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {ev.note_label ? `${ev.note_label} · ` : ""}{timeAgo(ev.at)}
                      </span>
                    </span>
                  </Row>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
