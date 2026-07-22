import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import {
  Plus, Search, SlidersHorizontal, Inbox, Focus, X, ArrowLeft, ArrowRight,
  Send, PhoneCall, CheckCircle2, Copy, Zap, Keyboard, AlertTriangle, Clock,
  PhoneMissed, TrendingUp, Frame, Store, MailCheck, KanbanSquare, LayoutGrid, Trash2,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import {
  PRIORITY_ORDER, PRIORITY_CONFIG, getStatusCfg, getPriorityCfg,
  getNextActionCta, getNextActionMode,
} from "@/lib/pedido";
import PedidoCard from "@/components/PedidoCard";
import { PedidoCardSkeleton } from "@/components/LoadingSkeletons";
import PedidoKanban from "@/components/PedidoKanban";
import PedidoDetail from "@/components/PedidoDetail";
import ConfirmSendDialog from "@/components/ConfirmSendDialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia,
} from "@/components/ui/empty";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PRESETS = [
  { key: "todos", label: "Todos", filters: {} },
  { key: "novos", label: "Novos", filters: { status: "novo" } },
  { key: "waiting_me", label: "À espera da minha ação", filters: { waiting: "me" } },
  { key: "callback", label: "Voltar a ligar", filters: { callback: true } },
  { key: "supplier", label: "Sem resposta", filters: { waiting: "supplier" } },
  { key: "client", label: "Clientes à espera", filters: { waiting: "client" } },
  { key: "overdue", label: "Atrasados", filters: { overdue: true } },
  { key: "urgente", label: "Urgentes", filters: { priority: "urgente" } },
  { key: "recebidos", label: "Recebidos", filters: { status: "orcamento_recebido" } },
  { key: "aprovados", label: "Aprovados", filters: { status: "aprovado,encomendado" } },
  { key: "arquivados", label: "Arquivados", filters: { archived: true } },
];

const DETAIL_TABS = ["detalhes", "orcamentos", "cronologia", "tarefas"];

// As duas áreas do painel — completamente separadas, cada uma só com os seus
// pedidos: «band» = Orçamentos Banda Alumínios; «geral» = Pedidos de Clientes.
const SEGMENTS = {
  geral: {
    title: "Pedidos de Clientes",
    shortTitle: "Pedidos de Clientes",
    subtitle: "Todos os pedidos da loja exceto os da Banda Alumínios.",
    icon: Store,
    accent: "text-foreground",
    iconAccent: "bg-foreground text-background",
    createMode: "normal",
    empty: "Sem pedidos de clientes. Crie um novo com o botão +.",
  },
  band: {
    title: "Orçamentos Banda Alumínios",
    shortTitle: "Banda Alumínios",
    subtitle: "Só caixilharia à medida e pedidos ao fornecedor BandAluminios.",
    icon: Frame,
    accent: "text-orange-600",
    iconAccent: "bg-orange-500 text-white",
    createMode: "band",
    empty: "Sem orçamentos Banda Alumínios. Crie um novo com o botão +.",
  },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

// Chips de resumo do dia. Os que têm "preset" aplicam o filtro correspondente
// na lista ao clicar — o resumo e a lista são o mesmo painel, não duas páginas.
function SummaryChip({ label, value, tone = "slate", icon: Icon, active, onClick }) {
  const tones = {
    slate: { tile: "bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]", value: "text-[color:var(--tone-slate-text)]" },
    blue: { tile: "bg-[var(--tone-blue-bg)] text-[color:var(--tone-blue-text)]", value: "text-[color:var(--tone-blue-text)]" },
    amber: { tile: "bg-[var(--tone-amber-bg)] text-[color:var(--tone-amber-text)]", value: "text-[color:var(--tone-amber-text)]" },
    red: { tile: "bg-[var(--tone-red-bg)] text-[color:var(--tone-red-text)]", value: "text-[color:var(--tone-red-text)]" },
    green: { tile: "bg-[var(--tone-green-bg)] text-[color:var(--tone-green-text)]", value: "text-[color:var(--tone-green-text)]" },
  };
  const t = tones[tone];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2 rounded-xl border bg-card px-2.5 py-2 transition-all duration-150 sm:shrink-0 sm:px-3 ${
        active ? "border-foreground shadow-md ring-1 ring-foreground" : "border-border shadow-sm"
      } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-input hover:shadow-md active:scale-95" : ""}`}
    >
      {Icon ? (
        <span className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex ${t.tile}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      ) : null}
      <span className={`shrink-0 font-heading text-base font-extrabold tabular-nums sm:text-lg ${t.value}`}>{value}</span>
      <span className="truncate text-[11px] font-bold text-muted-foreground sm:text-xs">{label}</span>
    </Tag>
  );
}

