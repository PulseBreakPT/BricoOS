import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail, Inbox, Send, FileClock, Search, FileText, RefreshCw,
  CheckCheck, ArrowRight, Truck, User, Paperclip, UserPlus, Reply, Pencil,
  Sparkles, AlertTriangle, ArrowDown, Wand2, X, Archive, ArchiveRestore, Tag,
  BellRing, Forward, BarChart3, FileStack, MessagesSquare,
  MoreHorizontal, ListChecks, Link2,
} from "lucide-react";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { timeAgo, formatDateTime } from "@/lib/pedido";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ConfirmSendDialog from "@/components/ConfirmSendDialog";
import ComposeEmailDialog from "@/components/ComposeEmailDialog";
import EmailTemplatesDialog from "@/components/EmailTemplatesDialog";
import EmailRulesDialog from "@/components/EmailRulesDialog";
import EmailStatsDialog from "@/components/EmailStatsDialog";
import AttachmentPreviewDialog from "@/components/AttachmentPreviewDialog";
import TaskDialog from "@/components/TaskDialog";
import LinkEmailToNoteDialog from "@/components/LinkEmailToNoteDialog";
import { toast } from "sonner";

const PAGE_SIZE = 30;

// Atualização silenciosa em segundo plano: a caixa é verificada
// automaticamente no servidor (IMAP), mas sem isto a página só refletia
// respostas novas depois de recarregar à mão. Sem spinner, sem interromper
// o que o utilizador está a ver (ex.: um email expandido).
function useAutoRefresh(callback, ms = 45000) {
  useEffect(() => {
    const id = setInterval(callback, ms);
    const onFocus = () => callback();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [callback, ms]);
}

// Chip pequeno "recebido de / enviado para", com ícone consoante o tipo.
function KindBadge({ kind }) {
  const map = {
    supplier: { label: "Fornecedor", cls: "bg-blue-50 text-blue-700", icon: Truck },
    client: { label: "Cliente", cls: "bg-emerald-50 text-emerald-700", icon: User },
    other: { label: "Outro", cls: "bg-violet-50 text-violet-700", icon: Mail },
  };
  const cfg = map[kind] || map.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

// Prioridade calculada por IA (alta/normal/baixa) — só se destaca quando
// sai do normal, para não poluir a lista com chips redundantes.
function PriorityBadge({ priority }) {
  if (priority === "alta") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
        <AlertTriangle className="h-3 w-3" /> Urgente
      </span>
    );
  }
  if (priority === "baixa") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
        <ArrowDown className="h-3 w-3" /> Baixa
      </span>
    );
  }
  return null;
}

const CATEGORY_LABELS = {
  orcamento: "Orçamento", reclamacao: "Reclamação", duvida: "Dúvida", urgente: "Urgente", outro: "Outro",
};

// Cada categoria com uma cor própria, para se reconhecerem à distância.
const CATEGORY_STYLES = {
  orcamento: "bg-blue-50 text-blue-700",
  reclamacao: "bg-rose-50 text-rose-700",
  duvida: "bg-purple-50 text-purple-700",
  urgente: "bg-orange-50 text-orange-700",
  outro: "bg-amber-50 text-amber-700",
};

function CategoryBadge({ category }) {
  if (!category || !CATEGORY_LABELS[category]) return null;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <Empty className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 py-14">
      <EmptyMedia>
        <div className="relative">
          <div className="absolute inset-0 animate-float-slow rounded-2xl bg-slate-200/60 blur-lg" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </EmptyMedia>
      <EmptyDescription className="text-sm font-semibold text-slate-500">{text}</EmptyDescription>
    </Empty>
  );
}

