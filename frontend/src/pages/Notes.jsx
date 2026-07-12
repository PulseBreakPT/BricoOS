import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Plus, Search, SlidersHorizontal, Inbox, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { CATEGORY_LIST } from "@/lib/categories";
import { PRIORITY_ORDER, PRIORITY_CONFIG } from "@/lib/pedido";
import PedidoCard from "@/components/PedidoCard";
import PedidoDetail from "@/components/PedidoDetail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PRESETS = [
  { key: "todos", label: "Todos", filters: {} },
  { key: "overdue", label: "Atrasados", filters: { overdue: true } },
  { key: "urgente", label: "Urgentes", filters: { priority: "urgente" } },
  { key: "espera", label: "Espera fornecedor", filters: { status: "enviado_fornecedor,aguarda_fornecedor" } },
  { key: "recebidos", label: "Recebidos", filters: { status: "orcamento_recebido" } },
  { key: "aprovados", label: "Aprovados", filters: { status: "aprovado,encomendado" } },
  { key: "concluidos", label: "Concluídos", filters: { status: "concluido" } },
];

export default function Notes() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [gmailStatus, setGmailStatus] = useState({ connected: false, configured: false });
  const [labels, setLabels] = useState([]);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [preset, setPreset] = useState("todos");
  const [category, setCategory] = useState("todos");
  const [advSupplier, setAdvSupplier] = useState("");
  const [advPriority, setAdvPriority] = useState("");
  const [sort, setSort] = useState("recent");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const searchTimer = useRef(null);

  const loadMeta = useCallback(async () => {
    const [s, g, l] = await Promise.all([
      api.get("/suppliers"), api.get("/gmail/status"), api.get("/labels"),
    ]);
    setSuppliers(s.data); setGmailStatus(g.data); setLabels(l.data);
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const p = PRESETS.find((x) => x.key === preset)?.filters || {};
    const params = { sort };
    if (p.status) params.status = p.status;
    if (p.priority) params.priority = p.priority;
    if (p.overdue) params.overdue = true;
    if (advPriority) params.priority = advPriority;
    if (category !== "todos") params.category = category;
    if (advSupplier) params.supplier_id = advSupplier;
    if (debounced) params.search = debounced;
    const { data } = await api.get("/notes", { params });
    setItems(data.items); setTotal(data.total); setLoading(false);
  }, [preset, category, advSupplier, advPriority, sort, debounced]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // gmail redirect + open param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const g = params.get("gmail");
    if (g === "connected") { toast.success("Gmail ligado com sucesso!"); loadMeta(); }
    else if (g === "error") { toast.error("Não foi possível ligar o Gmail."); }
    const openId = params.get("open");
    if (openId) { setDetailNoteId(openId); setDetailOpen(true); }
    if (g || openId) navigate("/clientes", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const openNew = () => { setDetailNoteId(null); setDetailOpen(true); };
  const openNote = (nid) => { setDetailNoteId(nid); setDetailOpen(true); };

  const toggleFav = async (note) => {
    setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, favorite: !n.favorite } : n)));
    await api.put(`/notes/${note.id}`, { favorite: !note.favorite });
  };
  const advance = async (note) => {
    if (!note.next_status) return;
    await api.patch(`/notes/${note.id}/status`, { status: note.next_status });
    toast.success(`Avançado para "${note.next_status_label}"`);
    loadNotes();
  };

  const clearFilters = () => {
    setPreset("todos"); setCategory("todos"); setAdvSupplier(""); setAdvPriority(""); setSort("recent");
  };

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Assistente de pedidos</p>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Pedidos de orçamento</h1>
        <p className="text-sm text-slate-500">Todo o ciclo de vida — do pedido do cliente à encomenda.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input data-testid="search-notes" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar por cliente, telefone ou pedido..." className="h-11 rounded-xl pl-10" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button data-testid="filters-btn" variant="outline" className="h-11 shrink-0 rounded-xl">
                <SlidersHorizontal className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Filtros</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ordenar por</Label>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger data-testid="sort-select" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Mais recentes</SelectItem>
                    <SelectItem value="priority">Prioridade</SelectItem>
                    <SelectItem value="deadline">Mais tempo parados</SelectItem>
                    <SelectItem value="customer">Nome do cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select value={advPriority || "all"} onValueChange={(v) => setAdvPriority(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="adv-priority" className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {PRIORITY_ORDER.map((p) => <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fornecedor</Label>
                <Select value={advSupplier || "all"} onValueChange={(v) => setAdvSupplier(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="adv-supplier" className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button data-testid="clear-filters" variant="ghost" onClick={clearFilters} className="w-full">Limpar filtros</Button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Status presets */}
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              data-testid={`preset-${p.key}`}
              onClick={() => setPreset(p.key)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-transform active:scale-95 ${
                preset === p.key ? "bg-primary text-primary-foreground" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <button data-testid="filter-todos" onClick={() => setCategory("todos")} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${category === "todos" ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>Todas as secções</button>
          {CATEGORY_LIST.map((c) => {
            const Icon = c.icon;
            const active = category === c.key;
            return (
              <button key={c.key} data-testid={`filter-${c.key}`} onClick={() => setCategory(c.key)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-transform active:scale-95"
                style={{ backgroundColor: active ? c.accent : c.bg, color: active ? "#fff" : c.text }}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.6} /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{total} pedido{total === 1 ? "" : "s"}</p>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {items.map((note) => (
            <PedidoCard key={note.id} note={note} onOpen={openNote} onToggleFavorite={toggleFav} onAdvance={advance} />
          ))}
        </AnimatePresence>
      </div>

      {!loading && items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Inbox className="h-7 w-7" /></div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900">Sem pedidos</p>
          <p className="text-sm text-slate-500">Ajuste os filtros ou crie um novo pedido com o botão +.</p>
        </div>
      ) : null}

      <button data-testid="fab-new-note" onClick={openNew} className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-slate-400/40 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 lg:bottom-10 lg:right-10 lg:h-16 lg:w-16">
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </button>

      <PedidoDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        noteId={detailNoteId}
        suppliers={suppliers}
        gmailStatus={gmailStatus}
        labelsList={labels}
        onChanged={loadNotes}
      />
    </div>
  );
}
