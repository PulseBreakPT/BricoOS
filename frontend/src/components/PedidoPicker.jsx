import { useEffect, useRef, useState } from "react";
import { Search, X, Link2 } from "lucide-react";
import api from "@/lib/api";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

// Tipo de pedido escolhido no envio (associação obrigatória) — "band" já é
// um segmento próprio (segment_clause, backend/server.py); "cliente"/
// "geral" são os dois lados do segmento "geral" já existente, distinguidos
// por já ter (ou não) nome/email de cliente preenchidos — sem campo novo
// na base de dados (mesma regra de backend/server.py: _pedido_type_for_note).
export const PEDIDO_TYPES = [
  { key: "cliente", label: "Pedido de Cliente", segment: "geral", has_customer: true },
  { key: "geral", label: "Pedido Geral", segment: "geral", has_customer: false },
  { key: "band", label: "Banda Alumínios", segment: "band", has_customer: null },
];

// Componente partilhado de pesquisa+seleção de pedido, extraído de
// LinkEmailToNoteDialog.jsx — reaproveitado inline (sem diálogo próprio)
// em ComposeEmailDialog.jsx, e dentro do diálogo já existente em
// LinkEmailToNoteDialog.jsx.
export default function PedidoPicker({ selected, onSelect, onClear, testIdPrefix = "pedido-picker" }) {
  const [type, setType] = useState(selected?.pedido_type || "cliente");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (selected) return undefined;
    const typeCfg = PEDIDO_TYPES.find((t) => t.key === type);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const params = { limit: 15, segment: typeCfg.segment };
        if (typeCfg.has_customer !== null) params.has_customer = typeCfg.has_customer;
        if (query) params.search = query;
        const { data } = await api.get("/notes", { params });
        if (seq === seqRef.current) setResults(data.items || []);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [type, query, selected]);

  if (selected) {
    const typeLabel = PEDIDO_TYPES.find((t) => t.key === selected.pedido_type)?.label;
    return (
      <div data-testid={`${testIdPrefix}-selected`} className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-foreground">{selected.customer_name || typeLabel || "Pedido"}</p>
          {selected.description ? <p className="truncate text-[10px] text-muted-foreground">{selected.description}</p> : null}
        </div>
        <Button
          type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0"
          onClick={onClear} data-testid={`${testIdPrefix}-clear`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PEDIDO_TYPES.map((t) => (
          <button
            key={t.key} type="button" data-testid={`${testIdPrefix}-type-${t.key}`}
            onClick={() => setType(t.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${type === t.key ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <InputGroup className="h-9 rounded-xl">
        <InputGroupAddon><Search className="h-3.5 w-3.5 text-muted-foreground" /></InputGroupAddon>
        <InputGroupInput
          data-testid={`${testIdPrefix}-search`} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar pedido…"
        />
      </InputGroup>
      <div className="max-h-52 space-y-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-4"><Spinner className="h-4 w-4 text-muted-foreground" /></div>
        ) : results.length === 0 ? (
          <Empty className="py-4"><EmptyDescription className="text-xs">Sem pedidos.</EmptyDescription></Empty>
        ) : results.map((n) => (
          <button
            key={n.id} type="button" data-testid={`${testIdPrefix}-option-${n.id}`}
            onClick={() => onSelect({ note_id: n.id, pedido_type: type, customer_name: n.customer_name, description: n.description })}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-muted"
          >
            <span className="truncate font-bold text-foreground">{n.customer_name || "Sem nome"}</span>
            <span className="truncate text-muted-foreground">{n.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