// Caixa de entrada — TODOS os emails recebidos, mesmo sem relação com um
// pedido (esses ficam com etiqueta "Sem pedido associado").
function InboxTab({ search, smartQuery, onClearSmart, onForward }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [creatingId, setCreatingId] = useState(null);
  const [replyingId, setReplyingId] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestingId, setSuggestingId] = useState(null);
  const [smartResult, setSmartResult] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [archivedView, setArchivedView] = useState(false);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [labelFilter, setLabelFilter] = useState(null);
  const [labelEditId, setLabelEditId] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [taskDialogFor, setTaskDialogFor] = useState(null);
  const [linkDialogFor, setLinkDialogFor] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLabelOpen, setBulkLabelOpen] = useState(false);
  const [bulkLabel, setBulkLabel] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/inbox", {
        params: { search: search || undefined, limit: PAGE_SIZE, archived: archivedView, label: labelFilter || undefined },
      });
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar a caixa de entrada"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [search, archivedView, labelFilter]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));
  useEffect(() => { api.get("/emails/labels").then(({ data }) => setAvailableLabels(data.items)).catch(() => {}); }, [items]);

  // Pesquisa inteligente: só corre quando o utilizador confirma (Enter), não
  // a cada tecla — cada pesquisa é uma chamada à IA para interpretar o texto.
  useEffect(() => {
    if (!smartQuery) { setSmartResult(null); return; }
    let cancelled = false;
    setSmartLoading(true);
    api.post("/emails/smart-search", { query: smartQuery.q })
      .then(({ data }) => { if (!cancelled) setSmartResult(data); })
      .catch((e) => {
        if (cancelled) return;
        toast.error(getErrorMessage(e, "Não foi possível interpretar a pesquisa"));
        setSmartResult({ items: [], total: 0, interpreted: null });
      })
      .finally(() => { if (!cancelled) setSmartLoading(false); });
    return () => { cancelled = true; };
  }, [smartQuery]);

  const displayItems = smartQuery ? (smartResult?.items || []) : items;
  const displayTotal = smartQuery ? (smartResult?.total || 0) : total;
  const displayLoading = smartQuery ? smartLoading : loading;

  const createNoteFrom = async (m) => {
    setCreatingId(m.id);
    try {
      const { data } = await api.post(`/emails/${m.id}/create-note`);
      toast.success("Pedido criado a partir do email");
      navigate(`/?open=${data.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar o pedido"));
    } finally {
      setCreatingId(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/emails/sync");
      const parts = [];
      if (data.new_received) parts.push(`${data.new_received} recebido(s)`);
      if (data.new_sent) parts.push(`${data.new_sent} enviado(s) pelo Gmail`);
      toast.success(parts.length ? `Sincronizado: ${parts.join(" · ")}` : "Caixa de entrada e enviados verificados — sem novidades");
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível verificar a caixa de entrada"));
    } finally {
      setSyncing(false);
    }
  };

  const markAllSeen = async () => {
    try {
      await api.post("/emails/seen-all");
      await load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const openItem = async (m) => {
    if (!m.seen) { try { await api.post(`/emails/${m.id}/seen`); setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, seen: true } : x))); } catch { /* segue */ } }
    setExpanded((cur) => (cur === m.id ? null : m.id));
    setReplyingId(null);
  };

  const startReply = (id) => { setReplyingId(id); setReplyBody(""); };

  const suggestReply = async (m) => {
    setSuggestingId(m.id);
    try {
      const { data } = await api.post(`/emails/${m.id}/suggest-reply`);
      setReplyBody(data.suggestion || "");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível gerar uma sugestão"));
    } finally {
      setSuggestingId(null);
    }
  };

  const sendReply = async (m) => {
    if (!replyBody.trim()) return;
    setSendingReply(true);
    try {
      await api.post(`/emails/${m.id}/reply`, { body: replyBody });
      toast.success(`Resposta enviada a ${m.from_email}`);
      setReplyingId(null);
      setReplyBody("");
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar a resposta"));
    } finally {
      setSendingReply(false);
    }
  };

  const toggleArchive = async (m) => {
    setBusyId(m.id);
    try {
      await api.post(`/emails/${m.id}/archive`);
      toast.success(m.archived ? "Email restaurado para a caixa de entrada" : "Email arquivado");
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível arquivar"));
    } finally {
      setBusyId(null);
    }
  };

  const startEditLabels = (m) => { setLabelEditId(m.id); setLabelDraft((m.labels || []).join(", ")); };

  const saveLabels = async (m) => {
    const labels = labelDraft.split(",").map((l) => l.trim()).filter(Boolean);
    try {
      await api.post(`/emails/${m.id}/labels`, { labels });
      setLabelEditId(null);
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar as etiquetas"));
    }
  };

  const openTaskDialog = (m) => {
    const who = m.supplier_name || m.from_name || m.from_email;
    const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    setTaskDialogFor({
      title: `Seguir email de ${who}: ${m.subject || "(sem assunto)"}`.slice(0, 200),
      category: "construcao",
      priority: "media",
      due_date: dueDate,
      repeat: "none",
      subtasks: [],
      note_id: m.note_id || "",
    });
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === displayItems.length ? new Set() : new Set(displayItems.map((m) => m.id))));
  };

  const bulkArchive = async () => {
    setBulkBusy(true);
    try {
      await api.post("/emails/bulk-archive", { ids: [...selected], archived: !archivedView });
      toast.success(archivedView ? "Emails restaurados para a caixa de entrada" : "Emails arquivados");
      clearSelection();
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível arquivar os emails selecionados"));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkMarkSeen = async () => {
    setBulkBusy(true);
    try {
      await api.post("/emails/bulk-seen", { ids: [...selected] });
      toast.success("Emails marcados como vistos");
      clearSelection();
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível marcar como vistos"));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkApplyLabel = async () => {
    if (!bulkLabel.trim()) return;
    setBulkBusy(true);
    try {
      await api.post("/emails/bulk-label", { ids: [...selected], label: bulkLabel.trim() });
      toast.success("Etiqueta aplicada aos emails selecionados");
      setBulkLabel("");
      setBulkLabelOpen(false);
      clearSelection();
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível aplicar a etiqueta"));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {displayItems.length > 0 ? (
            <Checkbox
              data-testid="inbox-select-all"
              checked={selected.size > 0 && selected.size === displayItems.length}
              onCheckedChange={toggleSelectAll}
            />
          ) : null}
          <p className="text-sm text-slate-500">{displayTotal} email{displayTotal === 1 ? "" : "s"} {smartQuery ? "encontrado(s) pela pesquisa IA" : archivedView ? "no arquivo" : "na caixa de entrada"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!smartQuery ? (
            <Button data-testid="emails-toggle-archived" size="sm" variant={archivedView ? "default" : "outline"} onClick={() => setArchivedView((v) => !v)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
              {archivedView ? <ArchiveRestore className="h-3.5 w-3.5 sm:mr-1.5" /> : <Archive className="h-3.5 w-3.5 sm:mr-1.5" />}
              <span className="hidden sm:inline">{archivedView ? "Ver caixa de entrada" : "Ver arquivo"}</span>
            </Button>
          ) : null}
          <Button data-testid="emails-mark-all-seen" size="sm" variant="outline" onClick={markAllSeen} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
            <CheckCheck className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Marcar tudo como visto</span>
          </Button>
          <Button data-testid="emails-sync" size="sm" variant="outline" disabled={syncing} onClick={sync} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
            {syncing ? <Spinner className="h-3.5 w-3.5 sm:mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />} <span className="hidden sm:inline">Verificar agora</span>
          </Button>
        </div>
      </div>

      {!smartQuery && availableLabels.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-slate-400" />
          {availableLabels.map((l) => (
            <button key={l} data-testid={`label-filter-${l}`} onClick={() => setLabelFilter((cur) => (cur === l ? null : l))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${labelFilter === l ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="card-elevated mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-xs font-bold text-slate-900"><span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-red-600 px-1 font-mono text-[11px] font-black text-white">{selected.size}</span> selecionado{selected.size === 1 ? "" : "s"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button data-testid="bulk-seen" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkMarkSeen} className="h-8 rounded-lg border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              <CheckCheck className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Marcar visto</span>
            </Button>
            <Button data-testid="bulk-archive" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkArchive} className="h-8 rounded-lg border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              {archivedView ? <ArchiveRestore className="h-3.5 w-3.5 sm:mr-1.5" /> : <Archive className="h-3.5 w-3.5 sm:mr-1.5" />} <span className="hidden sm:inline">{archivedView ? "Restaurar" : "Arquivar"}</span>
            </Button>
            <Button data-testid="bulk-label-toggle" size="sm" variant="outline" disabled={bulkBusy} onClick={() => setBulkLabelOpen((v) => !v)} className="h-8 rounded-lg border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              <Tag className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Etiqueta</span>
            </Button>
            <Button data-testid="bulk-clear" size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {bulkLabelOpen ? (
            <div className="mt-1 flex w-full items-center gap-2">
              <Input
                data-testid="bulk-label-input"
                value={bulkLabel}
                onChange={(e) => setBulkLabel(e.target.value)}
                placeholder="nome da etiqueta"
                className="h-8 max-w-xs text-xs text-slate-900"
              />
              <Button data-testid="bulk-label-apply" size="sm" disabled={bulkBusy || !bulkLabel.trim()} onClick={bulkApplyLabel} className="h-8 rounded-lg text-xs">
                Aplicar
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {smartQuery ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-700">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {smartResult?.interpreted ? (
            <span>
              Interpretado como: {[
                smartResult.interpreted.keyword && `"${smartResult.interpreted.keyword}"`,
                smartResult.interpreted.contact && `de ${smartResult.interpreted.contact}`,
                smartResult.interpreted.category && CATEGORY_LABELS[smartResult.interpreted.category],
                smartResult.interpreted.date_from && `desde ${smartResult.interpreted.date_from}`,
                smartResult.interpreted.date_to && `até ${smartResult.interpreted.date_to}`,
              ].filter(Boolean).join(" · ") || "sem filtros específicos"}
            </span>
          ) : <span>Pesquisa por "{smartQuery.q}"</span>}
          <button onClick={onClearSmart} className="ml-auto inline-flex items-center gap-0.5 font-bold hover:underline">
            <X className="h-3 w-3" /> Limpar
          </button>
        </div>
      ) : null}

      {displayLoading ? (
        <div className="mt-10 flex justify-center"><Spinner className="h-5 w-5 text-slate-400" /></div>
      ) : displayItems.length === 0 ? (
        <EmptyState icon={smartQuery ? Sparkles : Inbox} text={smartQuery ? "Sem resultados para esta pesquisa." : "Sem emails na caixa de entrada."} />
      ) : (
        <div className="mt-3 space-y-2">
          {displayItems.map((m) => (
            <div key={m.id} data-testid={`inbox-email-${m.id}`} className={`flex items-start gap-2 rounded-xl border p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${m.seen ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/40"}`}>
              <Checkbox
                data-testid={`inbox-select-${m.id}`}
                checked={selected.has(m.id)}
                onCheckedChange={() => toggleSelect(m.id)}
                className="mt-2.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
              <button onClick={() => openItem(m)} className="flex w-full items-start gap-3 text-left">
                {!m.seen ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" /> : <span className="mt-1.5 h-2 w-2 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900">{m.supplier_name || m.from_name || m.from_email}</span>
                    {m.matched ? <KindBadge kind={m.reply_kind || "supplier"} /> : <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">Sem pedido associado</span>}
                    <PriorityBadge priority={m.priority} />
                    <CategoryBadge category={m.category} />
                    {m.has_pdf ? <FileText className="h-3.5 w-3.5 text-red-500" title="Com PDF em anexo" /> : null}
                    {(m.labels || []).map((l) => (
                      <span key={l} className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <Tag className="h-2.5 w-2.5" /> {l}
                      </span>
                    ))}
                  </div>
                  <p className="truncate text-xs text-slate-500">{m.subject || "(sem assunto)"}</p>
                  {m.ai_summary ? <p className="mt-0.5 truncate text-[11px] italic text-violet-600">{m.ai_summary}</p> : null}
                  <p className="mt-0.5 text-[11px] text-slate-400">{m.from_email} · {timeAgo(m.received_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{m.body || "(sem texto)"}</pre>
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => (
                        <button key={a.id} type="button"
                          onClick={() => setPreviewAttachment({ url: withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`), filename: a.filename })}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-700">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {m.note_id ? (
                      <button onClick={() => navigate(`/?open=${m.note_id}&tab=${m.reply_kind === "client" ? "cronologia" : "orcamentos"}`)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                        Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <>
                        {!m.matched ? (
                          <Button
                            data-testid={`inbox-create-note-${m.id}`}
                            size="sm"
                            disabled={creatingId === m.id}
                            onClick={() => createNoteFrom(m)}
                            className="h-8 rounded-lg text-xs"
                          >
                            {creatingId === m.id ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                            Criar pedido<span className="hidden sm:inline"> a partir deste email</span>
                          </Button>
                        ) : null}
                        <Button
                          data-testid={`inbox-link-note-${m.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => setLinkDialogFor(m)}
                          className="h-8 rounded-lg text-xs"
                        >
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                          Associar a pedido<span className="hidden sm:inline"> existente</span>
                        </Button>
                      </>
                    )}
                    {replyingId !== m.id ? (
                      <Button
                        data-testid={`inbox-reply-${m.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => startReply(m.id)}
                        className="h-8 rounded-lg text-xs"
                      >
                        <Reply className="mr-1.5 h-3.5 w-3.5" /> Responder
                      </Button>
                    ) : null}
                    <Button data-testid={`inbox-forward-${m.id}`} size="sm" variant="outline" onClick={() => onForward(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3" title="Reencaminhar">
                      <Forward className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Reencaminhar</span>
                    </Button>
                    <Button data-testid={`inbox-task-${m.id}`} size="sm" variant="outline" onClick={() => openTaskDialog(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3" title="Criar tarefa a partir deste email">
                      <ListChecks className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Criar tarefa</span>
                    </Button>
                    <Button data-testid={`inbox-archive-${m.id}`} size="sm" variant="outline" disabled={busyId === m.id} onClick={() => toggleArchive(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3" title={m.archived ? "Restaurar" : "Arquivar"}>
                      {m.archived ? <ArchiveRestore className="h-3.5 w-3.5 sm:mr-1.5" /> : <Archive className="h-3.5 w-3.5 sm:mr-1.5" />}
                      <span className="hidden sm:inline">{m.archived ? "Restaurar" : "Arquivar"}</span>
                    </Button>
                    {labelEditId !== m.id ? (
                      <Button data-testid={`inbox-labels-${m.id}`} size="sm" variant="outline" onClick={() => startEditLabels(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3" title="Etiquetas">
                        <Tag className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Etiquetas</span>
                      </Button>
                    ) : null}
                  </div>
                  {labelEditId === m.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        data-testid={`inbox-labels-input-${m.id}`}
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        placeholder="etiquetas separadas por vírgula"
                        className="h-8 max-w-xs text-xs"
                      />
                      <Button size="sm" onClick={() => saveLabels(m)} className="h-8 rounded-lg text-xs">Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLabelEditId(null)} className="h-8 rounded-lg text-xs">Cancelar</Button>
                    </div>
                  ) : null}
                  {replyingId === m.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        data-testid={`inbox-reply-body-${m.id}`}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={`Responder a ${m.from_email}...`}
                        rows={4}
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          data-testid={`inbox-reply-send-${m.id}`}
                          size="sm"
                          disabled={sendingReply || !replyBody.trim()}
                          onClick={() => sendReply(m)}
                          className="h-8 rounded-lg text-xs"
                        >
                          {sendingReply ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                          Enviar<span className="hidden sm:inline"> resposta</span>
                        </Button>
                        <Button
                          data-testid={`inbox-reply-suggest-${m.id}`}
                          size="sm"
                          variant="outline"
                          disabled={sendingReply || suggestingId === m.id}
                          onClick={() => suggestReply(m)}
                          className="h-8 rounded-lg border-violet-200 text-xs text-violet-700 hover:bg-violet-50"
                        >
                          {suggestingId === m.id ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                          Sugerir<span className="hidden sm:inline"> com IA</span>
                        </Button>
                        <Button size="sm" variant="ghost" disabled={sendingReply} onClick={() => setReplyingId(null)} className="h-8 rounded-lg text-xs">
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <AttachmentPreviewDialog open={!!previewAttachment} onOpenChange={(v) => !v && setPreviewAttachment(null)} attachment={previewAttachment} />
      <TaskDialog
        open={!!taskDialogFor}
        onOpenChange={(v) => !v && setTaskDialogFor(null)}
        task={taskDialogFor}
        onSaved={() => setTaskDialogFor(null)}
      />
      <LinkEmailToNoteDialog
        email={linkDialogFor}
        onOpenChange={(v) => !v && setLinkDialogFor(null)}
        onLinked={() => { setLinkDialogFor(null); load({ silent: true }); }}
      />
    </div>
  );
}

// Enviados — fornecedores, clientes e outros; um único registo por envio,
// independentemente de estar ligado a um pedido.
function SentTab({ search }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      if (awaitingOnly) {
        const { data } = await api.get("/emails/awaiting-reply", { params: { days: 3 } });
        let its = data.items;
        if (kind !== "todos") its = its.filter((m) => m.kind === kind);
        if (search) {
          const q = search.toLowerCase();
          its = its.filter((m) => `${m.to} ${m.to_label} ${m.subject}`.toLowerCase().includes(q));
        }
        setItems(its); setTotal(its.length);
      } else {
        const { data } = await api.get("/emails/sent", {
          params: { search: search || undefined, kind: kind === "todos" ? undefined : kind, limit: PAGE_SIZE },
        });
        setItems(data.items); setTotal(data.total);
      }
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar os emails enviados"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [search, kind, awaitingOnly]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {total} email{total === 1 ? "" : "s"} {awaitingOnly ? "sem resposta há mais de 3 dias" : "enviado" + (total === 1 ? "" : "s")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[["todos", "Todos"], ["supplier", "Fornecedores"], ["client", "Clientes"]].map(([k, label]) => (
            <button key={k} data-testid={`sent-filter-${k}`} onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${kind === k ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
          <button data-testid="sent-awaiting-toggle" onClick={() => setAwaitingOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${awaitingOnly ? "bg-amber-500 text-white" : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
            <BellRing className="h-3 w-3" /> Aguardam resposta
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center"><Spinner className="h-5 w-5 text-slate-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={awaitingOnly ? BellRing : Send} text={awaitingOnly ? "Tudo respondido — sem emails à espera." : "Sem emails enviados."} />
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((m) => (
            <div key={m.id} data-testid={`sent-email-${m.id}`} className="rounded-xl border border-slate-200 bg-white p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <button onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900">{m.to_label || m.to}</span>
                    <KindBadge kind={m.kind} />
                    {m.source === "gmail" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600" title="Sincronizado da pasta Enviados do Gmail">
                        <Mail className="h-2.5 w-2.5" /> Gmail
                      </span>
                    ) : null}
                    {(m.attachments || []).length > 0 ? <Paperclip className="h-3.5 w-3.5 text-slate-400" title="Com anexo" /> : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{m.subject || "(sem assunto)"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{m.to} · {timeAgo(m.sent_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{m.body || "(sem texto)"}</pre>
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a, i) => (
                        m.note_id && m.pdf_file_id ? (
                          <button key={i} type="button"
                            onClick={() => setPreviewAttachment({ url: withDeviceToken(`${API}/notes/${m.note_id}/files/${m.pdf_file_id}`), filename: a.filename })}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-700">
                            <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                          </button>
                        ) : (
                          <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                            <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                          </span>
                        )
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[11px] text-slate-400">{formatDateTime(m.sent_at)}</p>
                  {m.note_id ? (
                    <button onClick={() => navigate(`/?open=${m.note_id}&tab=cronologia`)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                      Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <AttachmentPreviewDialog open={!!previewAttachment} onOpenChange={(v) => !v && setPreviewAttachment(null)} attachment={previewAttachment} />
    </div>
  );
}

// Conversas — agrupa recebidos+enviados do mesmo pedido/contacto numa
// única linha do tempo, em vez de duas listas separadas.
function ThreadsTab({ search }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/threads");
      setThreads(data.items);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar as conversas"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  const openThread = async (t) => {
    if (openKey === t.key) { setOpenKey(null); return; }
    setOpenKey(t.key);
    setLoadingThread(true);
    try {
      const { data } = await api.get("/emails/threads/view", { params: { key: t.key } });
      setMessages(data.items);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível abrir a conversa"));
    } finally {
      setLoadingThread(false);
    }
  };

  const filtered = search
    ? threads.filter((t) => (t.label || "").toLowerCase().includes(search.toLowerCase()) || (t.last_preview || "").toLowerCase().includes(search.toLowerCase()))
    : threads;

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">{filtered.length} conversa{filtered.length === 1 ? "" : "s"}</p>
      {loading ? (
        <div className="mt-10 flex justify-center"><Spinner className="h-5 w-5 text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessagesSquare} text="Sem conversas ainda." />
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((t) => (
            <div key={t.key} data-testid={`thread-${t.key}`} className="rounded-xl border border-slate-200 bg-white p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <button onClick={() => openThread(t)} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900">{t.label || "(sem nome)"}</span>
                    {t.unseen > 0 ? <span className="inline-flex rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{t.unseen} nova(s)</span> : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{t.last_preview || "(sem texto)"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{t.count} mensagem{t.count === 1 ? "" : "s"} · {timeAgo(t.last_at)}</p>
                </div>
              </button>
              {openKey === t.key ? (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {loadingThread ? (
                    <div className="flex justify-center py-4"><Spinner className="h-4 w-4 text-slate-400" /></div>
                  ) : messages.length === 0 ? (
                    <p className="py-2 text-center text-xs text-slate-400">Sem mensagens.</p>
                  ) : messages.map((m, i) => (
                    <div key={i} className={`rounded-lg p-2.5 text-xs ${m.direction === "out" ? "ml-6 bg-emerald-50" : "mr-6 bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-700">{m.direction === "out" ? `Enviado a ${m.to_label || m.to}` : `Recebido de ${m.supplier_name || m.from_name || m.from_email}`}</span>
                        <span className="shrink-0 text-slate-400">{formatDateTime(m.at)}</span>
                      </div>
                      <p className="mt-1 truncate text-slate-500">{m.subject || "(sem assunto)"}</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-600">{(m.body || "").slice(0, 400)}</p>
                    </div>
                  ))}
                  {t.note_id ? (
                    <button onClick={() => navigate(`/?open=${t.note_id}&tab=cronologia`)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                      Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rascunhos — orçamentos preparados (automática ou manualmente) que ainda
// aguardam confirmação. Reutiliza o mesmo ecrã de confirmação da ficha do pedido.
function DraftsTab({ search }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmNote, setConfirmNote] = useState(null);

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/drafts");
      setItems(data.items);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar os rascunhos"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  const filtered = (search
    ? items.filter((n) => `${n.customer_name} ${n.pending_client_send?.subject} ${n.pending_client_send?.to}`.toLowerCase().includes(search.toLowerCase()))
    : items
  // O mais antigo primeiro: o que está há mais tempo por confirmar é o que
  // mais precisa de atenção, não o que acabou de chegar.
  ).slice().sort((a, b) => (a.pending_client_send?.created_at || "").localeCompare(b.pending_client_send?.created_at || ""));

  const isStale = (iso) => iso && (Date.now() - new Date(iso).getTime()) > 24 * 60 * 60 * 1000;

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">{filtered.length} rascunho{filtered.length === 1 ? "" : "s"} por confirmar</p>

      {loading ? (
        <div className="mt-10 flex justify-center"><Spinner className="h-5 w-5 text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileClock} text="Sem rascunhos por enviar." />
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((n) => {
            const p = n.pending_client_send;
            return (
              <button key={n.id} data-testid={`draft-email-${n.id}`} onClick={() => setConfirmNote(n)}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-left transition-colors hover:bg-emerald-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
                    {isStale(p?.created_at) ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Há mais de 24h</span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-600">{p?.subject}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {p?.pdf_filename ? `${p.pdf_filename} · ` : ""}
                    {p?.total != null ? `${Number(p.total).toFixed(2)} € c/ IVA · ` : ""}
                    {timeAgo(p?.created_at)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                  <Send className="h-3.5 w-3.5" /> Rever e enviar
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ConfirmSendDialog
        open={!!confirmNote}
        onOpenChange={(v) => { if (!v) setConfirmNote(null); }}
        note={confirmNote}
        onDone={load}
      />
    </div>
  );
}

export default function Emails() {
  const [tab, setTab] = useState("inbox");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [sentKey, setSentKey] = useState(0);
  const [smartOn, setSmartOn] = useState(false);
  const [smartQuery, setSmartQuery] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const runSmartSearch = () => {
    if (!search.trim()) return;
    setSmartQuery({ q: search.trim() });
  };

  const toggleSmart = () => {
    setSmartOn((v) => !v);
    setSmartQuery(null);
  };

  const openForward = (m) => {
    setForwardTarget({
      emailId: m.id, subject: m.subject, body: m.body,
      attachmentsCount: (m.attachments || []).length,
    });
    setComposeOpen(true);
  };

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="kicker">Toda a atividade de email</p>
          <h1 className="mt-0.5 flex items-center gap-2.5 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-black text-white shadow-lg shadow-slate-400/30 sm:h-11 sm:w-11">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            Emails
          </h1>
          <p className="text-sm text-slate-500">
            Caixa de entrada completa, enviados e rascunhos por confirmar — mesmo sem relação com um pedido registado.
          </p>
        </div>
        <div className="mt-2 flex shrink-0 gap-2 sm:mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="emails-more-btn" variant="outline" className="h-10 shrink-0 rounded-xl px-3" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="emails-stats-btn" onClick={() => setStatsOpen(true)}>
                <BarChart3 className="mr-2 h-4 w-4" /> Estatísticas
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="emails-rules-btn" onClick={() => setRulesOpen(true)}>
                <Wand2 className="mr-2 h-4 w-4" /> Regras
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="emails-templates-btn" onClick={() => setTemplatesOpen(true)}>
                <FileStack className="mr-2 h-4 w-4" /> Modelos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button data-testid="emails-compose-btn" onClick={() => { setForwardTarget(null); setComposeOpen(true); }} className="h-10 flex-1 rounded-xl shadow-lg shadow-slate-400/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:flex-none">
            <Pencil className="mr-1.5 h-4 w-4" /> Novo email
          </Button>
        </div>
      </div>

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={(v) => { setComposeOpen(v); if (!v) setForwardTarget(null); }}
        forward={forwardTarget}
        onSent={() => { setTab("sent"); setSentKey((k) => k + 1); }}
      />
      <EmailTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <EmailRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      <EmailStatsDialog open={statsOpen} onOpenChange={setStatsOpen} />

      <div className="mt-4 flex gap-2">
        <InputGroup className="h-11 flex-1 rounded-xl">
          <InputGroupAddon>
            <Search className="h-4 w-4 text-slate-400" />
          </InputGroupAddon>
          <InputGroupInput
            data-testid="emails-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (smartOn) setSmartQuery(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && smartOn && tab === "inbox") { e.preventDefault(); runSmartSearch(); } }}
            placeholder={smartOn && tab === "inbox" ? 'Pergunta em linguagem natural e prime Enter — ex.: "emails do fornecedor X esta semana"' : "Procurar por remetente, destinatário ou assunto..."}
          />
        </InputGroup>
        {tab === "inbox" ? (
          <Button
            data-testid="emails-smart-toggle"
            type="button"
            variant={smartOn ? "default" : "outline"}
            onClick={toggleSmart}
            className={`h-11 shrink-0 rounded-xl px-3 ${smartOn ? "bg-violet-600 hover:bg-violet-700" : "text-violet-700"}`}
            title="Pesquisa inteligente com IA"
          >
            <Sparkles className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Pesquisa IA</span>
          </Button>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="card-elevated grid h-11 w-full grid-cols-4 rounded-xl border border-slate-200 bg-white p-1 text-slate-500 [&_[data-state=active]]:bg-slate-900 [&_[data-state=active]]:text-white [&_[data-state=active]]:shadow-md [&_[data-state=active]]:shadow-slate-400/30">
          <TabsTrigger value="inbox" data-testid="emails-tab-inbox" className="rounded-lg font-bold"><Inbox className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Recebidos</span></TabsTrigger>
          <TabsTrigger value="sent" data-testid="emails-tab-sent" className="rounded-lg font-bold"><Send className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Enviados</span></TabsTrigger>
          <TabsTrigger value="threads" data-testid="emails-tab-threads" className="rounded-lg font-bold"><MessagesSquare className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Conversas</span></TabsTrigger>
          <TabsTrigger value="drafts" data-testid="emails-tab-drafts" className="rounded-lg font-bold"><FileClock className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Rascunhos</span></TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="focus-visible:outline-none">
          <InboxTab search={debounced} smartQuery={smartOn ? smartQuery : null} onClearSmart={() => setSmartQuery(null)} onForward={openForward} />
        </TabsContent>
        <TabsContent value="sent" className="focus-visible:outline-none"><SentTab key={sentKey} search={debounced} /></TabsContent>
        <TabsContent value="threads" className="focus-visible:outline-none"><ThreadsTab search={debounced} /></TabsContent>
        <TabsContent value="drafts" className="focus-visible:outline-none"><DraftsTab search={debounced} /></TabsContent>
      </Tabs>
    </div>
  );
}