export default function Notes() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [gmailStatus, setGmailStatus] = useState({ connected: false, configured: false });
  const [labels, setLabels] = useState([]);
  const [today, setToday] = useState(null);

  // Área ativa, lida do URL (?area=band) para sobreviver a reloads e links.
  const [segment, setSegment] = useState(() => (
    new URLSearchParams(window.location.search).get("area") === "band" ? "band" : "geral"
  ));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [preset, setPreset] = useState("todos");
  const [category, setCategory] = useState("todos");
  const [advSupplier, setAdvSupplier] = useState("");
  const [advPriority, setAdvPriority] = useState("");
  const [sort, setSort] = useState("smart");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState("detalhes");
  const [detailCreateMode, setDetailCreateMode] = useState("choice");
  const [confirmNote, setConfirmNote] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [kanbanView, setKanbanView] = useState(false);

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

  // Resumo do dia + alertas (antiga página "Hoje"), calculados só para a área ativa.
  const loadToday = useCallback(async () => {
    try {
      const { data } = await api.get("/today", { params: { segment } });
      setToday(data);
    } catch { /* o painel funciona na mesma sem o resumo */ }
  }, [segment]);

  const loadNotes = useCallback(async () => {
    // Número de sequência: garante que uma resposta antiga (lenta) nunca
    // sobrepõe o resultado de um filtro mais recente.
    const seq = ++loadSeq.current;
    setLoading(true);
    const p = PRESETS.find((x) => x.key === preset)?.filters || {};
    const params = { sort, segment };
    if (p.status) params.status = p.status;
    if (p.priority) params.priority = p.priority;
    if (p.overdue) params.overdue = true;
    if (p.waiting) params.waiting = p.waiting;
    if (p.callback) params.callback = true;
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
  }, [preset, category, advSupplier, advPriority, sort, debounced, segment]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Depois de qualquer ação que mude pedidos, atualiza lista E resumo do dia.
  const reloadAll = useCallback(() => { loadNotes(); loadToday(); }, [loadNotes, loadToday]);
  useEffect(() => { setFocusIndex(0); }, [preset, category, debounced, advSupplier, advPriority, segment]);

  // Mudar de área: atualiza o URL (partilhável) e limpa filtros para nunca
  // arrastar contexto de uma área para a outra.
  const changeSegment = useCallback((seg) => {
    if (seg === segment) return;
    setSegment(seg);
    setPreset("todos"); setCategory("todos"); setAdvSupplier(""); setAdvPriority(""); setSearch("");
    navigate(seg === "band" ? "/?area=band" : "/", { replace: true });
  }, [segment, navigate]);
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
    const openTab = params.get("tab");
    if (openId) {
      setDetailNoteId(openId);
      setDetailInitialTab(DETAIL_TABS.includes(openTab) ? openTab : "detalhes");
      setDetailOpen(true);
    }
    // "?new=1" — atalho da pesquisa global (⌘K) para criar um pedido a
    // partir de qualquer página, sem depender do botão + desta.
    const wantsNew = params.get("new");
    if (wantsNew && !openId) {
      setDetailNoteId(null);
      setDetailInitialTab("detalhes");
      setDetailCreateMode(SEGMENTS[segment].createMode);
      setDetailOpen(true);
    }
    // Ao limpar os parâmetros transitórios (gmail/open/new), a área ativa mantém-se no URL.
    if (g || openId || wantsNew) navigate(params.get("area") === "band" ? "/?area=band" : "/", { replace: true });
  }, [location.search, loadMeta, navigate, segment]);

  const openNew = () => {
    setDetailNoteId(null);
    setDetailInitialTab("detalhes");
    // O botão + da área Banda abre logo o assistente de caixilharia; o da
    // área geral abre o pedido normal — cada área cria só o que lhe pertence.
    setDetailCreateMode(SEGMENTS[segment].createMode);
    setDetailOpen(true);
  };
  const openNote = (nid, initialTab = "detalhes") => {
    setDetailNoteId(nid); setDetailInitialTab(initialTab); setDetailCreateMode("choice"); setDetailOpen(true);
  };

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
    if (getNextActionMode(note) !== "status") {
      openNote(note.id, "orcamentos");
      toast.message(getNextActionCta(note), {
        description: "Abre a ação indicada para o estado só mudar depois de a registar.",
      });
      return;
    }
    try {
      await api.patch(`/notes/${note.id}/status`, { status: note.next_status });
      toast.success(`Avançado para "${note.next_status_label}"`);
      reloadAll();
    } catch (e) { toast.error(getErrorMessage(e, "Erro ao avançar")); }
  };
  const contactClient = async (note) => {
    try {
      await api.post(`/notes/${note.id}/contact-client`, { method: "telefone" });
      toast.success("Registado: cliente contactado");
      reloadAll();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const resolve = async (note) => {
    try {
      await api.post(`/notes/${note.id}/resolve`);
      toast.success("Pedido resolvido e arquivado");
      reloadAll();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const reopen = async (note) => {
    try {
      await api.post(`/notes/${note.id}/reopen`);
      toast.success("Pedido reaberto");
      reloadAll();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const duplicate = async (note) => {
    try {
      const { data } = await api.post(`/notes/${note.id}/duplicate`);
      toast.success("Pedido duplicado — altera apenas o necessário");
      reloadAll();
      openNote(data.id);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };
  const changeStatus = async (note, status) => {
    try {
      await api.patch(`/notes/${note.id}/status`, { status });
      toast.success(`Estado alterado para "${getStatusCfg(status).label}"`);
      reloadAll();
    } catch (e) { toast.error(getErrorMessage(e, "Erro ao mudar de estado")); }
  };
  const sendReminder = async (note) => {
    if (!note.supplier_id) {
      toast.message("Escolhe o fornecedor no separador Orçamentos.");
      openNote(note.id);
      return;
    }
    if (!window.confirm(`Confirmar envio do lembrete por email ao fornecedor do pedido de ${note.customer_name || "este cliente"}?`)) return;
    try {
      const { data: tpl } = await api.get(`/notes/${note.id}/quote-template`, {
        params: { supplier_id: note.supplier_id, is_reminder: true },
      });
      await api.post(`/notes/${note.id}/send-quote-request`, {
        supplier_id: note.supplier_id, subject: tpl.subject, body: tpl.body, is_reminder: true,
      });
      toast.success("Lembrete enviado ao fornecedor");
      reloadAll();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar. Verifica o Gmail."));
      openNote(note.id);
    }
  };
  const actions = { toggleFav, advance, contactClient, resolve, reopen, duplicate, sendReminder, changeStatus };

  // ---- Seleção em grupo — ações sobre vários pedidos de uma vez (lógica base 21) ----
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((n) => n.id))));
  };
  const bulkResolve = async () => {
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.post(`/notes/${id}/resolve`)));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast[failed ? "warning" : "success"](
      failed ? `${ids.length - failed} resolvido(s), ${failed} falhou(aram)` : `${ids.length} pedido(s) resolvido(s)`
    );
    clearSelection();
    reloadAll();
    setBulkBusy(false);
  };
  const bulkTrash = async () => {
    const ids = [...selected];
    if (!window.confirm(`Mover ${ids.length} pedido(s) para a lixeira? Podes restaurá-los depois, na Lixeira.`)) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/notes/${id}`)));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast[failed ? "warning" : "success"](
      failed ? `${ids.length - failed} movido(s), ${failed} falhou(aram)` : `${ids.length} pedido(s) movido(s) para a lixeira`
    );
    clearSelection();
    reloadAll();
    setBulkBusy(false);
  };

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
  const s = today?.summary || {};
  const counts = today?.counts || {};
  const attention = today?.attention || [];
  const seg = SEGMENTS[segment];
  const SegIcon = seg.icon;

  return (
    <div>
      {/* Abas das duas áreas — cada uma só com os seus pedidos */}
      <div className="card-elevated relative grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-card p-1.5">
        {Object.entries(SEGMENTS).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const active = segment === key;
          return (
            <button
              key={key}
              type="button"
              data-testid={`segment-${key}`}
              onClick={() => changeSegment(key)}
              className={`relative flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-bold transition-all duration-200 sm:text-sm ${
                active
                  ? `shadow-sm ${key === "band" ? "bg-[var(--pastel-orange-bg)] text-[color:var(--pastel-orange-text)] ring-1 ring-orange-200" : "bg-muted text-foreground ring-1 ring-slate-300"}`
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
              <span className="truncate">{cfg.shortTitle || cfg.title}</span>
              {active ? <span className={`absolute -bottom-0.5 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full ${key === "band" ? "bg-orange-500" : "bg-foreground"}`} /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-3.5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg sm:h-13 sm:w-13 ${seg.iconAccent} ${segment === "band" ? "shadow-orange-300/50" : "shadow-slate-400/50"}`}>
          <SegIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-col">
          <p className="kicker">{greeting()}, Tiago</p>
          <h1 data-testid="segment-title" className={`mt-0.5 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl ${seg.accent}`}>
            {seg.title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!today
              ? seg.subtitle
              : counts.waiting_me
                ? `${counts.waiting_me} pedido${counts.waiting_me === 1 ? "" : "s"} à espera da tua ação nesta área.`
                : seg.subtitle}
          </p>
        </div>
      </div>

      {/* Resumo do dia — grelha compacta no telemóvel, sem scroll horizontal */}
      {today ? (
        <div className="mt-4 grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:gap-2">
          <SummaryChip label="novos" value={s.novo ?? 0} tone="slate" icon={Inbox} active={preset === "novos"} onClick={() => setPreset(preset === "novos" ? "todos" : "novos")} />
          <SummaryChip label="pendentes" value={s.pendentes ?? 0} tone="blue" icon={Clock} />
          <SummaryChip label="a tratar por mim" value={counts.waiting_me ?? 0} tone="blue" icon={Zap} active={preset === "waiting_me"} onClick={() => setPreset(preset === "waiting_me" ? "todos" : "waiting_me")} />
          <SummaryChip label="atrasados" value={s.atrasados ?? 0} tone="red" icon={AlertTriangle} active={preset === "overdue"} onClick={() => setPreset(preset === "overdue" ? "todos" : "overdue")} />
          {counts.follow_up ? <SummaryChip label="a religar" value={counts.follow_up} tone="amber" icon={PhoneMissed} active={preset === "callback"} onClick={() => setPreset(preset === "callback" ? "todos" : "callback")} /> : null}
          <SummaryChip label="novos hoje" value={s.novos_hoje ?? 0} tone="amber" icon={TrendingUp} />
          <SummaryChip label="concluídos hoje" value={s.concluidos_hoje ?? 0} tone="green" icon={CheckCircle2} />
        </div>
      ) : null}

      {/* Prontos para enviar — email + PDF preparados automaticamente a partir
          do email do fornecedor; um clique abre o ecrã de confirmação */}
      {(today?.to_confirm || []).length > 0 ? (
        <section data-testid="to-confirm-panel" className="mt-4 rounded-2xl border border-emerald-200 bg-[var(--pastel-emerald-bg)] p-4 sm:p-5">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-base font-extrabold text-[color:var(--pastel-emerald-text)]">
            <MailCheck className="h-4 w-4 text-emerald-600" /> Prontos para enviar ao cliente
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{counts.to_confirm}</span>
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--pastel-emerald-text)]/80">Analisados e calculados automaticamente — só falta a tua confirmação.</p>
          <div className="mt-3 space-y-2">
            {today.to_confirm.map((n) => (
              <button
                key={n.id}
                data-testid={`to-confirm-${n.id}`}
                onClick={() => setConfirmNote(n)}
                className="flex w-full flex-col items-stretch gap-3 rounded-xl bg-card p-3 text-left transition-colors hover:bg-[var(--pastel-emerald-bg)] min-[420px]:flex-row min-[420px]:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-foreground">{n.customer_name || "Sem nome"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {n.pending_client_send?.pdf_filename || "PDF pronto"}
                    {n.pending_client_send?.total != null ? ` · ${Number(n.pending_client_send.total).toFixed(2)} € c/ IVA` : ""}
                  </p>
                </div>
                <span className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                  <Send className="h-3.5 w-3.5" /> Rever e enviar
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Precisa de atenção — triagem no topo, o resto é a própria lista */}
      {attention.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-heading text-base font-extrabold text-foreground">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Precisa de atenção
            <span className="rounded-full bg-[var(--pastel-red-bg)] px-2 py-0.5 text-xs font-bold text-[color:var(--pastel-red-text)]">{today.attention_count}</span>
          </h2>
          <div className="mt-3 space-y-2">
            {attention.slice(0, 4).map((a) => (
              <button
                key={a.id} data-testid={`attention-${a.id}`}
                onClick={() => a.note_id ? openNote(a.note_id) : navigate("/tarefas")}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted ${a.severity === "high" ? "border-red-200 bg-[var(--pastel-red-bg)]" : "border-amber-200 bg-[var(--pastel-amber-bg)]"}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.severity === "high" ? "bg-[var(--pastel-red-bg)] text-red-600" : "bg-[var(--pastel-amber-bg)] text-amber-600"}`}>
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-foreground">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.message}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {today.attention_count > 4 ? (
              <button onClick={() => setPreset("overdue")} className="w-full rounded-xl border border-dashed border-border p-2 text-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                Ver os restantes na lista (filtro "Atrasados") →
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:mt-6">
        <div className="flex gap-2">
          <InputGroup className="h-11 flex-1 rounded-xl">
            <InputGroupAddon>
              <Search className="h-4 w-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput ref={searchRef} data-testid="search-notes" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar cliente, telefone, artigo..." />
          </InputGroup>
          <Button data-testid="focus-mode-btn" variant={focusMode ? "default" : "outline"} onClick={() => { setFocusMode((v) => !v); setKanbanView(false); }} className="h-11 shrink-0 rounded-xl" title="Modo de foco (F)">
            <Focus className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Foco</span>
          </Button>
          <Button data-testid="kanban-view-btn" variant={kanbanView ? "default" : "outline"} onClick={() => { setKanbanView((v) => !v); setFocusMode(false); }} className="h-11 shrink-0 rounded-xl" title="Vista Kanban">
            {kanbanView ? <LayoutGrid className="h-4 w-4 sm:mr-2" /> : <KanbanSquare className="h-4 w-4 sm:mr-2" />} <span className="hidden sm:inline">{kanbanView ? "Lista" : "Kanban"}</span>
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
              <div className="flex items-center gap-2 rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
                <Keyboard className="h-3.5 w-3.5" /> Atalhos: <b>N</b> novo · <b>/</b> procurar · <b>F</b> foco
              </div>
              <Button data-testid="clear-filters" variant="ghost" onClick={clearFilters} className="w-full">Limpar filtros</Button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Saved filters / presets */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              data-testid={`preset-${p.key}`}
              onClick={() => setPreset(p.key)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${
                preset === p.key
                  ? "bg-foreground text-background shadow-md shadow-slate-400/40"
                  : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:border-input hover:shadow-md"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Category pills */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          <button data-testid="filter-todos" onClick={() => setCategory("todos")} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-150 active:scale-95 ${category === "todos" ? "bg-foreground text-background shadow-md shadow-slate-400/40" : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md"}`}>Todas as secções</button>
          {CATEGORY_LIST.map((c) => {
            const Icon = c.icon;
            const active = category === c.key;
            return (
              <button key={c.key} data-testid={`filter-${c.key}`} onClick={() => setCategory(c.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${active ? "shadow-md" : "shadow-sm"}`}
                style={{ backgroundColor: active ? c.accent : c.bg, color: active ? "#fff" : c.text, boxShadow: active ? `0 6px 16px -6px ${c.accent}99` : undefined }}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.6} /> {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {!focusMode && !kanbanView && items.length > 0 ? (
            <Checkbox
              data-testid="notes-select-all"
              checked={selected.size > 0 && selected.size === items.length}
              onCheckedChange={toggleSelectAll}
            />
          ) : null}
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="font-mono text-sm tabular-nums text-foreground">{total}</span> pedido{total === 1 ? "" : "s"}
          </p>
        </div>
        {loading ? <Spinner className="h-4 w-4 text-muted-foreground" /> : null}
      </div>

      {/* Seleção em grupo — ações sobre vários pedidos de uma vez */}
      {selected.size > 0 ? (
        <div className="card-elevated mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="text-xs font-bold text-foreground">
            <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-red-600 px-1 font-mono text-[11px] font-black text-white">{selected.size}</span>
            selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button data-testid="bulk-resolve" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkResolve} className="h-8 rounded-lg border-border bg-muted px-2.5 text-xs text-foreground hover:bg-muted hover:text-foreground">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolver
            </Button>
            <Button data-testid="bulk-trash" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkTrash} className="h-8 rounded-lg border-red-200 bg-[var(--pastel-red-bg)] px-2.5 text-xs text-[color:var(--pastel-red-text)] hover:bg-[var(--pastel-red-bg)]">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Mover para a lixeira
            </Button>
            <Button data-testid="bulk-clear" size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="mr-1.5 h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </div>
      ) : null}

      {/* FOCUS MODE — trata um pedido de cada vez */}
      {focusMode ? (
        <div data-testid="focus-panel" className="mt-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Sem pedidos para focar.</div>
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
      ) : kanbanView ? (
        <PedidoKanban items={items} onOpen={openNote} onMove={changeStatus} />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Primeiro carregamento: esqueletos com a silhueta dos cartões
              reais — a grelha nasce estável, sem salto quando os dados chegam. */}
          {loading && items.length === 0
            ? Array.from({ length: 6 }).map((_, i) => <PedidoCardSkeleton key={`sk-${i}`} index={i} />)
            : null}
          <AnimatePresence mode="popLayout">
            {items.map((note) => (
              <PedidoCard
                key={note.id} note={note} onOpen={openNote} actions={actions}
                selected={selected.has(note.id)} onToggleSelect={() => toggleSelect(note.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!loading && items.length === 0 && !focusMode && !kanbanView ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-float-slow rounded-3xl bg-muted/60 blur-xl" />
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg ${seg.iconAccent}`}>
                <SegIcon className="h-7 w-7" />
              </div>
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-foreground">Sem pedidos nesta área</EmptyTitle>
            <EmptyDescription className="text-muted-foreground">{seg.empty}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-lg shadow-slate-400/40 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95">
              <Plus className="h-4 w-4" strokeWidth={2.6} /> Criar o primeiro pedido
            </button>
          </EmptyContent>
        </Empty>
      ) : null}

      {/* Portal para o <body>: o botão + fica fora do wrapper com a animação
          de entrada de página (.animate-page-enter). Assim, o seu
          "position: fixed" prende-se sempre à janela do browser — nunca a um
          ancestral com transform/filter — e mantém-se visível em qualquer
          scroll, seja qual for a altura da lista. */}
      {createPortal(
        <button data-testid="fab-new-note" onClick={openNew} aria-label="Criar novo pedido" title="Criar novo pedido (N)" className="os-page-fab group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-[0_16px_35px_-8px_rgba(217,38,38,0.5)] ring-1 ring-white/15 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_50px_-8px_rgba(217,38,38,0.6)] active:scale-95 lg:h-16 lg:w-16">
          <Plus className="h-7 w-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
        </button>,
        document.body,
      )}

      <PedidoDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        noteId={detailNoteId}
        initialTab={detailInitialTab}
        initialCreateMode={detailCreateMode}
        suppliers={suppliers}
        gmailStatus={gmailStatus}
        labelsList={labels}
        onChanged={reloadAll}
      />

      <ConfirmSendDialog
        open={!!confirmNote}
        onOpenChange={(v) => { if (!v) setConfirmNote(null); }}
        note={confirmNote}
        onDone={reloadAll}
      />
    </div>
  );
}

function FocusCard({ note, index, total, onPrev, onNext, onOpen, onExit, actions }) {
  const c = getCategory(note.category);
  const st = getStatusCfg(note.status);
  const pr = getPriorityCfg(note.priority);
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg shadow-slate-200/60">
      <div className="flex items-center justify-between border-b border-border bg-muted/70 px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <Focus className="h-4 w-4" /> Modo de foco · {index + 1} de {total}
        </div>
        <button data-testid="focus-exit" onClick={onExit} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: pr.bg, color: pr.text }}>{pr.label}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>{c.label}</span>
          {note.is_overdue ? <span className="rounded-full bg-[var(--pastel-red-bg)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--pastel-red-text)]">Parado há {note.waiting_days}d</span> : null}
        </div>
        <h2 className="mt-3 font-heading text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">{note.customer_name || "Sem nome"}</h2>
        {note.phone ? <a href={`tel:${note.phone}`} title="Ligar ao cliente" className="font-mono text-sm text-muted-foreground hover:text-foreground hover:underline">{note.phone}</a> : null}
        <p className="mt-3 text-base text-foreground">{note.description}</p>
        {note.measurements ? <p className="mt-1 font-mono text-sm text-muted-foreground">Medidas: {note.measurements}</p> : null}

        <div className="mt-5 rounded-2xl bg-muted p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Próxima ação sugerida</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{note.next_action || "Concluído"}</p>
          {note.next_status ? (
            <Button data-testid="focus-advance" onClick={() => actions.advance(note)} className="mt-3 w-full rounded-xl">
              <Zap className="mr-2 h-4 w-4" /> {getNextActionCta(note)} <span className="ml-1 opacity-70">(Enter)</span>
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button data-testid="focus-reminder" variant="outline" className="rounded-xl" onClick={() => actions.sendReminder(note)}><Send className="mr-2 h-4 w-4" /> Lembrete</Button>
          <Button data-testid="focus-contact" variant="outline" className="rounded-xl" onClick={() => actions.contactClient(note)}><PhoneCall className="mr-2 h-4 w-4" /> Contactar</Button>
          <Button data-testid="focus-resolve" variant="outline" className="rounded-xl" onClick={() => actions.resolve(note)}><CheckCircle2 className="mr-2 h-4 w-4" /> Resolver</Button>
          <Button data-testid="focus-duplicate" variant="outline" className="rounded-xl" onClick={() => actions.duplicate(note)}><Copy className="mr-2 h-4 w-4" /> Duplicar</Button>
        </div>
        <button data-testid="focus-open" onClick={onOpen} className="mt-3 w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground">Abrir pedido completo →</button>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <Button data-testid="focus-prev" variant="ghost" size="sm" onClick={onPrev} disabled={index === 0}><ArrowLeft className="mr-1 h-4 w-4" /> Anterior</Button>
        <span className="text-xs text-muted-foreground">← → para navegar</span>
        <Button data-testid="focus-next" variant="ghost" size="sm" onClick={onNext} disabled={index === total - 1}>Seguinte <ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  );
}
