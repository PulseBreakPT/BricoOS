import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ClipboardList, Truck, Mail, FileText, ListChecks, ArrowRight, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import api from "@/lib/api";
import { useFavorites } from "@/context/FavoritesContext";

const KIND_META = {
  pedido: { icon: ClipboardList, label: "Pedidos" },
  fornecedor: { icon: Truck, label: "Fornecedores" },
  email: { icon: Mail, label: "Emails" },
  pdf: { icon: FileText, label: "Ficheiros" },
  tarefa: { icon: ListChecks, label: "Tarefas" },
};

// Painel único de Favoritos — pedidos, fornecedores, emails, ficheiros e
// tarefas fixados, agrupados por tipo. Pedidos vêm do servidor
// (note.favorite, já usado noutros sítios da app); o resto vem do
// FavoritesContext local ao dispositivo.
export default function FavoritesPanel({ open, onOpenChange }) {
  const { favorites, removeFavorite } = useFavorites();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get("/notes", { params: { favorite: true } })
      .then(({ data }) => setPedidos(data || []))
      .catch(() => setPedidos([]))
      .finally(() => setLoading(false));
  }, [open]);

  const goTo = (item) => {
    onOpenChange(false);
    if (item.external) window.open(item.to, "_blank", "noreferrer");
    else navigate(item.to);
  };

  const groups = [
    {
      kind: "pedido",
      items: pedidos.map((n) => ({
        kind: "pedido", id: n.id, label: n.customer_name || "Sem nome", sublabel: n.description, to: `/?open=${n.id}`,
      })),
    },
    ...Object.keys(KIND_META).filter((k) => k !== "pedido").map((kind) => ({
      kind, items: favorites.filter((f) => f.kind === kind),
    })),
  ].filter((g) => g.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-slate-100 px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <Star className="h-5 w-5 text-amber-500" /> Favoritos
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            Pedidos, fornecedores, emails, ficheiros e tarefas fixados — sempre à mão.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-slate-400" /></div>
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">
              Ainda sem favoritos — toca na estrela junto de um pedido, fornecedor, email, ficheiro ou tarefa.
            </p>
          ) : (
            groups.map((g) => {
              const meta = KIND_META[g.kind];
              const Icon = meta.icon;
              return (
                <div key={g.kind} className="mb-4">
                  <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{meta.label}</p>
                  <div className="space-y-1">
                    {g.items.map((it) => (
                      <div key={`${it.kind}-${it.id}`} className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <button type="button" onClick={() => goTo(it)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-xs font-bold text-slate-800">{it.label}</span>
                          {it.sublabel ? <span className="block truncate text-[11px] text-slate-400">{it.sublabel}</span> : null}
                        </button>
                        {g.kind !== "pedido" ? (
                          <button
                            type="button"
                            title="Remover dos favoritos"
                            onClick={() => removeFavorite(it.kind, it.id)}
                            className="shrink-0 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
