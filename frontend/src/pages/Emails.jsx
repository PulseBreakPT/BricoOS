import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Mail, Inbox, Send, FileClock, Search, FileText, RefreshCw,
  CheckCheck, ArrowRight, Truck, User, Paperclip, UserPlus, Reply, Pencil,
  Sparkles, AlertTriangle, ArrowDown, Wand2, X,
  BellRing, Forward, BarChart3, FileStack, MessagesSquare,
  MoreHorizontal, ListChecks, Link2, Unlink2, FileDiff, Check, Trash2, MailPlus, Zap,
} from "lucide-react";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { timeAgo, formatDateTime, getStatusCfg } from "@/lib/pedido";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { ListSkeleton } from "@/components/LoadingSkeletons";
import TaskDialog from "@/components/TaskDialog";
import LinkEmailToNoteDialog from "@/components/LinkEmailToNoteDialog";
import KnowledgeArticleDialog from "@/components/KnowledgeArticleDialog";
import { toast } from "sonner";

// Estado de processamento do Correio Semanal por email (ver
// GET /emails/correio-semanal/status) — um só sítio a mapear estado →
// ícone/texto, reaproveitado na linha expandida da caixa de entrada.
const CSN_STATUS_META = {
  nao_processado: { icon: "⚪", label: "Nunca processado", action: "Processar para o Correio Semanal" },
  processado: { icon: "🟢", label: "Processado", action: "Atualizar artigo" },
  desatualizado: { icon: "🟡", label: "Motor antigo", action: "Atualizar artigo" },
  erro: { icon: "🔴", label: "Erro no processamento", action: "Tentar novamente" },
};

function CorreioSemanalStatusPanel({ status, busy, onProcess, onOpenArticle }) {
  const meta = CSN_STATUS_META[status.status] || CSN_STATUS_META.nao_processado;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        {meta.icon} Correio Semanal: {meta.label}
      </span>
      {status.status === "erro" && status.error_message ? (
        <span className="text-[11px] text-[color:var(--pastel-red-text)]">{status.error_message}</span>
      ) : null}
      <div className="ml-auto flex items-center gap-1.5">
        {status.article_id ? (
          <Button
            data-testid={`csn-open-article-${status.email_id}`}
            size="sm" variant="outline" onClick={() => onOpenArticle(status.article_id)}
            className="h-7 rounded-lg px-2.5 text-xs"
          >
            Ver no Correio Semanal
          </Button>
        ) : null}
        <Button
          data-testid={`csn-process-${status.email_id}`}
          size="sm" variant="outline" disabled={busy} onClick={onProcess}
          className="h-7 rounded-lg px-2.5 text-xs"
        >
          {busy ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
          {meta.action}
        </Button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 30;

// Atualização silenciosa em segundo plano: a caixa é verificada
// automaticamente no servidor (IMAP), mas sem isto a página só refletia
// respostas novas depois de recarregar à mão. Sem spinner, sem interromper
// o que o utilizador está a ver (ex.: um email expandido).
function useAutoRefresh(callback, ms = 45000) {
  useEffect(() => {
    // Só vale a pena verificar se a aba estiver mesmo visível — poupa
    // pedidos ao servidor quando a app fica horas ao fundo numa aba esquecida.
    const tick = () => { if (document.visibilityState === "visible") callback(); };
    const id = setInterval(tick, ms);
    window.addEventListener("focus", tick);
    return () => { clearInterval(id); window.removeEventListener("focus", tick); };
  }, [callback, ms]);
}

// Chip pequeno "recebido de / enviado para", com ícone consoante o tipo.
function KindBadge({ kind }) {
  const map = {
    supplier: { label: "Fornecedor", cls: "bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]", icon: Truck },
    client: { label: "Cliente", cls: "bg-[var(--pastel-emerald-bg)] text-[color:var(--pastel-emerald-text)]", icon: User },
    other: { label: "Outro", cls: "bg-[var(--pastel-violet-bg)] text-[color:var(--pastel-violet-text)]", icon: Mail },
  };
  const cfg = map[kind] || map.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {cfg.label}
    </span>
  );
}

// Prioridade calculada por IA (alta/normal/baixa) — só se destaca quando
// sai do normal, para não poluir a lista com chips redundantes.
function PriorityBadge({ priority }) {
  if (priority === "alta") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-red-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-red-text)]">
        <AlertTriangle className="h-3.5 w-3.5" /> Urgente
      </span>
    );
  }
  if (priority === "baixa") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-green-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-green-text)]">
        <ArrowDown className="h-3.5 w-3.5" /> Baixa
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
  orcamento: "bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]",
  reclamacao: "bg-[var(--pastel-rose-bg)] text-[color:var(--pastel-rose-text)]",
  duvida: "bg-[var(--pastel-purple-bg)] text-[color:var(--pastel-purple-text)]",
  urgente: "bg-[var(--pastel-orange-bg)] text-[color:var(--pastel-orange-text)]",
  outro: "bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)]",
};

