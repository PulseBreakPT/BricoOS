import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  Plus, Search, SlidersHorizontal, Inbox, Loader2, Focus, X, ArrowLeft, ArrowRight,
  Send, PhoneCall, CheckCircle2, Copy, Zap, Keyboard,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { PRIORITY_ORDER, PRIORITY_CONFIG, getStatusCfg, getPriorityCfg } from "@/lib/pedido";
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
  { key: "waiting_me", label: "À espera da minha ação", filters: { waiting: "me" } },
  { key: "supplier", label: "Sem resposta", filters: { waiting: "supplier" } },
  { key: "client", label: "Clientes à espera", filters: { waiting: "client" } },
  { key: "overdue", label: "Atrasados", filters: { overdue: true } },
  { key: "urgente", label: "Urgentes", filters: { priority: "urgente" } },
  { key: "recebidos", label: "Recebidos", filters: { status: "orcamento_recebido" } },
  { key: "aprovados", label: "Aprovados", filters: { status: "aprovado,encomendado" } },
  { key: "arquivados", label: "Arquivados", filters: { archived: true } },
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
  const [sort, setSort] = useState("smart");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();
  const searchTimer = useRef(null);
  const searchRef = useRef(null);
  const loadSeq = useRef(0);

  const loadMeta = useCallback(async () => {
    try {
      const [s, g, l] = await Promise.all([
        api.get("/suppliers"), api.get("/gmail/status"), api.get("/labels"),
      ]);
      setSuppliers(s.data); setGmailStatus(g.data); setLabels(l.data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar fornecedores"));
    }
  }, []);

  const loadNotes = useCallback(async () => {
    // Número de sequência: garante que uma resposta antiga (lenta) nunca
    // sobrepõe o resultado de um filtro mais recente.
    const seq = ++loadSeq.current;
    setLoading(true);
    const p = PRESETS.find((x) => x.key === preset)?.filters || {};
    const params = { sort };
    if (p.status) params.status = p.status;
    if (p.priority) params.priority = p.priority;
    if (p.overdue) params.overdue = true;
    if (p.waiting) params.waiting = p.waiting;
    if (p.archived) params.archived = true;
    if (advPriority) params.priority = advPriority;
    if (category !== "todos") params.category = category;
    if (advSupplier) params.supplier_id = advSupplier;
    if (debounced) params.search = debounced;
    try {
      const { data } = await api.get("/notes", { params });
      if (seq !== loadSeq.current) return;
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar pedidos"));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [preset, category, advSupplier, advPriority, sort, debounced]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => { setFocusIndex(0); }, [preset, category, debounced, advSupplier, advPriority]);
  // Se a lista encolher (ex.: pedido resolvido), o índice do modo foco não pode ficar fora dela.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(items.length - 1, 0)));
  }, [items.length]);

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
  }, [location.search, loadMeta, navigate]);

  const openNew = () => { setDetailNoteId(null); setDetailOpen(true); };
  const openNote = (nid) => { setDetailNoteId(nid); setDetailOpen(true); };

  // ---- Quick actions (available on cards, focus mode, without opening) ----
  const toggleFav = async (note) => {
    setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, favorite: !n.favorite } : n)));
    try {
      await api.put(`/notes/${note.id}`, { favorite: !note.favorite });
    } catch (e) {
      // Reverte a alteração otimista se o servidor recusar.
      setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, favorite: note.favorite } : n)));
      toast.error(getErrorMessage(e, "Erro ao marcar favorito"));
    }
  };
  const advance = async (note) => {
    if (!note.next_status) return;
    try {
      await api.patch(`/notes/${note.id}/status`, { status: note.next_status });
      toast.success(`Avançado para "${note.next_status_label}"`);
      loadNotes();
    } catch (e) { toast.error(getErrorMessage(e, "Erro ao avançar")); }
  };
  const contactClient = async (note) => {
    try {
      await api.post(`/notes/${note.id}/contact-client`, { method: "telefone" });
      toast.success("Registado: cliente contactado");
      loadNotes();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const resolve = async (note) => {
    try {
      await api.post(`/notes/${note.id}/resolve`);
      toast.success("Pedido resolvido e arquivado");
      loadNotes();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const reopen = async (note) => {
    try {
      await api.post(`/notes/${note.id}/reopen`);
      toast.success("Pedido reaberto");
      loadNotes();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const duplicate = async (note) => {
    try {
      const { data } = await api.post(`/notes/${note.id}/duplicate`);
      toast.success("Pedido duplicado — altere apenas o necessário");
      loadNotes();
      openNote(data.id);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const sendReminder = async (note) => {
    if (!note.supplier_id) {
      toast.message("Escolha o fornecedor no separador Orçamentos.");
      openNote(note.id);
      return;
    }
    try {
      const { data: tpl } = await api.get(`/notes/${note.id}/quote-template`, {
        params: { supplier_id: note.supplier_id, is_reminder: true },
      });
      await api.post(`/notes/${note.id}/send-quote-request`, {
        supplier_id: note.supplier_id, subject: tpl.subject, body: tpl.body, is_reminder: true,
      });
      toast.success("Lembrete enviado ao fornecedor");
      loadNotes();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar. Verifique o Gmail."));
      openNote(note.id);
    }
  };
  const actions = { toggleFav, advance, contactClient, resolve, reopen, duplicate, sendReminder };

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (typing) { if (e.key === "Escape") e.target.blur(); return; }
      if (detailOpen) return;
      if (e.key === "n") { e.preventDefault(); openNew(); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "f") { e.preventDefault(); setFocusMode((v) => !v); }
      else if (focusMode) {
        if (e.key === "ArrowRight" || e.key === "j") setFocusIndex((i) => Math.min(i + 1, items.length - 1));
        else if (e.key === "ArrowLeft" || e.key === "k") setFocusIndex((i) => Math.max(i - 1, 0));
        else if (e.key === "Enter") { const n = items[focusIndex]; if (n?.next_status) advance(n); }
        else if (e.key === "Escape") setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focusMode, focusIndex, detailOpen]);

  const clearFilters = () => {
    setPreset("todos"); setCategory("todos"); setAdvSupplier(""); setAdvPriority(""); setSort("smart");
  };

  const focusNote = items[focusIndex];

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 sm:text-sm">Assistente de pedidos</p>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">Pedidos de orçamento</h1>
        <p className="hidden text-sm text-slate-500 sm:block">Todo o ciclo de vida — do pedido do cliente à encomenda.</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:mt-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input ref={searchRef} data-testid="search-notes" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar cliente, telefone, artigo..." className="h-11 rounded-xl pl-10" />
          </div>
          <Button data-testid="focus-mode-btn" variant={focusMode ? "default" : "outline"} onClick={() => setFocusMode((v) => !v)} className="h-11 shrink-0 rounded-xl" title="Modo de foco (F)">
            <Focus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Foco</span>
          </Button>
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
                    <SelectItem value="smart">Inteligente (urgência real)</SelectItem>
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
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
                <Keyboard className="h-3.5 w-3.5" /> Atalhos: <b>N</b> novo · <b>/</b> procurar · <b>F</b> foco
              </div>
              <Button data-testid="clear-filters" variant="ghost" onClick={clearFilters} className="w-full">Limpar filtros</Button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Saved filters / presets */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1">
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
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1">
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

      {/* FOCUS MODE — trata um pedido de cada vez */}
      {focusMode ? (
        <div data-testid="focus-panel" className="mt-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Sem pedidos para focar.</div>
          ) : focusNote ? (
            <FocusCard
              note={focusNote}
              index={focusIndex}
              total={items.length}
              onPrev={() => setFocusIndex((i) => Math.max(i - 1, 0))}
              onNext={() => setFocusIndex((i) => Math.min(i + 1, items.length - 1))}
              onOpen={() => openNote(focusNote.id)}
              onExit={() => setFocusMode(false)}
              actions={actions}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {items.map((note) => (
              <PedidoCard key={note.id} note={note} onOpen={openNote} actions={actions} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!loading && items.length === 0 && !focusMode ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Inbox className="h-7 w-7" /></div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900">Sem pedidos</p>
          <p className="text-sm text-slate-500">Ajuste os filtros ou crie um novo pedido com o botão +.</p>
        </div>
      ) : null}

      <button data-testid="fab-new-note" onClick={openNew} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-slate-400/40 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 lg:bottom-10 lg:right-10 lg:h-16 lg:w-16">
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

function FocusCard({ note, index, total, onPrev, onNext, onOpen, onExit, actions }) {
  const c = getCategory(note.category);
  const st = getStatusCfg(note.status);
  const pr = getPriorityCfg(note.priority);
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Focus className="h-4 w-4" /> Modo de foco · {index + 1} de {total}
        </div>
        <button data-testid="focus-exit" onClick={onExit} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: pr.bg, color: pr.text }}>{pr.label}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>{c.label}</span>
          {note.is_overdue ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">Parado há {note.waiting_days}d</span> : null}
        </div>
        <h2 className="mt-3 font-heading text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{note.customer_name || "Sem nome"}</h2>
        {note.phone ? <p className="font-mono text-sm text-slate-500">{note.phone}</p> : null}
        <p className="mt-3 text-base text-slate-700">{note.description}</p>
        {note.measurements ? <p className="mt-1 font-mono text-sm text-slate-500">Medidas: {note.measurements}</p> : null}

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Próxima ação sugerida</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{note.next_action || "Concluído"}</p>
          {note.next_status ? (
            <Button data-testid="focus-advance" onClick={() => actions.advance(note)} className="mt-3 w-full rounded-xl">
              <Zap className="mr-2 h-4 w-4" /> {note.next_status_label} <span className="ml-1 opacity-70">(Enter)</span>
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button data-testid="focus-reminder" variant="outline" className="rounded-xl" onClick={() => actions.sendReminder(note)}><Send className="mr-2 h-4 w-4" /> Lembrete</Button>
          <Button data-testid="focus-contact" variant="outline" className="rounded-xl" onClick={() => actions.contactClient(note)}><PhoneCall className="mr-2 h-4 w-4" /> Contactar</Button>
          <Button data-testid="focus-resolve" variant="outline" className="rounded-xl" onClick={() => actions.resolve(note)}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolver</Button>
          <Button data-testid="focus-duplicate" variant="outline" className="rounded-xl" onClick={() => actions.duplicate(note)}><Copy className="mr-2 h-4 w-4" /> Duplicar</Button>
        </div>
        <button data-testid="focus-open" onClick={onOpen} className="mt-3 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-900">Abrir pedido completo →</button>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <Button data-testid="focus-prev" variant="ghost" size="sm" onClick={onPrev} disabled={index === 0}><ArrowLeft className="mr-1 h-4 w-4" /> Anterior</Button>
        <span className="text-xs text-slate-400">← → para navegar</span>
        <Button data-testid="focus-next" variant="ghost" size="sm" onClick={onNext} disabled={index === total - 1}>Seguinte <ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  );
}
