import { useEffect, useRef, useState } from "react";
import { Link2, Search } from "lucide-react";
import { toast } from "sonner";

import api, { getErrorMessage } from "@/lib/api";
import { getStatusCfg } from "@/lib/pedido";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription } from "@/components/ui/empty";

// Associa um email recebido (ex.: um orçamento respondido fora do fluxo
// automático) a um pedido já existente. A lista de pedidos vem do servidor
// (pesquisa com debounce), não de uma lista carregada de uma vez — a loja
// pode ter milhares de pedidos ao longo do tempo.
export default function LinkEmailToNoteDialog({ email, onOpenChange, onLinked }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const debounceRef = useRef(null);

  const open = !!email;

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); return; }
    setLoading(true);
    // Ao abrir, sugere logo os pedidos em aberto mais recentes — a maior
    // parte das vezes é um deles, sem ser preciso escrever nada.
    api.get("/notes", { params: { limit: 15 } })
      .then(({ data }) => setResults(data.items))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/notes", { params: { search: query || undefined, limit: 15 } });
        setResults(data.items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  const link = async (note) => {
    setLinkingId(note.id);
    try {
      const { data } = await api.post(`/emails/${email.id}/link-note`, { note_id: note.id });
      const base = `Email associado ao pedido de ${note.customer_name || "cliente"}`;
      toast.success(data.status_changed ? `${base} — estado passou a "${getStatusCfg(data.status).label}"` : base);
      onLinked?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível associar o email"));
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="link-email-dialog" className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="font-heading text-lg font-extrabold tracking-tight">Associar a um pedido</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {email ? `${email.from_name || email.from_email} — ${email.subject || "(sem assunto)"}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-slate-100 px-5 py-3">
          <InputGroup className="h-10 rounded-xl">
            <InputGroupAddon>
              <Search className="h-4 w-4 text-slate-400" />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              data-testid="link-email-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Procurar por cliente, telefone, artigo..."
            />
          </InputGroup>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-slate-400" /></div>
          ) : results.length === 0 ? (
            <Empty className="py-10">
              <EmptyDescription>Sem pedidos que correspondam à pesquisa.</EmptyDescription>
            </Empty>
          ) : (
            <div className="space-y-1">
              {results.map((n) => {
                const st = getStatusCfg(n.status);
                return (
                  <button
                    key={n.id}
                    type="button"
                    data-testid={`link-email-note-${n.id}`}
                    disabled={linkingId === n.id}
                    onClick={() => link(n)}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
                      <p className="truncate text-xs text-slate-500">{n.description}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
                    </span>
                    {linkingId === n.id ? <Spinner className="h-4 w-4 shrink-0 text-slate-400" /> : <Link2 className="h-4 w-4 shrink-0 text-slate-300" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
