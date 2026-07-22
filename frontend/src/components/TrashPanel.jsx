import { useEffect, useState, useRef } from "react";
import { Trash2, ClipboardList, ListChecks, Truck, RotateCcw, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { haptics } from "@/lib/haptics";

const KIND_META = {
  pedido: { icon: ClipboardList, label: "Pedido", restorePath: (id) => `/trash/notes/${id}/restore`, purgePath: (id) => `/trash/notes/${id}` },
  tarefa: { icon: ListChecks, label: "Tarefa", restorePath: (id) => `/trash/tasks/${id}/restore`, purgePath: (id) => `/trash/tasks/${id}` },
  fornecedor: { icon: Truck, label: "Fornecedor", restorePath: (id) => `/trash/suppliers/${id}/restore`, purgePath: (id) => `/trash/suppliers/${id}` },
};

// Lixeira — pedidos, tarefas e fornecedores movidos para aqui em vez de
// apagados. "Nada se perde": ficam disponíveis para restaurar a qualquer
// momento; só "Eliminar definitivamente" apaga mesmo, e é sempre um passo
// explícito, nunca o resultado de um simples "Eliminar" na lista normal.
export default function TrashPanel({ open, onOpenChange, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState("");
  const loadSeq = useRef(0);

  const load = () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    api.get("/trash")
      .then(({ data }) => { if (seq === loadSeq.current) setItems(data.items || []); })
      .catch(() => {
        if (seq !== loadSeq.current) return;
        setItems([]);
        setLoadError(true);
      })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  };

  useEffect(() => { if (open) load(); }, [open]);

  const restore = async (item) => {
    setBusyId(`${item.kind}-${item.id}`);
    try {
      await api.post(KIND_META[item.kind].restorePath(item.id));
      toast.success(`${KIND_META[item.kind].label} restaurado`);
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)));
      onRestored && onRestored();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível restaurar"));
    } finally {
      setBusyId("");
    }
  };

  const purge = async (item) => {
    haptics.warning();
    if (!window.confirm(`Eliminar definitivamente "${item.label}"? Isto não pode ser desfeito.`)) return;
    setBusyId(`${item.kind}-${item.id}`);
    try {
      await api.delete(KIND_META[item.kind].purgePath(item.id));
      toast.success("Eliminado definitivamente");
      setItems((prev) => prev.filter((i) => !(i.kind === item.kind && i.id === item.id)));
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível eliminar"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <Trash2 className="h-5 w-5 text-muted-foreground" /> Lixeira
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Pedidos, tarefas e fornecedores movidos daqui não desaparecem — restaura-os a qualquer momento.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>
          ) : loadError ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Não foi possível carregar a lixeira.</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">A lixeira está vazia.</p>
          ) : (
            <div className="space-y-1">
              {items.map((it) => {
                const meta = KIND_META[it.kind];
                const Icon = meta.icon;
                const busy = busyId === `${it.kind}-${it.id}`;
                return (
                  <div key={`${it.kind}-${it.id}`} data-testid={`trash-item-${it.kind}-${it.id}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-foreground">{it.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {meta.label}{it.sublabel ? ` · ${it.sublabel}` : ""} · há {timeAgo(it.deleted_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm" variant="outline" disabled={busy}
                        data-testid={`trash-restore-${it.kind}-${it.id}`}
                        onClick={() => restore(it)}
                        className="h-8 rounded-lg text-xs"
                      >
                        {busy ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />} Restaurar
                      </Button>
                      <button
                        type="button"
                        data-testid={`trash-purge-${it.kind}-${it.id}`}
                        title="Eliminar definitivamente"
                        disabled={busy}
                        onClick={() => purge(it)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-[var(--pastel-red-bg)] hover:text-red-600 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