function CategoryBadge({ category }) {
  if (!category || !CATEGORY_LABELS[category]) return null;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// Corpo do email: quando o backend conseguiu extrair a versão HTML original
// (sanitizada — negrito, listas, parágrafos, ligações), mostra-a formatada;
// senão cai para o texto simples, tal como antes.
const EMAIL_BODY_CLS = "max-h-72 overflow-y-auto rounded-lg bg-muted p-3 text-xs text-foreground "
  + "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-blue-600 [&_a]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 "
  + "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:my-1 [&_blockquote]:border-l-2 "
  + "[&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_table]:my-1 "
  + "[&_td]:border [&_td]:border-border [&_td]:p-1 [&_th]:border [&_th]:border-border [&_th]:p-1 "
  + "[&_hr]:my-2 [&_hr]:border-border";

function EmailBody({ html, text }) {
  if (html) {
    return <div className={`${EMAIL_BODY_CLS} font-sans`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <pre className={`${EMAIL_BODY_CLS} whitespace-pre-wrap font-sans`}>{text || "(sem texto)"}</pre>;
}

function EmptyState({ icon: Icon, text }) {
  return (
    <Empty className="mt-4 rounded-2xl border-2 border-dashed border-border bg-card/60 py-14">
      <EmptyMedia>
        <div className="relative">
          <div className="absolute inset-0 animate-float-slow rounded-2xl bg-muted/60 blur-lg" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </EmptyMedia>
      <EmptyDescription className="text-sm font-semibold text-muted-foreground">{text}</EmptyDescription>
    </Empty>
  );
}

const ANEXOS_CATEGORY_LABELS = {
  tabela_precos: "tabela(s) de preços", nota_encomenda: "nota(s) de encomenda",
  incidencia: "incidência(s)", lista_limpeza: "lista(s) de limpeza",
  dossier_gama: "dossier(s) de gama", planograma: "planograma(s)",
  campanha: "campanha(s)", catalogo: "catálogo(s)", outro: "outro(s)",
  informativo: "informativo(s)", tecnico: "técnico(s)",
};

const SEVERITY_BADGE_CFG = {
  critico: { label: "Crítico", cls: "bg-[var(--pastel-red-bg)] text-[color:var(--pastel-red-text)]" },
  urgente: { label: "Urgente", cls: "bg-[var(--pastel-orange-bg)] text-[color:var(--pastel-orange-text)]" },
  importante: { label: "Importante", cls: "bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)]" },
  informacao: { label: "Informação", cls: "bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]" },
  arquivo: { label: "Arquivo", cls: "bg-muted text-muted-foreground" },
};

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_BADGE_CFG[severity];
  if (!cfg) return null;
  return <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold 3xl:text-[11px] ${cfg.cls}`}>{cfg.label}</span>;
}

// Uma linha de tarefa sugerida — 3 formas conforme t.kind: "task" simples
// (Aceitar/Dispensar), "email_draft" (+ link mailto para o rascunho) e
// "new_category_suggestion" (pede o nome da categoria antes de aceitar —
// ver classification_rules.py: um tipo de documento que se repete sem
// bater com nenhuma categoria conhecida chega aqui para um humano decidir
// o nome; a partir daí fica gravado na base de dados, nunca no código).
function SuggestedTaskRow({ task, busy, onAccept, onDismiss, testId }) {
  const [categoryName, setCategoryName] = useState("");
  if (task.kind === "new_category_suggestion") {
    return (
      <div data-testid={testId} className="rounded-lg border border-violet-200 bg-card px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{task.title}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Nome da categoria"
            className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
          />
          <button type="button" disabled={busy || !categoryName.trim()} onClick={() => onAccept(categoryName.trim())}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success px-2 py-1 text-[11px] font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> Criar categoria
          </button>
          <button type="button" disabled={busy} onClick={onDismiss}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-bold text-destructive hover:bg-[var(--pastel-red-bg)] disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div data-testid={testId} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{task.title}</span>
      <SeverityBadge severity={task.severity} />
      {task.kind === "email_draft" ? (
        <a href={task.mailto} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground">
          <MailPlus className="h-3.5 w-3.5" /> Abrir rascunho
        </a>
      ) : null}
      <button type="button" disabled={busy} onClick={() => onAccept()}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success px-2 py-1 text-[11px] font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50">
        <Check className="h-3.5 w-3.5" /> Aceitar
      </button>
      <button type="button" disabled={busy} onClick={onDismiss}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-bold text-destructive hover:bg-[var(--pastel-red-bg)] disabled:opacity-50">
        <Trash2 className="h-3.5 w-3.5" /> Dispensar
      </button>
    </div>
  );
}

// Tarefas sugeridas a partir do Correio Semanal ou do Anexos_Edição.zip —
// nunca entram na lista de tarefas normal sozinhas, ficam aqui para
// aceitar ou dispensar uma a uma (mesmo princípio de confirmação humana
// usado no resto da app). `filterField`/`filterValue` escolhem a origem:
// "csn_number" para o boletim, "edition_number" para os anexos.
function SuggestedTasksPanel({ filterField, filterValue, heading }) {
  const [tasks, setTasks] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/tasks", { params: { suggested: true } })
      .then(({ data }) => { if (alive) setTasks((data || []).filter((t) => t[filterField] === filterValue)); })
      .catch(() => { if (alive) setTasks([]); });
    return () => { alive = false; };
  }, [filterField, filterValue]);

  const accept = async (task, categoryName) => {
    setBusyId(task.id);
    try {
      if (task.kind === "new_category_suggestion") {
        await api.post(`/tasks/${task.id}/accept-new-category`, { category: categoryName });
        toast.success(`Categoria "${categoryName}" criada — passa a reconhecer-se sozinha nas próximas edições.`);
      } else {
        await api.post(`/tasks/${task.id}/accept-suggestion`);
        toast.success("Tarefa aceite — já está na lista de tarefas.");
      }
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível aceitar a sugestão"));
    } finally {
      setBusyId(null);
    }
  };
  const dismiss = async (id) => {
    setBusyId(id);
    try {
      await api.delete(`/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível dispensar a sugestão"));
    } finally {
      setBusyId(null);
    }
  };

  if (!tasks || tasks.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-emerald-200 bg-[var(--pastel-emerald-bg)] p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-emerald-text)]">
        <ListChecks className="h-3.5 w-3.5" /> {heading} ({tasks.length})
      </p>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <SuggestedTaskRow
            key={t.id} task={t} busy={busyId === t.id}
            testId={`suggested-task-${t.id}`}
            onAccept={(categoryName) => accept(t, categoryName)}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </div>
    </div>
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
  const [unlinkingId, setUnlinkingId] = useState(null);
  const [replyingId, setReplyingId] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestingId, setSuggestingId] = useState(null);
  const [smartResult, setSmartResult] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [taskDialogFor, setTaskDialogFor] = useState(null);
  const [linkDialogFor, setLinkDialogFor] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [markingAllSeen, setMarkingAllSeen] = useState(false);
  const [unassociatedOnly, setUnassociatedOnly] = useState(false);
  const [csnStatus, setCsnStatus] = useState({});
  const [processingCsn, setProcessingCsn] = useState(() => new Set());
  const [openArticleId, setOpenArticleId] = useState(null);
  const navigate = useNavigate();
  const loadSeq = useRef(0);

  const loadCsnStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/emails/correio-semanal/status");
      setCsnStatus(Object.fromEntries(data.map((item) => [item.email_id, item])));
    } catch {
      // silencioso — não bloqueia a caixa de entrada por causa disto
    }
  }, []);
  useEffect(() => { loadCsnStatus(); }, [loadCsnStatus]);

  const processCsnEmail = async (emailId) => {
    if (processingCsn.has(emailId)) return;
    setProcessingCsn((prev) => new Set(prev).add(emailId));
    try {
      const { data } = await api.post(`/emails/${emailId}/process-correio-semanal`);
      toast.success("Correio Semanal processado", { description: "Artigo do arquivo atualizado." });
      await loadCsnStatus();
      setOpenArticleId(data.article_id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível processar este Correio Semanal"));
    } finally {
      setProcessingCsn((prev) => { const next = new Set(prev); next.delete(emailId); return next; });
    }
  };

  const load = useCallback(async (opts = {}) => {
    const seq = ++loadSeq.current;
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/inbox", {
        params: { search: search || undefined, limit: PAGE_SIZE },
      });
      // Uma atualização silenciosa em segundo plano pode responder depois de
      // um load() mais recente (ex.: o utilizador mudou a pesquisa entretanto)
      // — nesse caso, a resposta mais antiga não deve pisar a mais nova.
      if (seq !== loadSeq.current) return;
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar a caixa de entrada"));
    } finally {
      // O spinner de carregamento segue sempre o próprio pedido explícito,
      // não a corrida entre pedidos — uma atualização silenciosa a demorar
      // mais não pode deixar o spinner preso por não ser "a mais recente".
      if (!opts.silent) setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    // Enquanto a pesquisa IA está ativa e a mostrar resultados, o resultado
    // desta chamada nem chega a ser exibido — poupa o pedido normal.
    if (smartQuery) return;
    load();
  }, [load, smartQuery]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  // Pesquisa inteligente: só corre quando o utilizador confirma (Enter), não
  // a cada tecla — cada pesquisa é uma chamada à IA para interpretar o texto.
  useEffect(() => {
    if (!smartQuery) { setSmartResult(null); return; }
    const controller = new AbortController();
    let cancelled = false;
    setSmartLoading(true);
    api.post("/emails/smart-search", { query: smartQuery.q }, { signal: controller.signal })
      .then(({ data }) => { if (!cancelled) setSmartResult(data); })
      .catch((e) => {
        if (cancelled || axios.isCancel(e)) return;
        toast.error(getErrorMessage(e, "Não foi possível interpretar a pesquisa"));
        setSmartResult({ items: [], total: 0, interpreted: null });
      })
      .finally(() => { if (!cancelled) setSmartLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [smartQuery]);

  const allDisplayItems = smartQuery ? (smartResult?.items || []) : items;
  const unassociatedCount = allDisplayItems.filter((m) => !m.matched).length;
  const displayItems = unassociatedOnly ? allDisplayItems.filter((m) => !m.matched) : allDisplayItems;
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

  const unlinkNote = async (m) => {
    setUnlinkingId(m.id);
    try {
      const { data } = await api.post(`/emails/${m.id}/unlink-note`);
      const base = "Associação ao pedido removida";
      toast.success(data.status_changed ? `${base} — estado voltou a "${getStatusCfg(data.status).label}"` : base);
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível remover a associação"));
    } finally {
      setUnlinkingId(null);
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
    if (markingAllSeen) return; // clique duplo não deve disparar dois POSTs concorrentes
    setMarkingAllSeen(true);
    try {
      await api.post("/emails/seen-all");
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setMarkingAllSeen(false);
    }
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
  // Mudar de pesquisa (ou entrar/sair do modo IA) troca por completo a lista
  // visível — mantiver a seleção antiga só criaria "fantasmas" selecionados
  // que já não aparecem em lado nenhum. Uma atualização silenciosa de fundo
  // não passa por aqui, por isso não perde a seleção do utilizador à toa.
  useEffect(() => { clearSelection(); }, [search, smartQuery]);
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === displayItems.length ? new Set() : new Set(displayItems.map((m) => m.id))));
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
          <p className="text-sm text-text-body">{displayTotal} email{displayTotal === 1 ? "" : "s"} {smartQuery ? "encontrado(s) pela pesquisa IA" : "na caixa de entrada"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="emails-filter-unassociated"
            onClick={() => setUnassociatedOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition-colors sm:px-3 ${unassociatedOnly ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
          >
            <Unlink2 className="h-3.5 w-3.5" /> Por associar{unassociatedCount ? ` (${unassociatedCount})` : ""}
          </button>
          <Button data-testid="emails-mark-all-seen" size="sm" variant="outline" disabled={markingAllSeen} onClick={markAllSeen} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
            {markingAllSeen ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <CheckCheck className="mr-1.5 h-3.5 w-3.5" />} Marcar vistos
          </Button>
          <Button data-testid="emails-sync" size="sm" variant="outline" disabled={syncing} onClick={sync} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
            {syncing ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Verificar
          </Button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="card-elevated mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="text-xs font-bold text-foreground"><span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground px-1 font-mono text-[11px] font-black text-background">{selected.size}</span> selecionado{selected.size === 1 ? "" : "s"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button data-testid="bulk-seen" size="sm" variant="outline" loading={bulkBusy} onClick={bulkMarkSeen} className="h-8 rounded-lg border-border bg-muted px-2.5 text-xs text-foreground hover:bg-muted hover:text-foreground">
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Marcar visto
            </Button>
            <Button data-testid="bulk-clear" size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {smartQuery ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-[var(--pastel-violet-bg)] px-3 py-2 text-xs text-[color:var(--pastel-violet-text)]">
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
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        </div>
      ) : null}

      {displayLoading ? (
        <ListSkeleton rows={4} />
      ) : displayItems.length === 0 ? (
        <EmptyState
          icon={smartQuery ? Sparkles : unassociatedOnly ? Unlink2 : Inbox}
          text={smartQuery ? "Sem resultados para esta pesquisa." : unassociatedOnly ? "Tudo associado — sem emails por associar." : "Sem emails na caixa de entrada."}
        />
      ) : (
        <div className="mt-3 space-y-2">
          {displayItems.map((m) => (
            <div key={m.id} data-testid={`inbox-email-${m.id}`} className={`flex items-start gap-2 rounded-xl border p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${m.seen ? "border-border bg-card" : "border-blue-200 bg-[var(--pastel-blue-bg)]"}`}>
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
                    <span className="truncate text-sm font-bold text-foreground">{m.supplier_name || m.from_name || m.from_email}</span>
                    {m.matched ? <KindBadge kind={m.reply_kind || "supplier"} /> : <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Sem pedido associado</span>}
                    <PriorityBadge priority={m.priority} />
                    <CategoryBadge category={m.category} />
                    {m.has_pdf ? <FileText className="h-3.5 w-3.5 text-red-500" title="Com PDF em anexo" /> : null}
                  </div>
                  <p className="truncate text-meta text-text-tertiary">{m.subject || "(sem assunto)"}</p>
                  {m.ai_summary ? <p className="mt-0.5 truncate text-meta italic text-violet-600">{m.ai_summary}</p> : null}
                  <p className="mt-0.5 text-meta text-text-tertiary">{m.from_email} · {timeAgo(m.received_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-border pt-3">
                  {csnStatus[m.id] ? (
                    <CorreioSemanalStatusPanel
                      status={csnStatus[m.id]}
                      busy={processingCsn.has(m.id)}
                      onProcess={() => processCsnEmail(m.id)}
                      onOpenArticle={setOpenArticleId}
                    />
                  ) : null}
                  {m.edition_summary ? (
                    <div className="mb-2 rounded-lg border border-indigo-200 bg-[var(--pastel-indigo-bg)] p-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-indigo-text)]">
                        <BarChart3 className="h-3.5 w-3.5" /> Resumo da edição
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-text-body sm:grid-cols-3 3xl:grid-cols-5">
                        <p>{m.edition_summary.stats.documentos_analisados} documentos analisados</p>
                        <p>{m.edition_summary.stats.assuntos_novos} assuntos novos</p>
                        <p>{m.edition_summary.stats.alteracoes} alterações</p>
                        <p>{m.edition_summary.stats.tarefas_criadas} tarefas criadas</p>
                        <p>{m.edition_summary.stats.campanhas_iniciadas} campanhas iniciadas</p>
                        <p>{m.edition_summary.stats.campanhas_terminadas} campanhas terminadas</p>
                        <p>{m.edition_summary.stats.prazos_esta_semana} prazos esta semana</p>
                        <p className={m.edition_summary.stats.incidencias_criticas ? "font-bold text-[color:var(--pastel-red-text)]" : ""}>
                          {m.edition_summary.stats.incidencias_criticas} incidência(s) crítica(s)
                        </p>
                        <p>{m.edition_summary.stats.documentos_informativos} documentos informativos</p>
                        <p>{m.edition_summary.stats.erros_processamento} erros de processamento</p>
                      </div>
                      {m.edition_summary.related_entities?.fornecedores?.length ? (
                        <p className="mt-1.5 text-[11px] text-text-body">
                          Fornecedores mencionados: {m.edition_summary.related_entities.fornecedores.join(", ")}
                        </p>
                      ) : null}
                      {m.edition_summary.related_entities?.campanhas?.length ? (
                        <p className="mt-0.5 text-[11px] text-text-body">
                          Campanhas: {m.edition_summary.related_entities.campanhas.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {m.correio_semanal_diff ? (
                    <div className="mb-2 rounded-lg border border-amber-200 bg-[var(--pastel-amber-bg)] p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-amber-text)]">
                        <FileDiff className="h-3.5 w-3.5" /> Alterações desde o Correio Semanal Nº{m.correio_semanal_diff.prev_csn_number}
                      </p>
                      {m.correio_semanal_diff.has_changes ? (
                        <div className="space-y-1 text-[11px] text-text-body">
                          {m.correio_semanal_diff.added_sections?.length ? <p>🆕 Novos assuntos: {m.correio_semanal_diff.added_sections.join(", ")}</p> : null}
                          {m.correio_semanal_diff.removed_sections?.length ? <p>❌ Assuntos que saíram: {m.correio_semanal_diff.removed_sections.join(", ")}</p> : null}
                          {m.correio_semanal_diff.added_deadlines?.length ? <p>📅 Novos prazos: {m.correio_semanal_diff.added_deadlines.join("; ")}</p> : null}
                          {m.correio_semanal_diff.removed_deadlines?.length ? <p>✅ Prazos que já saíram da lista: {m.correio_semanal_diff.removed_deadlines.join("; ")}</p> : null}
                        </div>
                      ) : (
                        <p className="text-[11px] text-text-body">Sem alterações estruturais desde a edição anterior.</p>
                      )}
                    </div>
                  ) : null}
                  {m.correio_semanal_csn_number ? (
                    <SuggestedTasksPanel filterField="csn_number" filterValue={m.correio_semanal_csn_number}
                      heading="Tarefas sugeridas" />
                  ) : null}
                  {m.anexos_edicao_number ? (
                    <div className="mb-2 rounded-lg border border-violet-200 bg-[var(--pastel-violet-bg)] p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-violet-text)]">
                        <FileStack className="h-3.5 w-3.5" /> Anexos da Edição Nº{m.anexos_edicao_number}
                      </p>
                      <p className="mb-1 text-[11px] text-text-body">
                        {m.anexos_edicao_summary?.file_count ?? 0} ficheiro(s) processado(s)
                        {m.anexos_edicao_summary?.by_category
                          ? " · " + Object.entries(m.anexos_edicao_summary.by_category)
                              .map(([k, v]) => `${v} ${ANEXOS_CATEGORY_LABELS[k] || k}`).join(", ")
                          : ""}
                      </p>
                      {m.anexos_edicao_diff ? (
                        m.anexos_edicao_diff.has_changes ? (
                          <div className="space-y-1 text-[11px] text-text-body">
                            <p>Desde a edição Nº{m.anexos_edicao_diff.prev_edition}:</p>
                            {m.anexos_edicao_diff.new_files?.length ? <p>🆕 {m.anexos_edicao_diff.new_files.length} ficheiro(s) novo(s)</p> : null}
                            {m.anexos_edicao_diff.removed_files?.length ? <p>❌ {m.anexos_edicao_diff.removed_files.length} ficheiro(s) removido(s)</p> : null}
                            {m.anexos_edicao_diff.updated_files?.length ? <p>✏️ {m.anexos_edicao_diff.updated_files.length} ficheiro(s) atualizado(s)</p> : null}
                            {m.anexos_edicao_diff.price_changes_count ? <p>💶 {m.anexos_edicao_diff.price_changes_count} alteração(ões) de preço</p> : null}
                            {m.anexos_edicao_diff.new_products_count ? <p>🟢 {m.anexos_edicao_diff.new_products_count} produto(s) novo(s)</p> : null}
                            {m.anexos_edicao_diff.discontinued_products_count ? <p>🔴 {m.anexos_edicao_diff.discontinued_products_count} produto(s) descontinuado(s)</p> : null}
                          </div>
                        ) : (
                          <p className="text-[11px] text-text-body">Sem alterações desde a edição anterior.</p>
                        )
                      ) : null}
                    </div>
                  ) : null}
                  {m.anexos_edicao_number ? (
                    <SuggestedTasksPanel filterField="edition_number" filterValue={m.anexos_edicao_number}
                      heading="Tarefas sugeridas dos anexos" />
                  ) : null}
                  {m.correio_semanal_summary ? (
                    <div className="mb-2 rounded-lg border border-blue-200 bg-[var(--pastel-blue-bg)] p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-blue-text)]">
                        <ListChecks className="h-3.5 w-3.5" /> Resumo do Correio Semanal
                      </p>
                      {m.correio_semanal_summary.startsWith("<") ? (
                        <div
                          className={"max-h-96 overflow-y-auto text-xs text-foreground "
                            + "[&_h3]:mb-2 [&_h3]:font-heading [&_h3]:text-sm [&_h3]:font-extrabold [&_h3]:tracking-tight [&_h3]:text-[color:var(--pastel-blue-text)] "
                            + "[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:border-b [&_h4]:border-blue-200 [&_h4]:pb-1 [&_h4]:text-[13px] [&_h4]:font-extrabold [&_h4]:text-[color:var(--pastel-blue-text)] [&_h3+h4]:mt-0 "
                            + "[&_ul]:mb-2 [&_ul]:space-y-1 [&_ul]:pl-1 [&_li]:rounded-md [&_li]:bg-card/70 [&_li]:px-2 [&_li]:py-1 "
                            + "[&_p]:mb-1.5 [&_strong]:font-bold [&_strong]:text-[color:var(--pastel-blue-text)] "
                            + "[&_.csn-action]:mb-2 [&_.csn-action]:inline-flex [&_.csn-action]:rounded-full [&_.csn-action]:bg-[var(--pastel-amber-bg)] [&_.csn-action]:px-2 [&_.csn-action]:py-0.5 [&_.csn-action]:text-[10px] [&_.csn-action]:font-bold [&_.csn-action]:text-[color:var(--pastel-amber-text)]"}
                          dangerouslySetInnerHTML={{ __html: m.correio_semanal_summary }}
                        />
                      ) : (
                        <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-[color:var(--pastel-blue-text)]">{m.correio_semanal_summary}</p>
                      )}
                    </div>
                  ) : null}
                  <EmailBody html={m.body_html} text={m.body} />
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => (
                        <button key={a.id} type="button"
                          onClick={() => setPreviewAttachment({ url: withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`), filename: a.filename })}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-red-300 hover:text-[color:var(--pastel-red-text)]">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {m.note_id ? (
                      <>
                        <button onClick={() => navigate(`/?open=${m.note_id}&tab=${m.reply_kind === "client" ? "cronologia" : "orcamentos"}`)} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
                          Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <Button
                          data-testid={`inbox-unlink-note-${m.id}`}
                          size="sm"
                          variant="outline"
                          disabled={unlinkingId === m.id}
                          onClick={() => unlinkNote(m)}
                          className="h-8 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-[var(--pastel-red-bg)]"
                        >
                          {unlinkingId === m.id ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Unlink2 className="mr-1.5 h-3.5 w-3.5" />}
                          Desassociar
                        </Button>
                      </>
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
                    <Button data-testid={`inbox-forward-${m.id}`} size="sm" variant="outline" onClick={() => onForward(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
                      <Forward className="mr-1.5 h-3.5 w-3.5" /> Reencaminhar
                    </Button>
                    <Button data-testid={`inbox-task-${m.id}`} size="sm" variant="outline" onClick={() => openTaskDialog(m)} className="h-8 rounded-lg px-2.5 text-xs sm:px-3">
                      <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Criar tarefa
                    </Button>
                  </div>
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
                          className="h-8 rounded-lg border-violet-200 text-xs text-[color:var(--pastel-violet-text)] hover:bg-[var(--pastel-violet-bg)]"
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
      <KnowledgeArticleDialog
        articleId={openArticleId}
        onOpenChange={(v) => !v && setOpenArticleId(null)}
        onChanged={loadCsnStatus}
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
  const loadSeq = useRef(0);

  const load = useCallback(async (opts = {}) => {
    const seq = ++loadSeq.current;
    if (!opts.silent) setLoading(true);
    try {
      if (awaitingOnly) {
        const { data } = await api.get("/emails/awaiting-reply", { params: { days: 3 } });
        if (seq !== loadSeq.current) return;
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
        if (seq !== loadSeq.current) return;
        setItems(data.items); setTotal(data.total);
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
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
        <p className="text-sm text-text-body">
          {total} email{total === 1 ? "" : "s"} {awaitingOnly ? "sem resposta há mais de 3 dias" : "enviado" + (total === 1 ? "" : "s")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[["todos", "Todos"], ["supplier", "Fornecedores"], ["client", "Clientes"]].map(([k, label]) => (
            <button key={k} data-testid={`sent-filter-${k}`} onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${kind === k ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>
          ))}
          <button data-testid="sent-awaiting-toggle" onClick={() => setAwaitingOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${awaitingOnly ? "bg-warning text-warning-foreground" : "border border-amber-200 bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)] hover:bg-[var(--pastel-amber-bg)]"}`}>
            <BellRing className="h-3.5 w-3.5" /> Aguardam resposta
          </button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={awaitingOnly ? BellRing : Send} text={awaitingOnly ? "Tudo respondido — sem emails à espera." : "Sem emails enviados."} />
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((m) => (
            <div key={m.id} data-testid={`sent-email-${m.id}`} className="rounded-xl border border-border bg-card p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <button onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">{m.to_label || m.to}</span>
                    <KindBadge kind={m.kind} />
                    {m.source === "gmail" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground" title="Sincronizado da pasta Enviados do Gmail">
                        <Mail className="h-2.5 w-2.5" /> Gmail
                      </span>
                    ) : null}
                    {(m.attachments || []).length > 0 ? <Paperclip className="h-3.5 w-3.5 text-muted-foreground" title="Com anexo" /> : null}
                  </div>
                  <p className="truncate text-meta text-text-tertiary">{m.subject || "(sem assunto)"}</p>
                  <p className="mt-0.5 text-meta text-text-tertiary">{m.to} · {timeAgo(m.sent_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-border pt-3">
                  <EmailBody html={m.body_html} text={m.body} />
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a, i) => (
                        m.note_id && m.pdf_file_id ? (
                          <button key={i} type="button"
                            onClick={() => setPreviewAttachment({ url: withDeviceToken(`${API}/notes/${m.note_id}/files/${m.pdf_file_id}`), filename: a.filename })}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-red-300 hover:text-[color:var(--pastel-red-text)]">
                            <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                          </button>
                        ) : (
                          <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                            <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[55vw] truncate sm:max-w-[220px]">{a.filename}</span>
                          </span>
                        )
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-meta text-text-tertiary">{formatDateTime(m.sent_at)}</p>
                  {m.note_id ? (
                    <button onClick={() => navigate(`/?open=${m.note_id}&tab=cronologia`)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
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
  const loadSeq = useRef(0);
  const openSeq = useRef(0);

  const load = useCallback(async (opts = {}) => {
    const seq = ++loadSeq.current;
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/threads");
      if (seq !== loadSeq.current) return;
      setThreads(data.items);
    } catch (e) {
      if (seq !== loadSeq.current) return;
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
    // Se a conversa aberta anteriormente ainda estiver a carregar quando se
    // abre outra, a resposta mais lenta não pode pisar as mensagens da
    // conversa que entretanto ficou aberta — cada abertura tem o seu próprio
    // número de sequência.
    const seq = ++openSeq.current;
    try {
      const { data } = await api.get("/emails/threads/view", { params: { key: t.key } });
      if (seq !== openSeq.current) return;
      setMessages(data.items);
    } catch (e) {
      if (seq !== openSeq.current) return;
      toast.error(getErrorMessage(e, "Não foi possível abrir a conversa"));
    } finally {
      if (seq === openSeq.current) setLoadingThread(false);
    }
  };

  const filtered = search
    ? threads.filter((t) => (t.label || "").toLowerCase().includes(search.toLowerCase()) || (t.last_preview || "").toLowerCase().includes(search.toLowerCase()))
    : threads;

  return (
    <div>
      <p className="mt-3 text-sm text-text-body">{filtered.length} conversa{filtered.length === 1 ? "" : "s"}</p>
      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessagesSquare} text="Sem conversas ainda." />
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((t) => (
            <div key={t.key} data-testid={`thread-${t.key}`} className="rounded-xl border border-border bg-card p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <button onClick={() => openThread(t)} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">{t.label || "(sem nome)"}</span>
                    {t.unseen > 0 ? <span className="inline-flex rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{t.unseen} nova(s)</span> : null}
                  </div>
                  <p className="truncate text-meta text-text-tertiary">{t.last_preview || "(sem texto)"}</p>
                  <p className="mt-0.5 text-meta text-text-tertiary">{t.count} mensagem{t.count === 1 ? "" : "s"} · {timeAgo(t.last_at)}</p>
                </div>
              </button>
              {openKey === t.key ? (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {loadingThread ? (
                    <div className="flex justify-center py-4"><Spinner className="h-4 w-4 text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">Sem mensagens.</p>
                  ) : messages.map((m, i) => (
                    <div key={i} className={`rounded-lg p-2.5 text-xs ${m.direction === "out" ? "ml-6 bg-[var(--pastel-emerald-bg)]" : "mr-6 bg-muted"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">{m.direction === "out" ? `Enviado a ${m.to_label || m.to}` : `Recebido de ${m.supplier_name || m.from_name || m.from_email}`}</span>
                        <span className="shrink-0 text-muted-foreground">{formatDateTime(m.at)}</span>
                      </div>
                      <p className="mt-1 truncate text-text-tertiary">{m.subject || "(sem assunto)"}</p>
                      <p className="mt-1 whitespace-pre-wrap text-text-body">{(m.body || "").slice(0, 400)}</p>
                    </div>
                  ))}
                  {t.note_id ? (
                    <button onClick={() => navigate(`/?open=${t.note_id}&tab=cronologia`)} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
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
  const loadSeq = useRef(0);

  const load = useCallback(async (opts = {}) => {
    const seq = ++loadSeq.current;
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/drafts");
      if (seq !== loadSeq.current) return;
      setItems(data.items);
    } catch (e) {
      if (seq !== loadSeq.current) return;
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
      <p className="mt-3 text-sm text-text-body">{filtered.length} rascunho{filtered.length === 1 ? "" : "s"} por confirmar</p>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileClock} text="Sem rascunhos por enviar." />
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((n) => {
            const p = n.pending_client_send;
            return (
              <button key={n.id} data-testid={`draft-email-${n.id}`} onClick={() => setConfirmNote(n)}
                className="flex w-full flex-col items-stretch gap-3 rounded-xl border border-emerald-200 bg-[var(--pastel-emerald-bg)] p-3 text-left transition-colors hover:bg-[var(--pastel-emerald-bg)] min-[420px]:flex-row min-[420px]:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-bold text-foreground">{n.customer_name || "Sem nome"}</p>
                    {isStale(p?.created_at) ? (
                      <span className="inline-flex rounded-full bg-[var(--pastel-amber-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-amber-text)]">Há mais de 24h</span>
                    ) : null}
                  </div>
                  <p className="truncate text-meta text-text-tertiary">{p?.subject}</p>
                  <p className="mt-0.5 text-meta text-text-tertiary">
                    {p?.pdf_filename ? `${p.pdf_filename} · ` : ""}
                    {p?.total != null ? `${Number(p.total).toFixed(2)} € c/ IVA · ` : ""}
                    {timeAgo(p?.created_at)}
                  </p>
                </div>
                <span className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-success-foreground">
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
    const q = search.trim();
    if (!q) return;
    // Enter repetido sem mudar o texto não deve repetir a chamada à IA.
    if (smartQuery?.q === q) return;
    setSmartQuery({ q });
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
          <h1 className="mt-0.5 flex items-center gap-2.5 font-heading text-h1 text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-black text-white shadow-lg shadow-slate-400/30 sm:h-11 sm:w-11">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            Emails
          </h1>
        </div>
        <div className="mt-2 flex shrink-0 gap-2 sm:mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="emails-more-btn" variant="outline" className="h-10 shrink-0 rounded-xl px-3">
                <MoreHorizontal className="mr-1.5 h-4 w-4" /> Mais
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

      <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row">
        <InputGroup className="h-11 flex-1 rounded-xl">
          <InputGroupAddon>
            <Search className="h-4 w-4 text-muted-foreground" />
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
            className={`h-11 shrink-0 rounded-xl px-3 ${smartOn ? "bg-violet-600 hover:bg-violet-700" : "text-[color:var(--pastel-violet-text)]"}`}
            title="Pesquisa inteligente com IA"
          >
            <Sparkles className="mr-1.5 h-4 w-4" /> Pesquisa IA
          </Button>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="card-elevated grid h-11 w-full grid-cols-4 rounded-xl border border-border bg-card p-1 text-muted-foreground [&_[data-state=active]]:bg-foreground [&_[data-state=active]]:text-background [&_[data-state=active]]:shadow-md [&_[data-state=active]]:shadow-slate-400/30">
          <TabsTrigger value="inbox" data-testid="emails-tab-inbox" className="rounded-lg font-bold"><Inbox className="mr-1 h-3.5 w-3.5 sm:mr-1.5" /> <span className="text-[10px] sm:text-xs">Recebidos</span></TabsTrigger>
          <TabsTrigger value="sent" data-testid="emails-tab-sent" className="rounded-lg font-bold"><Send className="mr-1 h-3.5 w-3.5 sm:mr-1.5" /> <span className="text-[10px] sm:text-xs">Enviados</span></TabsTrigger>
          <TabsTrigger value="threads" data-testid="emails-tab-threads" className="rounded-lg font-bold"><MessagesSquare className="mr-1 h-3.5 w-3.5 sm:mr-1.5" /> <span className="text-[10px] sm:text-xs">Conversas</span></TabsTrigger>
          <TabsTrigger value="drafts" data-testid="emails-tab-drafts" className="rounded-lg font-bold"><FileClock className="mr-1 h-3.5 w-3.5 sm:mr-1.5" /> <span className="text-[10px] sm:text-xs">Rascunhos</span></TabsTrigger>
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
