import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription,
} from "@/components/ui/attachment";
import { Message, MessageGroup, MessageAvatar, MessageContent } from "@/components/ui/message";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { toast } from "sonner";
import {
  Trash2, Send, Copy, Mail, Plus, AlertCircle, CheckCircle2,
  MessageSquare, Sparkles, ArrowRightLeft, Flag, Receipt,
  BadgeCheck, Pencil, Bell, Tag, X, Calendar, Zap,
  Check, AlertTriangle, Cloud, Frame,
  Store, ArrowLeft, ChevronRight, PhoneMissed, PhoneCall, Package, PackageCheck, BellRing,
  FileUp, FileText, Download, Inbox, RefreshCw, Camera, ImagePlus, ImageOff,
  Building2, FileWarning, Eye, MessageCircle,
} from "lucide-react";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { CATEGORY_LIST } from "@/lib/categories";
import {
  STATUS_ORDER, getStatusCfg, PRIORITY_ORDER, PRIORITY_CONFIG,
  buildEmail, formatDateTime, getNextActionCta, getNextActionMode, timeAgo,
} from "@/lib/pedido";
import CaixilhariaDialog from "@/components/CaixilhariaDialog";
import ConfirmSendDialog from "@/components/ConfirmSendDialog";
import AttachmentPreviewDialog, { previewKind } from "@/components/AttachmentPreviewDialog";
import EntityStackBar from "@/components/EntityStackBar";
import PhoneInput from "@/components/PhoneInput";
import { formatPhoneDisplay } from "@/lib/phoneFormat";
import NameInput from "@/components/NameInput";
import EmailInput from "@/components/EmailInput";
import { haptics } from "@/lib/haptics";
import { DEFAULT_COUNTRY_CODE } from "@/lib/phoneFormat";
import { stripAccents } from "@/lib/textClean";
import CaixilhariaForm, {
  caixilhariaLabels, createEmptyCaixilharia, getCaixilhariaCatalog,
  normalizeCaixilhariaSpec, validateCaixilhariaSpec,
} from "@/components/CaixilhariaForm";

const emptyForm = {
  customer_name: "", phone: "", email: "", description: "", details: "",
  category: "construcao", quantity: "", reference: "", bricoaval_number: "",
  priority: "media", labels: [], supplier_id: "", sla_days: 2, reminder_interval_days: 3,
};

const BRICOAVAL_STATUS_LABEL = {
  erro: "Erro no envio", respondido: "Respondido", sem_resposta: "Sem resposta", enviado: "Enviado",
};

const DRAFT_KEY = "brico_draft_new_note";
const MAX_PHOTOS_PER_NOTE = 30;

// Mesma lógica de frontend/src/pages/Suppliers.jsx (PhoneActions/waLink) —
// números legados sem indicativo assumem Portugal, tal como o "tel:".
function phoneWaLink(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  return `https://wa.me/${(phone || "").trim().startsWith("+") ? digits : `351${digits}`}`;
}

const ACT_ICONS = {
  created: Sparkles, status_change: ArrowRightLeft, priority_change: Flag,
  quote_added: Receipt, quote_removed: Trash2, quote_approved: BadgeCheck,
  email_sent: Send, email_received: Inbox, comment: MessageSquare, updated: Pencil, task_added: Bell,
  client_contact: PhoneCall, supplier_contact: PhoneCall,
  contact_attempt: PhoneMissed, auto_archived: Cloud,
  photo_added: Camera, photo_removed: ImageOff,
};

// Registos de um toque: gravam o resultado do contacto na cronologia e
// atualizam etiquetas/contadores no servidor (ver QUICK_LOG_EVENTS no backend).
const QUICK_LOG_OPTIONS = [
  { event: "cliente_nao_atendeu", label: "Cliente não atendeu", icon: PhoneMissed, tone: "red" },
  { event: "cliente_deixou_mensagem", label: "Deixei mensagem ao cliente", icon: MessageSquare, tone: "amber" },
  { event: "cliente_atendeu", label: "Falei com o cliente", icon: PhoneCall, tone: "green" },
  { event: "fornecedor_nao_atendeu", label: "Fornecedor não atendeu", icon: PhoneMissed, tone: "red" },
  { event: "fornecedor_atendeu", label: "Falei com o fornecedor", icon: PhoneCall, tone: "green" },
  { event: "aguarda_stock", label: "Aguarda stock", icon: Package, tone: "amber" },
  { event: "pronto_levantamento", label: "Pronto p/ levantamento", icon: PackageCheck, tone: "green" },
  { event: "cliente_avisado", label: "Cliente avisado", icon: BellRing, tone: "green" },
];

// Estado da comunicação do pedido (ver backend/server.py:
// communication_status) — "Entregue" não existe como estado próprio (nem
// SMTP nem a API do Gmail confirmam entrega real).
const COMM_STATUS_LABEL = {
  erro: "Erro no envio", respondido: "Respondido", sem_resposta: "Sem resposta", enviado: "Enviado",
};

const QUICK_LOG_TONES = {
  red: "border-red-200 bg-[var(--pastel-red-bg)] text-[color:var(--pastel-red-text)] hover:bg-[var(--pastel-red-bg)]",
  amber: "border-amber-200 bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)] hover:bg-[var(--pastel-amber-bg)]",
  green: "border-emerald-200 bg-[var(--pastel-emerald-bg)] text-[color:var(--pastel-emerald-text)] hover:bg-[var(--pastel-emerald-bg)]",
};

export default function PedidoDetail({ open, onOpenChange, noteId, initialTab = "detalhes", initialCreateMode = "choice", suppliers, gmailStatus, labelsList, onChanged, aiEnabled, initialData }) {
  const [id, setId] = useState(noteId);
  const [note, setNote] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("detalhes");
  const [saving, setSaving] = useState(false);
  const [autoState, setAutoState] = useState("idle"); // idle | saving | saved | error
  const [autoError, setAutoError] = useState("");
  // Pedidos existentes abrem sempre só em visualização — só é possível
  // editar depois de premir "Editar", e só grava depois de premir "Guardar".
  const [editMode, setEditMode] = useState(false);

  const [quotes, setQuotes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [communication, setCommunication] = useState({ items: [], summary: null });
  const [commSearch, setCommSearch] = useState("");
  const [syncingEmails, setSyncingEmails] = useState(false);
  const [sendingClient, setSendingClient] = useState(false);
  const [comment, setComment] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });

  const [emailSupplier, setEmailSupplier] = useState("");
  const [emailData, setEmailData] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [isReminder, setIsReminder] = useState(false);
  const [clientEmailData, setClientEmailData] = useState({ subject: "", body: "", to: "" });
  const [clientTemplateLoading, setClientTemplateLoading] = useState(false);
  const [caixOpen, setCaixOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // Orçamento do fornecedor importado de PDF (BandAluminios) → PDF de venda
  const [sq, setSq] = useState(null);
  const [importingPdf, setImportingPdf] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const supplierPdfInputRef = useRef(null);

  // Fotos do pedido — disponíveis tanto em Pedidos Gerais como em Banda
  // Alumínios (ex.: fotos do local, do vão, de danos, de referência).
  const [photos, setPhotos] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const photoInputRef = useRef(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Navegação em pilha dentro do pedido — Pedido → Email → PDF → Fornecedor.
  // Cada entrada empilhada substitui as abas normais pelo conteúdo dessa
  // entidade relacionada; a EntityStackBar deixa voltar a qualquer nível
  // anterior sem perder onde se ficou no pedido.
  const [stack, setStack] = useState([]);
  const pushFrame = (frame) => setStack((s) => [...s, { key: `${frame.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ...frame }]);
  const popTo = (index) => setStack((s) => (index < 0 ? [] : s.slice(0, index + 1)));

  // Assistente de criação por etapas: escolha do tipo → passos
  const [createMode, setCreateMode] = useState("choice"); // choice | normal | band
  const [createStep, setCreateStep] = useState(0);
  const [caixSpec, setCaixSpec] = useState(() => createEmptyCaixilharia());
  const [caixCatalog, setCaixCatalog] = useState(null);
  const [creating, setCreating] = useState(false);

  // Assistant data
  const [dupWarn, setDupWarn] = useState([]);
  const [checkingDup, setCheckingDup] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const [clientHistory, setClientHistory] = useState(null);

  // Sugestões de cliente conhecido enquanto se escreve o nome (passo
  // "Cliente" do assistente) — carregado uma vez de /explorer/clients,
  // filtrado localmente (sem acento) a cada tecla.
  const [clients, setClients] = useState([]);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  // Brilho breve (~900ms) num campo preenchido automaticamente (colar
  // "Nome - telefone", escolher uma sugestão, "Usar estes dados") — só
  // feedback visual, nunca controla lógica.
  const [highlightFields, setHighlightFields] = useState(() => new Set());
  const highlightTimer = useRef(null);
  // Snapshot do formulário tirado ao entrar em modo de edição — para
  // mostrar um ponto azul nos campos alterados desde então (só em edição).
  const originalFormRef = useRef(null);

  // AI (OpenAI) state
  const [aiSummary, setAiSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAnalyzing, setReplyAnalyzing] = useState(false);
  const [replyResult, setReplyResult] = useState(null);

  const isCreate = !id;
  // O nº de Orçamento BricoAval aplica-se a qualquer pedido com nome ou
  // email de cliente — incluindo Banda Alumínios: o PDF de venda
  // (quote_pdf.build_client_pdf) já mostra este número quando definido,
  // por isso a exclusão de `note?.caixilharia` aqui só escondia o campo
  // sem nenhum motivo (a heurística "geral vs Banda Alumínios" de
  // _pedido_type_for_note serve outro propósito — o tipo de segmento do
  // email — não este campo).
  const isBricoavalEligible = !isCreate && !!((form.customer_name || "").trim() || (form.email || "").trim());
  const dirty = useRef(false);
  const contentScrollRef = useRef(null);
  // Passo "Cliente" do assistente — foco automático no primeiro campo com
  // erro e Enter a avançar para o campo seguinte (§ pedido do utilizador).
  const clientNameRef = useRef(null);
  const clientPhoneRef = useRef(null);
  const clientEmailRef = useRef(null);
  const set = (k, v) => { dirty.current = true; setForm((f) => ({ ...f, [k]: v })); };

  const flashHighlight = (fields) => {
    setHighlightFields(new Set(fields));
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightFields(new Set()), 900);
  };

  // Ponto azul discreto junto ao rótulo — só em edição, só depois de o
  // valor ter mudado desde que se entrou em modo de edição.
  const fieldChanged = (key) => editMode && originalFormRef.current && form[key] !== originalFormRef.current[key];
  const startEdit = () => { originalFormRef.current = { ...form }; setEditMode(true); };

  // Preenche nome/telefone/email a partir de um cliente já conhecido —
  // tanto de uma sugestão do autocompletar (name/phone/email) como de um
  // possível duplicado já detetado (customer_name/phone/email).
  const applyClientData = ({ name, phone, email }) => {
    if (name) set("customer_name", name);
    if (phone) set("phone", phone);
    if (email) set("email", email);
    setSuggestDismissed(true);
    flashHighlight(["name", "phone", "email"].filter((f) => ({ name, phone, email }[f])));
    toast.success("Dados do cliente preenchidos automaticamente.");
    haptics.success();
  };

  // O spinner só aparece se o pedido demorar mais de ~200ms — para um
  // pedido rápido (o caso comum), criar/guardar parece instantâneo em vez
  // de "piscar" um spinner por uma fração de segundo.
  const [showSaveSpinner, setShowSaveSpinner] = useState(false);
  useEffect(() => {
    if (!saving) { setShowSaveSpinner(false); return; }
    const t = setTimeout(() => setShowSaveSpinner(true), 200);
    return () => clearTimeout(t);
  }, [saving]);
  const [showCreatingSpinner, setShowCreatingSpinner] = useState(false);
  useEffect(() => {
    if (!creating) { setShowCreatingSpinner(false); return; }
    const t = setTimeout(() => setShowCreatingSpinner(true), 200);
    return () => clearTimeout(t);
  }, [creating]);

  const loadSub = useCallback(async (nid) => {
    const [q, a, t, m, p, pf, ch] = await Promise.all([
      api.get(`/notes/${nid}/quotes`),
      api.get(`/notes/${nid}/activities`),
      api.get(`/notes/${nid}/tasks`),
      api.get(`/notes/${nid}/communication`).catch(() => ({ data: { items: [], summary: null } })),
      api.get(`/notes/${nid}/photos`).catch(() => ({ data: [] })),
      api.get(`/notes/${nid}/preflight`).catch(() => ({ data: null })),
      api.get(`/notes/${nid}/client-history`).catch(() => ({ data: null })),
    ]);
    setQuotes(q.data); setActivities(a.data); setTasks(t.data); setCommunication(m.data || { items: [], summary: null });
    setPhotos(p.data || []);
    setPreflight(pf.data);
    setClientHistory(ch.data);
  }, []);

  // Pesquisa dentro da Comunicação — servidor faz o filtro (ver
  // GET /notes/{id}/communication?q=), mesmo padrão de debounce já usado
  // no compositor de email (contactsSeq) e no LinkEmailToNoteDialog.
  const loadCommunication = useCallback(async (nid, query) => {
    try {
      const { data } = await api.get(`/notes/${nid}/communication`, { params: { q: query || undefined } });
      setCommunication(data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar a comunicação"));
    }
  }, []);

  useEffect(() => {
    if (!open || !id || tab !== "comunicacao") return undefined;
    const t = setTimeout(() => loadCommunication(id, commSearch), commSearch ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, id, tab, commSearch, loadCommunication]);

  const loadNote = useCallback(async (nid) => {
    const { data } = await api.get(`/notes/${nid}`);
    setNote(data);
    setForm({ ...emptyForm, ...data });
    // O servidor mantém o tom, a referência interna e o formato de caixilharia
    // consistentes. O modelo local existe apenas como fallback offline.
    try {
      const { data: tpl } = await api.get(`/notes/${nid}/quote-template`);
      setEmailData({ subject: tpl.subject, body: tpl.body });
    } catch {
      setEmailData(buildEmail(data));
    }
    dirty.current = false;
  }, []);

  const loadClientTemplate = useCallback(async (nid) => {
    if (!nid) return;
    setClientTemplateLoading(true);
    try {
      const { data } = await api.get(`/notes/${nid}/client-template`);
      setClientEmailData({
        subject: data.subject || "", body: data.body || "", to: data.to || "",
      });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível preparar a resposta ao cliente"));
    } finally {
      setClientTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setId(noteId);
      setTab(initialTab);
      setEmailSupplier("");
      setIsReminder(false);
      setClientEmailData({ subject: "", body: "", to: "" });
      setDupWarn([]);
      setPreflight(null);
      setClientHistory(null);
      setAiSummary("");
      setAutoState("idle");
      setEditMode(false);
      setPhotos([]);
      setLightboxPhoto(null);
      setStack([]);
      setCommSearch("");
      // Cada área abre logo o assistente certo: «band» na área Banda
      // Alumínios, «normal» na área geral da loja.
      setCreateMode(initialCreateMode || "choice");
      setCreateStep(0);
      setCaixSpec(createEmptyCaixilharia());
      setCreating(false);
      dirty.current = false;
      if (noteId) {
        loadNote(noteId); loadSub(noteId);
      } else {
        // recover draft if exists
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { draft = null; }
        if (draft && (draft.customer_name || draft.description || draft.phone)) {
          setForm({ ...emptyForm, ...draft });
          toast.message("Rascunho recuperado", { description: "Continuámos de onde ficou." });
        } else {
          setForm(emptyForm);
        }
        setNote(null); setQuotes([]); setActivities([]); setTasks([]); setCommunication({ items: [], summary: null });
      }
    }
  }, [open, noteId, initialTab, initialCreateMode, loadNote, loadSub]);

  // Cada separador começa no topo. Evita abrir uma aba curta na posição de
  // scroll deixada por outra aba longa, sobretudo em Android/iOS.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, tab, id]);

  useEffect(() => {
    if (open && id && tab === "orcamentos") loadClientTemplate(id);
  }, [open, id, tab, loadClientTemplate]);

  // O rascunho editável do orçamento importado acompanha a última versão do servidor.
  useEffect(() => {
    setSq(note?.supplier_quote ? JSON.parse(JSON.stringify(note.supplier_quote)) : null);
  }, [note]);

  // Catálogo de caixilharia — carregado quando o utilizador escolhe o fluxo BandAluminios
  useEffect(() => {
    if (open && createMode === "band" && !caixCatalog) {
      getCaixilhariaCatalog()
        .then(setCaixCatalog)
        .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar o catálogo de caixilharia")));
    }
  }, [open, createMode, caixCatalog]);

  // Rascunho local (só para pedidos novos, no assistente de criação). Pedidos
  // já existentes NUNCA gravam sozinhos: só o botão "Guardar", em modo de
  // edição — ver editMode mais abaixo. Isto é o que torna "Cancelar" um
  // cancelamento a sério, e não apenas cosmético.
  useEffect(() => {
    if (!open || !isCreate) return;
    if (dirty.current) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* noop */ } }
  }, [form, isCreate, open]);

  // Duplicate detection while creating (debounced 600ms — checkingDup
  // alimenta um indicador discreto "a verificar…" enquanto o pedido está
  // pendente, para o utilizador perceber que não ficou parado por engano).
  useEffect(() => {
    if (!open || !isCreate) return;
    const phone = form.phone.trim(); const name = form.customer_name.trim();
    if (!phone && !name) { setDupWarn([]); setCheckingDup(false); return; }
    setCheckingDup(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/notes/check-duplicate", { phone, customer_name: name, description: form.description });
        setDupWarn(data.matches || []);
      } catch { setDupWarn([]); } finally { setCheckingDup(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [form.phone, form.customer_name, form.description, isCreate, open]);

  // Sugestões de cliente conhecido — carregadas uma vez quando o
  // assistente de criação abre (accent-insensitive, filtrado localmente,
  // sem pedidos extra por tecla).
  useEffect(() => {
    if (!open || !isCreate) return;
    api.get("/explorer/clients").then(({ data }) => setClients(data?.items || [])).catch(() => setClients([]));
  }, [open, isCreate]);

  // Foco automático no nome do cliente assim que o passo "Cliente" do
  // assistente fica ativo — poupa um clique em quase todos os pedidos novos.
  useEffect(() => {
    if (!open || !isCreate || createMode === "choice" || createStep !== 0) return;
    const t = setTimeout(() => clientNameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, isCreate, createMode, createStep]);

  const refresh = async () => {
    if (id) { await loadNote(id); await loadSub(id); }
    onChanged && onChanged();
  };

  // Usado pelas ações rápidas de estado/prioridade (sempre disponíveis,
  // mesmo em modo de edição). Ao contrário de refresh(), não toca no
  // formulário quando há uma edição em curso — mudar o estado no meio de
  // uma edição não pode apagar texto ainda não guardado.
  const refreshChrome = async () => {
    if (!id) return;
    const { data } = await api.get(`/notes/${id}`);
    setNote(data);
    if (!editMode) setForm({ ...emptyForm, ...data });
    onChanged && onChanged();
  };

  const saveDetails = async () => {
    if (!form.customer_name && !form.description) {
      toast.error("Preenche o cliente ou a descrição."); return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("O email do cliente não parece válido."); return;
    }
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) {
      toast.error("O telefone do cliente parece incompleto."); return;
    }
    setSaving(true);
    if (!isCreate) setAutoState("saving");
    try {
      if (isCreate) {
        const { data } = await api.post("/notes", form);
        setId(data.id); setNote(data);
        await loadSub(data.id);
        localStorage.removeItem(DRAFT_KEY);
        dirty.current = false;
        toast.success("Pedido criado");
      } else {
        await api.put(`/notes/${id}`, form);
        dirty.current = false;
        toast.success("Alterações guardadas");
        await refresh();
        setAutoState("saved");
        setAutoError("");
        // Guardado com sucesso: sai do modo de edição e volta à
        // visualização, como pedido — evita alterações por engano depois
        // de gravar.
        setEditMode(false);
      }
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar"));
      if (!isCreate) {
        setAutoState("error");
        setAutoError(getErrorMessage(e, "Não foi possível guardar"));
      }
    } finally {
      setSaving(false);
    }
  };

  // Descarta quaisquer alterações locais por gravar e volta à visualização
  // — como o formulário nunca grava sozinho enquanto em edição (ver acima),
  // isto é um cancelamento a sério: nada chegou a ir para o servidor.
  const cancelEdit = () => {
    if (note) setForm({ ...emptyForm, ...note });
    dirty.current = false;
    setAutoState("idle");
    setEditMode(false);
  };

  // ---- Assistente de criação por etapas ----
  const createSteps = createMode === "band" ? ["Cliente", "Caixilharia"] : ["Cliente", "Pedido", "Confirmar"];
  const isLastStep = createStep === createSteps.length - 1;

  // Recalculado a cada mudança de nome/telefone/email — alimenta tanto o
  // botão "Continuar" (só ativa quando não há problema) como o foco
  // automático no primeiro campo com erro.
  const clientStepIssue = useMemo(() => {
    if (!form.customer_name.trim() && !form.phone.trim()) {
      return { field: "name", ref: clientNameRef, message: "Indica pelo menos o nome ou o telefone do cliente." };
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return { field: "email", ref: clientEmailRef, message: "O email do cliente não parece válido." };
    }
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) {
      return { field: "phone", ref: clientPhoneRef, message: "O telefone do cliente parece incompleto." };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customer_name, form.phone, form.email]);

  const validClientStep = () => {
    if (!clientStepIssue) return true;
    toast.error(clientStepIssue.message);
    haptics.warning();
    clientStepIssue.ref.current?.focus();
    return false;
  };

  // Até 5 clientes já conhecidos cujo nome bate com o que se está a
  // escrever (sem acento — "conceicao" encontra "Conceição"). Escondidas
  // assim que se escolhe uma ou se sai do campo (suggestDismissed).
  const clientSuggestions = useMemo(() => {
    const q = stripAccents(form.customer_name.trim().toLowerCase());
    if (suggestDismissed || q.length < 2) return [];
    return clients
      .filter((c) => c.name && stripAccents(c.name.toLowerCase()).includes(q) && c.name.trim().toLowerCase() !== q)
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, form.customer_name, suggestDismissed]);

  const wizardBack = () => {
    if (createStep === 0) setCreateMode("choice");
    else setCreateStep((s) => s - 1);
  };

  const wizardNext = () => {
    if (createStep === 0 && !validClientStep()) return;
    if (createMode === "normal" && createStep === 1 && !form.description.trim()) {
      toast.error("Descreve o pedido do cliente."); return;
    }
    setCreateStep((s) => s + 1);
  };

  // Enter avança para o campo seguinte (Nome -> Telefone -> Email -> avança
  // de passo). Shift+Enter volta ao campo anterior; Ctrl/Cmd+Enter avança
  // logo de passo a partir de qualquer um dos três campos — atalhos extra,
  // não obrigam a chegar ao último campo primeiro.
  const handleClientEnter = (nextRef, prevRef) => (e) => {
    if (e.key !== "Enter") return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); wizardNext(); return; }
    if (e.shiftKey) { e.preventDefault(); (prevRef || clientNameRef).current?.focus(); return; }
    e.preventDefault();
    if (nextRef) nextRef.current?.focus();
    else wizardNext();
  };

  // "Detalhe que impressiona": colar "Bernardo Santos - 917100512" (ou
  // .../ + email) no campo de nome separa automaticamente os três campos.
  const handleDetectContact = (parsed) => {
    applyClientData({
      name: parsed.name || undefined,
      phone: parsed.phone ? (parsed.phone.startsWith("+") ? parsed.phone : `${DEFAULT_COUNTRY_CODE}${parsed.phone}`) : undefined,
      email: parsed.email || undefined,
    });
  };

  const createBandPedido = async () => {
    if (!validClientStep()) return;
    const v = validateCaixilhariaSpec(caixSpec, caixCatalog);
    if (!v.ok) { toast.error(v.error); return; }
    (v.warnings || []).forEach((warning) => toast.warning(warning));
    setCreating(true);
    try {
      const lbl = caixilhariaLabels(caixCatalog, caixSpec);
      const { data } = await api.post("/notes", {
        customer_name: form.customer_name, phone: form.phone, email: form.email,
        description: `Caixilharia à medida — ${lbl.produto}`,
        category: "construcao", labels: ["À medida"], priority: form.priority || "media",
      });
      await api.put(`/notes/${data.id}/caixilharia`, {
        ...normalizeCaixilhariaSpec(caixSpec), linhas: v.linhas,
      });
      // Associa (ou cria) o fornecedor BandAluminios automaticamente.
      let supplierId = (suppliers || []).find((s) => /band/i.test(s.name || ""))?.id;
      if (!supplierId && caixCatalog?.supplier) {
        try {
          const { data: sup } = await api.post("/suppliers", caixCatalog.supplier);
          supplierId = sup.id;
        } catch { /* segue sem fornecedor associado */ }
      }
      if (supplierId) {
        await api.put(`/notes/${data.id}`, { supplier_id: supplierId });
        setEmailSupplier(supplierId);
      }
      localStorage.removeItem(DRAFT_KEY);
      dirty.current = false;
      setId(data.id);
      await loadNote(data.id);
      await loadSub(data.id);
      setTab("orcamentos");
      onChanged && onChanged();
      toast.success("Pedido à medida criado — email pronto na aba Orçamentos");
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao criar o pedido à medida"));
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (status) => {
    try {
      await api.patch(`/notes/${id}/status`, { status });
      toast.success("Estado atualizado");
      await refreshChrome();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mudar de estado"));
    }
  };
  const changePriority = async (priority) => {
    set("priority", priority);
    try {
      await api.put(`/notes/${id}`, { priority });
      await refreshChrome();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mudar a prioridade"));
    }
  };
  const advance = async () => {
    if (!note?.next_status) return;
    const mode = getNextActionMode(note);
    if (mode !== "status") {
      setTab("orcamentos");
      const guidance = {
        compose_supplier_email: "Revê e envia o email ao fornecedor. O estado muda automaticamente depois do envio.",
        record_quote: "Regista o orçamento recebido. O estado muda automaticamente quando o guardares.",
        reply_to_client: "Prepara a resposta ao cliente e anexa o orçamento antes de registar o envio.",
        record_client_decision: "Regista a decisão aprovando um orçamento ou escolhendo o estado adequado.",
      };
      toast.message(getNextActionCta(note), { description: guidance[mode] });
      return;
    }
    await changeStatus(note.next_status);
  };
  const remove = async () => {
    const who = note?.customer_name || "este pedido";
    if (!window.confirm(`Mover o pedido de ${who} para a lixeira? Orçamentos, histórico e lembretes ficam guardados — podes restaurar tudo depois, na Lixeira.`)) return;
    try {
      await api.delete(`/notes/${id}`);
      toast.success("Pedido movido para a lixeira");
      onChanged && onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mover para a lixeira"));
    }
  };
  const resolveNote = async () => {
    try {
      await api.post(`/notes/${id}/resolve`);
      toast.success("Pedido resolvido e arquivado");
      await refreshChrome();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao resolver o pedido"));
    }
  };
  const reopenNote = async () => {
    try {
      await api.post(`/notes/${id}/reopen`);
      toast.success("Pedido reaberto");
      await refreshChrome();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao reabrir o pedido"));
    }
  };

  const addLabel = async (val) => {
    const v = (val || labelInput).trim();
    if (!v || form.labels.includes(v)) { setLabelInput(""); return; }
    const labels = [...form.labels, v];
    set("labels", labels); setLabelInput("");
    if (!isCreate) {
      try {
        await api.put(`/notes/${id}`, { labels });
        dirty.current = false;
        await refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, "Não foi possível adicionar a etiqueta"));
      }
    }
  };
  const removeLabel = async (val) => {
    const labels = form.labels.filter((l) => l !== val);
    set("labels", labels);
    if (!isCreate) {
      try {
        await api.put(`/notes/${id}`, { labels });
        dirty.current = false;
        await refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, "Não foi possível remover a etiqueta"));
      }
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/notes/${id}/comment`, { message: comment.trim() });
      setComment("");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível adicionar o comentário"));
    }
  };

  const [loggingEvent, setLoggingEvent] = useState("");
  const quickLog = async (event) => {
    setLoggingEvent(event);
    try {
      await api.post(`/notes/${id}/quick-log`, { event });
      toast.success("Registado na cronologia");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível registar"));
    } finally {
      setLoggingEvent("");
    }
  };

  const addTask = async () => {
    if (!newTask.title.trim()) { toast.error("Escreve o lembrete."); return; }
    try {
      await api.post(`/notes/${id}/tasks`, { title: newTask.title.trim(), due_date: newTask.due_date });
      setNewTask({ title: "", due_date: "" });
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar o lembrete"));
    }
  };
  const toggleTask = async (t) => {
    try {
      await api.patch(`/tasks/${t.id}/toggle`);
      await loadSub(id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível atualizar o lembrete"));
    }
  };
  const deleteTask = async (tid) => {
    try {
      await api.delete(`/tasks/${tid}`);
      await loadSub(id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível eliminar o lembrete"));
    }
  };

  // Load template (autofill by supplier / reminder) when supplier or reminder toggled
  const loadTemplate = async (supplierId, reminder) => {
    try {
      const { data } = await api.get(`/notes/${id}/quote-template`, { params: { supplier_id: supplierId || "", is_reminder: reminder } });
      setEmailData({ subject: data.subject, body: data.body });
    } catch { setEmailData(buildEmail({ ...form })); }
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(`${emailData.subject}\n\n${emailData.body}`);
    toast.success("Email copiado");
  };
  const sendEmail = async () => {
    if (!emailSupplier) { toast.error("Escolhe um fornecedor."); return; }
    const sup = suppliers.find((s) => s.id === emailSupplier);
    const kind = isReminder ? "o LEMBRETE" : "o pedido de cotação";
    if (!window.confirm(`Confirmar envio d${kind} a ${sup?.name || "fornecedor"} (${sup?.email || "sem email"})?\n\nAssunto: ${emailData.subject}`)) return;
    setSending(true);
    try {
      await api.post(`/notes/${id}/send-quote-request`, {
        supplier_id: emailSupplier, subject: emailData.subject, body: emailData.body, is_reminder: isReminder,
      });
      toast.success(isReminder ? "Lembrete enviado!" : "Email enviado ao fornecedor!");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao enviar email"));
    } finally {
      setSending(false);
    }
  };

  const copyClientEmail = async () => {
    await navigator.clipboard.writeText(`${clientEmailData.subject}\n\n${clientEmailData.body}`);
    toast.success("Resposta ao cliente copiada");
  };
  const openClientEmail = () => {
    const to = (form.email || clientEmailData.to || "").trim();
    if (!to) { toast.error("Adiciona primeiro o email do cliente nos Detalhes."); return; }
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(clientEmailData.subject)}&body=${encodeURIComponent(clientEmailData.body)}`;
    window.location.href = url;
  };
  const registerClientEmail = async () => {
    try {
      await api.post(`/notes/${id}/contact-client`, {
        method: "email",
        message: "Orçamento enviado ao cliente",
      });
      toast.success("Envio ao cliente registado");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível registar o envio"));
    }
  };
  // Envio direto ao cliente — só acontece por clique explícito neste botão.
  const sendClientEmail = async () => {
    if (sendingClient) return;
    if (!window.confirm(`Confirmar envio do orçamento ao CLIENTE (${form.email})?\n\nAssunto: ${clientEmailData.subject}`)) return;
    setSendingClient(true);
    try {
      const { data } = await api.post(`/notes/${id}/send-client-email`, {
        subject: clientEmailData.subject, body: clientEmailData.body,
      });
      toast.success(`Email enviado ao cliente (${data.to})`);
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar o email ao cliente"));
    } finally {
      setSendingClient(false);
    }
  };
  // Verificação manual da caixa de entrada — só leitura, nunca envia nada.
  const syncEmails = async () => {
    if (syncingEmails) return;
    setSyncingEmails(true);
    try {
      const { data } = await api.post("/emails/sync");
      toast.success(data.new ? `${data.new} resposta(s) nova(s) associada(s)` : "Sem respostas novas de fornecedores");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível verificar a caixa de entrada"));
    } finally {
      setSyncingEmails(false);
    }
  };

  // ---- Orçamento do fornecedor (PDF) → PDF de venda ao cliente ----
  const uploadSupplierPdf = async (file) => {
    if (!file) return;
    setImportingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/notes/${id}/supplier-pdf`, fd);
      toast.success("Orçamento do fornecedor importado — revê os preços de venda");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível ler o PDF do fornecedor"));
    } finally {
      setImportingPdf(false);
      if (supplierPdfInputRef.current) supplierPdfInputRef.current.value = "";
    }
  };

  // ---- Fotos do pedido ----
  const uploadPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploadingPhotos(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const { data } = await api.post(`/notes/${id}/photos`, fd);
      setPhotos((prev) => [...prev, ...data]);
      toast.success(`${data.length} foto${data.length === 1 ? "" : "s"} adicionada${data.length === 1 ? "" : "s"}`);
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível adicionar as fotos"));
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const deletePhoto = async (photoId) => {
    setDeletingPhotoId(photoId);
    try {
      await api.delete(`/notes/${id}/photos/${photoId}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (lightboxPhoto?.id === photoId) setLightboxPhoto(null);
      onChanged && onChanged();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível remover a foto"));
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const setSqItem = (n, patch) => {
    setSq((q) => ({ ...q, items: q.items.map((i) => (i.n === n ? { ...i, ...patch } : i)) }));
  };
  // Lógica de preço EXATA do software da loja (Bricomarché/Les Mousquetaires):
  // a margem é definida sobre o preço de venda final com IVA, não sobre o
  // custo — margem = 1/(1+IVA) - custo/PV. Só a margem é editável; o
  // coeficiente e o preço final são sempre recalculados automaticamente
  // com esta fórmula (nunca escritos ou corrigidos à mão), replicando ao
  // cêntimo os valores do software oficial. Espelha backend/quote_pdf.py.
  const IVA_RATE = 0.23;
  const MAX_MARGIN_PCT = Math.round(((1 / (1 + IVA_RATE)) * 100 - 1) * 10) / 10; // 80.3
  const roundHalfUp = (value, digits) => {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };
  // Preço "redondo" ao cliente: sobe sempre para um valor comercial (nunca
  // desce, para a margem nunca ficar abaixo da configurada), com o múltiplo
  // a crescer com o valor do artigo. Espelha backend/quote_pdf.py
  // (PRICE_ROUND_TIERS): <100€ → euro inteiro · 100–500€ → 5€ · 500–5000€
  // → 5€ · 5000–20000€ → 10€ · ≥20000€ → 50€.
  const PRICE_ROUND_TIERS = [[100, 1], [500, 5], [5000, 5], [20000, 10]];
  const PRICE_ROUND_STEP_ABOVE = 50;
  const roundUpToStep = (value, step) => (value > 0 && step > 0 ? Math.ceil(value / step) * step : value);
  const roundCommercial = (value) => {
    const tier = PRICE_ROUND_TIERS.find(([ceiling]) => value < ceiling);
    return roundUpToStep(value, tier ? tier[1] : PRICE_ROUND_STEP_ABOVE);
  };
  const priceCoefficient = (marginPct) => {
    const denom = 1 / (1 + IVA_RATE) - (parseFloat(marginPct) || 0) / 100;
    return denom > 0 ? 1 / denom : null;
  };
  const suggestClientPrice = (cost, marginPct) => {
    const coef = priceCoefficient(marginPct);
    if (!cost || cost <= 0 || coef == null) return 0;
    return roundCommercial(cost * coef);
  };
  const applyItemMargin = (n, pct) => {
    setSq((q) => ({
      ...q,
      items: q.items.map((i) => {
        if (i.n !== n) return i;
        const coef = priceCoefficient(pct);
        const price = suggestClientPrice(i.supplier_unit_price, pct);
        return {
          ...i, margin_pct: pct, client_price: price,
          coefficient: coef != null ? roundHalfUp(coef, 3) : i.coefficient,
        };
      }),
    }));
  };
  const saveSupplierQuote = async () => {
    await api.put(`/notes/${id}/supplier-quote`, {
      items: sq.items.map(({ n, description, qty, margin_pct, include }) => ({
        n, description, qty: parseInt(qty, 10) || 1,
        margin_pct: parseFloat(margin_pct) || 18, include: include !== false,
      })),
    });
  };
  const generateClientPdf = async () => {
    setGeneratingPdf(true);
    try {
      await saveSupplierQuote();
      const res = await api.post(`/notes/${id}/client-pdf`, null, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_${(sq.quote_number || "cliente").replace(/[^A-Za-z0-9]+/g, "_")}_cliente.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado — email ao cliente pronto para confirmar");
      await refresh();
      // O email já está preparado com o PDF anexado — abre logo a confirmação.
      setConfirmSendOpen(true);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível gerar o PDF"));
    } finally {
      setGeneratingPdf(false);
    }
  };
  const generateAiSummary = async () => {
    setSummarizing(true);
    try {
      const { data } = await api.post(`/notes/${id}/ai-summary`);
      setAiSummary(data.summary || "");
      toast.success("Resumo gerado");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível gerar o resumo"));
    } finally {
      setSummarizing(false);
    }
  };
  const sqTotal = (sq?.items || [])
    .filter((i) => i.include !== false)
    .reduce((acc, i) => acc + (parseFloat(i.client_price) || 0) * (parseInt(i.qty, 10) || 1), 0);
  // Margem final efetiva — mesma definição da loja (sobre o PV c/ IVA, não
  // sobre o custo): margem = 1/(1+IVA) - custo/PV. É o número a reportar.
  const itemEffMargin = (i) => {
    const price = parseFloat(i.client_price) || 0;
    if (price <= 0) return null;
    return (1 / (1 + IVA_RATE) - (i.supplier_unit_price || 0) / price) * 100;
  };
  const sqCostTotal = (sq?.items || [])
    .filter((i) => i.include !== false)
    .reduce((acc, i) => acc + (i.supplier_unit_price || 0) * (parseInt(i.qty, 10) || 1), 0);
  const sqEffMargin = sqTotal > 0 ? (1 / (1 + IVA_RATE) - sqCostTotal / sqTotal) * 100 : null;

  const selectedSupplier = suppliers.find((s) => s.id === emailSupplier);
  const st = note ? getStatusCfg(note.status) : null;

  // Conteúdo do nível de topo da pilha — email recebido, PDF em anexo ou
  // ficha de fornecedor. Substitui as abas normais enquanto a pilha não
  // está vazia; ver EntityStackBar para a navegação entre níveis.
  const renderStackFrame = (frame) => {
    if (!frame) return null;
    if (frame.kind === "fornecedor") {
      const s = frame.data;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-h3 text-foreground">{s.name}</p>
              <p className="text-xs text-muted-foreground">Fornecedor</p>
            </div>
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-muted/60 p-4 text-sm">
            {s.email ? (
              <a href={`mailto:${s.email}`} className="flex items-center gap-2 font-mono text-xs text-foreground hover:underline">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {s.email}
              </a>
            ) : <p className="text-xs text-destructive">Sem email definido</p>}
            {s.phone ? (
              <a href={`tel:${s.phone}`} className="flex items-center gap-2 font-mono text-xs text-foreground hover:underline">
                <PhoneCall className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {formatPhoneDisplay(s.phone)}
              </a>
            ) : null}
          </div>
          {(s.contacts || []).filter((c) => c.name || c.phone || c.email).length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-label uppercase text-muted-foreground">Contactos</p>
              {s.contacts.filter((c) => c.name || c.phone || c.email).map((c, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-2.5 text-xs">
                  {c.name ? <span className="font-bold text-foreground">{c.name}</span> : null}
                  {c.phone ? <span className="ml-2 font-mono text-muted-foreground">{formatPhoneDisplay(c.phone)}</span> : null}
                  {c.email ? <span className="ml-2 font-mono text-muted-foreground">{c.email}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {s.notes ? <p className="text-xs text-muted-foreground">{s.notes}</p> : null}
        </div>
      );
    }
    if (frame.kind === "email") {
      const m = frame.data;
      const supplierOfEmail = m.supplier_id ? suppliers.find((s) => s.id === m.supplier_id) : null;
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-foreground">{m.supplier_name || m.from_name || m.from_email}</p>
            <p className="text-xs text-muted-foreground">{m.subject || "(sem assunto)"}</p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(m.received_at)}</p>
          </div>
          {supplierOfEmail ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs"
              onClick={() => pushFrame({ kind: "fornecedor", label: supplierOfEmail.name, data: supplierOfEmail })}
            >
              <Building2 className="mr-1.5 h-3.5 w-3.5" /> Ver fornecedor
            </Button>
          ) : null}
          {m.body_html ? (
            <div
              className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-card p-3 font-sans text-xs text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-blue-600 [&_a]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: m.body_html }}
            />
          ) : (
            <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-3 font-sans text-xs text-foreground">{m.body || "(sem texto)"}</pre>
          )}
          {(m.attachments || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {m.attachments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pushFrame({
                    kind: "pdf",
                    label: a.filename,
                    data: { url: withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`), filename: a.filename, contentType: a.content_type },
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-red-300 hover:text-[color:var(--pastel-red-text)]"
                >
                  <FileText className="h-3.5 w-3.5" /> {a.filename}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    if (frame.kind === "sent_email") {
      const m = frame.data;
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-foreground">{m.to_label || m.to}</p>
            <p className="text-xs text-muted-foreground">{m.subject || "(sem assunto)"}</p>
            <p className="text-[11px] text-muted-foreground">{timeAgo(m.sent_at)}</p>
            {m.status === "erro" ? (
              <p className="mt-1 text-xs font-semibold text-[color:var(--pastel-red-text)]">
                Falha ao enviar{m.error ? `: ${m.error}` : ""}
              </p>
            ) : null}
          </div>
          <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-3 font-sans text-xs text-foreground">{m.body || "(sem texto)"}</pre>
          {(m.attachments || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {m.attachments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pushFrame({
                    kind: "pdf",
                    label: a.filename,
                    data: { url: withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`), filename: a.filename },
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-red-300 hover:text-[color:var(--pastel-red-text)]"
                >
                  <FileText className="h-3.5 w-3.5" /> {a.filename}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    if (frame.kind === "pdf") {
      const a = frame.data;
      const kind = previewKind(a.filename, a.contentType);
      return (
        <div className="flex h-full flex-col gap-3">
          <a href={a.url} download={a.filename} target="_blank" rel="noreferrer" className="self-start">
            <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Descarregar
            </Button>
          </a>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted">
            {kind === "image" ? (
              <img src={a.url} alt={a.filename} className="mx-auto max-h-[65vh] w-auto object-contain" />
            ) : kind === "pdf" ? (
              <iframe title={a.filename} src={a.url} className="h-[65vh] w-full border-0 bg-card" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileWarning className="h-6 w-6" />
                Pré-visualização não disponível para este tipo de ficheiro.
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-dialog"
        className={`flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[94vh] sm:w-full ${isCreate && createMode === "band" ? "sm:max-w-5xl xl:max-w-6xl 3xl:max-w-7xl" : "sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl 3xl:max-w-6xl"}`}
        onEscapeKeyDown={(e) => {
          // Esc só fecha quando não há nada por guardar — evita perder um
          // rascunho a meio (criação) ou uma edição em curso por engano.
          if (!dirty.current) return;
          e.preventDefault();
          toast.message("Tens alterações por guardar", {
            description: isCreate ? "Fecha pelo X se quiseres mesmo descartar o rascunho." : "Guarda ou cancela a edição antes de fechar.",
          });
          haptics.warning();
        }}
      >
        {/* Header (fixed) */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate font-heading text-h3">
                {isCreate
                  ? (createMode === "band" ? "Pedido à medida — BandAluminios" : "Novo pedido de orçamento")
                  : (form.customer_name || "Pedido")}
              </DialogTitle>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {isCreate
                  ? (createMode === "choice"
                    ? "Escolhe o tipo de pedido"
                    : `Passo ${createStep + 1} de ${createSteps.length} — ${createSteps[createStep]}`)
                  : (form.phone
                    ? (
                      <span className="inline-flex items-center gap-1">
                        <a href={`tel:${form.phone}`} title="Ligar ao cliente" className="font-mono hover:text-foreground hover:underline">{formatPhoneDisplay(form.phone)}</a>
                        {phoneWaLink(form.phone) ? (
                          <a href={phoneWaLink(form.phone)} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" className="rounded p-0.5 text-muted-foreground hover:bg-[var(--pastel-emerald-bg)] hover:text-emerald-600">
                            <MessageCircle className="h-3 w-3" />
                          </a>
                        ) : null}
                      </span>
                    )
                    : "Sem telefone")}
                {!isCreate && autoState === "saving" ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Spinner className="h-3 w-3" /> a guardar…</span> : null}
                {!isCreate && autoState === "saved" ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" /> guardado</span> : null}
                {!isCreate && autoState === "error" ? <span className="inline-flex items-center gap-1 text-destructive" title={autoError}><AlertTriangle className="h-3 w-3" /> {autoError}</span> : null}
              </p>
              {!isCreate && note ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground" title={`Atualizado ${timeAgo(note.updated_at)}`}>
                  Criado {formatDateTime(note.created_at)} · atualizado {formatDateTime(note.updated_at)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Quick actions — grelha compacta no telemóvel, linha em ecrãs maiores */}
          {!isCreate && note ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Select value={note.status} onValueChange={changeStatus}>
                <SelectTrigger data-testid="quick-status" className="h-9 w-full gap-1.5 rounded-lg border-0 text-xs font-bold sm:w-auto sm:shrink-0" style={{ backgroundColor: st.bg, color: st.text }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`status-opt-${s}`}>{getStatusCfg(s).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={note.priority} onValueChange={changePriority}>
                <SelectTrigger data-testid="quick-priority" className="h-9 w-full gap-1.5 rounded-lg text-xs font-semibold sm:w-auto sm:shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {note.next_status ? (
                <Button data-testid="detail-advance" size="sm" onClick={advance} className="col-span-2 h-9 w-full rounded-lg sm:col-span-1 sm:w-auto sm:shrink-0">
                  <Zap className="mr-1.5 h-3.5 w-3.5" /> {getNextActionCta(note)}
                </Button>
              ) : null}
              {note.archived ? (
                <Button data-testid="detail-reopen" size="sm" variant="outline" onClick={reopenNote} className="h-9 w-full rounded-lg sm:w-auto sm:shrink-0">Reabrir</Button>
              ) : (
                <Button data-testid="detail-resolve" size="sm" variant="outline" onClick={resolveNote} className="h-9 w-full rounded-lg border-emerald-200 text-[color:var(--pastel-emerald-text)] hover:bg-[var(--pastel-emerald-bg)] sm:w-auto sm:shrink-0">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolver
                </Button>
              )}
              {/* Visualização vs edição: os dados do pedido só ficam editáveis
                  depois de premir "Editar" — o estado/prioridade acima
                  continuam sempre disponíveis, sem precisar de entrar em
                  modo de edição. */}
              {editMode ? (
                <>
                  <Button data-testid="detail-save" size="sm" onClick={saveDetails} disabled={saving} className="col-span-2 h-9 w-full rounded-lg bg-success hover:bg-success/90 sm:col-span-1 sm:w-auto sm:shrink-0">
                    {saving ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Check className="mr-1.5 h-3.5 w-3.5" />} Guardar
                  </Button>
                  <Button data-testid="detail-cancel-edit" size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="h-9 w-full rounded-lg sm:w-auto sm:shrink-0">
                    <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </>
              ) : (
                <Button data-testid="detail-edit" size="sm" variant="outline" onClick={startEdit} className="h-9 w-full rounded-lg border-border font-bold sm:w-auto sm:shrink-0">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
              )}

              <Button data-testid="detail-delete" size="sm" variant="outline" onClick={remove} className="h-9 w-full rounded-lg border-destructive/30 text-destructive hover:bg-[var(--pastel-red-bg)] sm:ml-auto sm:w-auto sm:shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        {/* Next action banner */}
        {!isCreate && note?.next_action ? (
          <div className={`shrink-0 border-b px-4 py-2.5 text-xs sm:px-6 ${note.is_overdue ? "border-red-100 bg-[var(--pastel-red-bg)] text-[color:var(--pastel-red-text)]" : "border-blue-100 bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]"}`}>
            <span className="font-bold">{note.is_overdue ? `Atrasado ${note.waiting_days}d · ` : "Próxima ação: "}</span>
            {note.next_action}
          </div>
        ) : null}

        {isCreate ? (
          /* ---------- Assistente de criação por etapas ---------- */
          <div ref={contentScrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-3 pb-0 sm:px-6 sm:pt-5">
            {createMode === "choice" ? (
              <div className="space-y-3">
                <p className="text-sm font-bold text-foreground">O que precisa de pedir?</p>
                <button
                  data-testid="create-mode-band"
                  onClick={() => { setCreateMode("band"); setCreateStep(0); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground hover:bg-muted"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                    <Frame className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">Caixilharia à medida — BandAluminios</span>
                    <span className="block text-xs text-text-body">Janelas, portas, portadas e redes mosquiteiras com medidas, para pedir cotação ao fornecedor</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <button
                  data-testid="create-mode-normal"
                  onClick={() => { setCreateMode("normal"); setCreateStep(0); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground hover:bg-muted"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Store className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">Pedido normal de loja</span>
                    <span className="block text-xs text-text-body">Qualquer outro artigo: preço, encomenda ou disponibilidade junto de um fornecedor</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                {/* Progresso */}
                <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {createSteps.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < createStep ? "bg-success text-success-foreground" : i === createStep ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                        {i < createStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className={`text-xs font-semibold ${i === createStep ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                      {i < createSteps.length - 1 ? <span className="h-px w-4 bg-muted" /> : null}
                    </div>
                  ))}
                </div>

                {/* Passo 1 — Cliente (comum aos dois fluxos) */}
                {createStep === 0 ? (
                  <>
                    {checkingDup && dupWarn.length === 0 ? (
                      <p className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Spinner className="h-3 w-3" /> a verificar duplicados…
                      </p>
                    ) : null}
                    {dupWarn.length > 0 ? (
                      <div data-testid="dup-warning" className="mb-4 rounded-xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3 text-sm text-[color:var(--pastel-amber-text)]">
                        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Possível pedido duplicado</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {dupWarn.map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                              <span>• {d.customer_name} — {d.description || "sem descrição"} <span className="opacity-70">({getStatusCfg(d.status).label})</span></span>
                              <button
                                type="button"
                                onClick={() => applyClientData({ name: d.customer_name, phone: d.phone, email: d.email })}
                                className="shrink-0 rounded-md border border-amber-300 bg-white/60 px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--pastel-amber-text)] hover:bg-white"
                              >
                                Usar estes dados
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="relative space-y-1.5">
                        <Label>Nome do cliente</Label>
                        <NameInput
                          testId="input-customer-name"
                          value={form.customer_name}
                          onChange={(v) => { set("customer_name", v); setSuggestDismissed(false); }}
                          onBlur={() => setSuggestDismissed(true)}
                          onKeyDown={handleClientEnter(clientPhoneRef, null)}
                          onDetectContact={handleDetectContact}
                          inputRef={clientNameRef}
                          placeholder="Ex.: Teresa Mera"
                          highlighted={highlightFields.has("name")}
                        />
                        {clientSuggestions.length > 0 ? (
                          <div data-testid="client-suggestions" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                            {clientSuggestions.map((c) => (
                              <button
                                key={c.key}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyClientData({ name: c.name, phone: c.phone, email: c.email })}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                              >
                                <span className="min-w-0 truncate font-semibold text-foreground">{c.name}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {c.phone ? formatPhoneDisplay(c.phone) : ""}{c.pedidos_count ? ` · ${c.pedidos_count} pedido(s)` : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Telefone</Label>
                        <PhoneInput
                          value={form.phone}
                          onChange={(v) => set("phone", v)}
                          onKeyDown={handleClientEnter(clientEmailRef, clientNameRef)}
                          inputRef={clientPhoneRef}
                          onComplete={() => clientEmailRef.current?.focus()}
                          highlighted={highlightFields.has("phone")}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <Label>Email do cliente (opcional)</Label>
                      <EmailInput
                        testId="input-email"
                        value={form.email}
                        onChange={(v) => set("email", v)}
                        onKeyDown={handleClientEnter(null, clientPhoneRef)}
                        inputRef={clientEmailRef}
                        placeholder="cliente@email.com"
                        highlighted={highlightFields.has("email")}
                      />
                    </div>
                  </>
                ) : null}

                {/* Mini-resumo do cliente — visível a partir do passo 2, para
                    não precisar de voltar atrás só para confirmar quem é o
                    cliente (o passo "Confirmar" do fluxo normal já tem o seu
                    próprio resumo mais completo, por isso fica só aqui). */}
                {createStep === 1 ? (
                  <div className="mb-4 truncate rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                    Cliente: <span className="font-semibold text-foreground">{form.customer_name || "Sem nome"}</span>
                    {form.phone ? ` · ${formatPhoneDisplay(form.phone)}` : ""}
                  </div>
                ) : null}

                {/* Passo 2 (normal) — artigo e especificação essencial */}
                {createMode === "normal" && createStep === 1 ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Pedido do cliente</Label>
                      <Textarea
                        data-testid="input-description"
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                        rows={3}
                        className="transition-[height] duration-150"
                        placeholder="Ex.: Motosserra a bateria 40V, cor, prazo, condições..."
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Secção</Label>
                        <Select value={form.category} onValueChange={(v) => set("category", v)}>
                          <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key} data-testid={`category-option-${c.key}`}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Quantidade</Label>
                        <Input data-testid="input-quantity" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Ex.: 2 unidades" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <Label>Código EAN13 (opcional)</Label>
                      <Input data-testid="input-reference" value={form.reference} onChange={(e) => set("reference", e.target.value)} className="font-mono" placeholder="Ex.: 5601234567890" />
                    </div>
                  </>
                ) : null}

                {/* Passo 3 (normal) — Confirmar */}
                {createMode === "normal" && createStep === 2 ? (
                  <>
                    <div className="rounded-xl border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
                      <p><span className="font-bold text-foreground">{form.customer_name || "Sem nome"}</span>{form.phone ? ` · ${formatPhoneDisplay(form.phone)}` : ""}</p>
                      <p className="mt-0.5">{form.description}{form.quantity ? ` — ${form.quantity}` : ""}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Prioridade</Label>
                        <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                          <SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITY_ORDER.map((p) => <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fornecedor preferido (opcional)</Label>
                        <Select value={form.supplier_id || "none"} onValueChange={(v) => set("supplier_id", v === "none" ? "" : v)}>
                          <SelectTrigger data-testid="select-pref-supplier"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                ) : null}

                {/* Passo 2 (BandAluminios) — Caixilharia */}
                {createMode === "band" && createStep === 1 ? (
                  !caixCatalog ? (
                    <div className="flex justify-center py-10"><Spinner className="h-6 w-6 text-muted-foreground" /></div>
                  ) : (
                    <>
                      <CaixilhariaForm catalog={caixCatalog} spec={caixSpec} onChange={setCaixSpec} />
                      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        Ao criar, o fornecedor BandAluminios é associado automaticamente e o email fica pronto na aba «Orçamentos».
                      </p>
                    </>
                  )
                ) : null}

                {/* Navegação */}
                <div className="sticky bottom-0 z-20 -mx-3 mt-6 flex gap-2 border-t border-border bg-card/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 sm:pb-4">
                  <Button data-testid="wizard-back" variant="outline" onClick={wizardBack} className="rounded-xl">
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
                  </Button>
                  {!isLastStep ? (
                    <Button
                      data-testid="wizard-next"
                      onClick={wizardNext}
                      disabled={createStep === 0 && !!clientStepIssue}
                      className="flex-1 rounded-xl transition-opacity duration-150"
                    >
                      Continuar <ChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  ) : createMode === "band" ? (
                    <Button data-testid="wizard-create-band" onClick={createBandPedido} disabled={creating || !caixCatalog} className="flex-1 rounded-xl">
                      {showCreatingSpinner ? <Spinner className="mr-2 h-4 w-4" /> : null} Criar pedido à medida
                    </Button>
                  ) : (
                    <Button data-testid="save-note-btn" onClick={saveDetails} disabled={saving} className="flex-1 rounded-xl">
                      {showSaveSpinner ? <Spinner className="mr-2 h-4 w-4" /> : null} Criar pedido
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : stack.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <EntityStackBar
              rootLabel={form.customer_name || "Pedido"}
              frames={stack}
              onPopTo={popTo}
              onClose={() => setStack([])}
            />
            <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
              {renderStackFrame(stack[stack.length - 1])}
            </div>
          </div>
        ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-4 pt-2.5 sm:px-6 sm:pt-3">
            {/* No telemóvel as tabs deslizam na horizontal; em ecrãs maiores ocupam a largura toda */}
            <TabsList className="no-scrollbar flex w-full justify-start overflow-x-auto sm:grid sm:grid-cols-6">
              <TabsTrigger value="detalhes" data-testid="tab-detalhes" className="shrink-0 text-xs">Detalhes</TabsTrigger>
              <TabsTrigger value="orcamentos" data-testid="tab-orcamentos" className="shrink-0 text-xs" disabled={isCreate}>Orçamentos</TabsTrigger>
              <TabsTrigger value="comunicacao" data-testid="tab-comunicacao" className="shrink-0 text-xs" disabled={isCreate}>
                Comunicação{communication.summary?.total_emails ? ` (${communication.summary.total_emails})` : ""}
              </TabsTrigger>
              <TabsTrigger value="fotos" data-testid="tab-fotos" className="shrink-0 text-xs" disabled={isCreate}>
                Fotos{photos.length ? ` (${photos.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="cronologia" data-testid="tab-cronologia" className="shrink-0 text-xs" disabled={isCreate}>Cronologia</TabsTrigger>
              <TabsTrigger value="tarefas" data-testid="tab-tarefas" className="shrink-0 text-xs" disabled={isCreate}>Lembretes</TabsTrigger>
            </TabsList>
          </div>

          <div ref={contentScrollRef} data-testid="note-scroll-area" className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
            {/* DETALHES — informação agrupada por categorias com separadores */}
            <TabsContent value="detalhes" className="mt-0 focus-visible:outline-none">
              <SectionTitle first title="Cliente" />
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Nome do cliente
                      {fieldChanged("customer_name") ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" title="Alterado desde a abertura" /> : null}
                    </Label>
                    <NameInput testId="input-customer-name" value={form.customer_name} onChange={(v) => set("customer_name", v)} placeholder="Ex.: Teresa Mera" />
                  </div>
                ) : (
                  <ViewField label="Nome do cliente" value={form.customer_name} />
                )}
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Telefone
                      {fieldChanged("phone") ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" title="Alterado desde a abertura" /> : null}
                    </Label>
                    <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
                  </div>
                ) : (
                  <ViewField label="Telefone" value={formatPhoneDisplay(form.phone)} mono link={form.phone ? `tel:${form.phone}` : null} />
                )}
              </div>
              {editMode ? (
                <div className="mt-4 space-y-1.5">
                  <Label className="flex items-center">
                    Email do cliente
                    {fieldChanged("email") ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" title="Alterado desde a abertura" /> : null}
                  </Label>
                  <EmailInput testId="input-email" value={form.email} onChange={(v) => set("email", v)} placeholder="cliente@email.com" />
                </div>
              ) : (
                <div className="mt-4">
                  <ViewField label="Email do cliente" value={form.email} link={form.email ? `mailto:${form.email}` : null} />
                </div>
              )}

              <SectionTitle title="Artigo" />
              {editMode ? (
                <div className="mt-3 space-y-1.5">
                  <Label>Pedido do cliente</Label>
                  <Textarea
                    data-testid="input-description"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    rows={3}
                    className="transition-[height] duration-150"
                    placeholder="Ex.: Janela de correr alumínio, cor, prazo, condições..."
                  />
                </div>
              ) : (
                <div className="mt-3">
                  <ViewField label="Pedido do cliente" value={form.description} multiline />
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {editMode ? (
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <Label>Código EAN13</Label>
                    <Input data-testid="input-reference" value={form.reference} onChange={(e) => set("reference", e.target.value)} className="font-mono" placeholder="Ex.: 5601234567890" />
                  </div>
                ) : (
                  <div className="col-span-2 sm:col-span-1">
                    <ViewField label="Código EAN13" value={form.reference} mono />
                  </div>
                )}
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label>Secção</Label>
                    <Select value={form.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key} data-testid={`category-option-${c.key}`}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <ViewField label="Secção" value={CATEGORY_LIST.find((c) => c.key === form.category)?.label} />
                )}
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label>Quantidade</Label>
                    <Input data-testid="input-quantity" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Ex.: 2 unidades" />
                  </div>
                ) : (
                  <ViewField label="Quantidade" value={form.quantity} />
                )}
              </div>
              {/* Caixilharia à medida (BandAluminios) — só em pedidos criados no
                  fluxo à medida; um pedido normal de loja nunca ganha caixilharia */}
              {!isCreate && note?.caixilharia ? (
                <div className="mt-4 space-y-1.5">
                  <Label>Caixilharia à medida</Label>
                  {note?.caixilharia ? (
                    <div data-testid="caixilharia-summary" className="rounded-xl border border-border bg-muted/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                            <Frame className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {note.caixilharia.display?.produto || "Caixilharia à medida"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {note.caixilharia.display?.element_count
                              ? `${note.caixilharia.display.element_count} elemento(s) · ${note.caixilharia.display.option_count} opção(ões) · `
                              : ""}
                            {note.caixilharia.display?.total_un} un
                            {note.caixilharia.data_entrega ? ` · entrega ${note.caixilharia.data_entrega}` : ""}
                          </p>
                          {note.caixilharia.display?.comparison_count ? (
                            <span className="mt-1 inline-flex rounded-full bg-[var(--pastel-blue-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-blue-text)]">
                              {note.caixilharia.display.comparison_count} comparação(ões) de material
                            </span>
                          ) : null}
                        </div>
                        <Button data-testid="caixilharia-edit" size="sm" variant="outline" onClick={() => setCaixOpen(true)} className="h-8 shrink-0 rounded-lg text-xs">
                          Editar
                        </Button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {(note.caixilharia.display?.lines || []).map((line, index) => (
                          <div key={line.id || index} className="rounded-lg bg-card p-2 text-xs text-muted-foreground">
                            <p className="font-mono font-semibold text-foreground">
                              {index + 1}. {line.produto} — {line.quantidade} un — {line.largura_mm} × {line.altura_mm} mm
                              {line.sentido_abertura ? ` — ${line.sentido_abertura}` : ""}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(line.opcoes || []).map((option, optionIndex) => (
                                <span key={option.id || optionIndex} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  {String.fromCharCode(65 + optionIndex)} · {option.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {!note.caixilharia.display?.lines?.length ? (note.caixilharia.itens || []).map((item, index) => (
                          <p key={index} className="font-mono text-xs text-muted-foreground">
                            {item.quantidade} un — {item.largura_mm} × {item.altura_mm} mm{item.sentido_abertura ? ` — ${item.sentido_abertura}` : ""}
                          </p>
                        )) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isBricoavalEligible ? (
                <>
                  <SectionTitle title="Orçamento BricoAval" />
                  <div className="mt-3">
                    {editMode ? (
                      <div className="max-w-xs space-y-1.5">
                        <Label>Nº Orçamento BricoAval</Label>
                        <Input
                          data-testid="input-bricoaval-number" value={form.bricoaval_number}
                          onChange={(e) => set("bricoaval_number", e.target.value)}
                          className="font-mono" placeholder="#OM00001"
                        />
                      </div>
                    ) : form.bricoaval_number ? (
                      <div className="flex items-center gap-2">
                        <ViewField label="Nº Orçamento BricoAval" value={form.bricoaval_number} mono />
                        <Button
                          data-testid="copy-bricoaval-number" size="icon" variant="ghost" className="mt-4 h-7 w-7 shrink-0"
                          onClick={async () => { await navigator.clipboard.writeText(form.bricoaval_number); toast.success("Nº BricoAval copiado"); }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <ViewField label="Nº Orçamento BricoAval" value="" />
                    )}

                    {note?.bricoaval_summary ? (
                      <div data-testid="bricoaval-summary" className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/60 p-3 sm:grid-cols-3">
                        <ViewField label="Estado da comunicação" value={BRICOAVAL_STATUS_LABEL[note.bricoaval_summary.communication_status] || "—"} />
                        <ViewField label="Último email" value={formatDateTime(note.bricoaval_summary.last_email_at)} />
                        <ViewField label="Última resposta" value={formatDateTime(note.bricoaval_summary.last_reply_at)} />
                        <ViewField label="Última atividade" value={formatDateTime(note.bricoaval_summary.last_activity_at)} />
                        <ViewField label="Emails associados" value={String(note.bricoaval_summary.linked_emails_count)} />
                        <ViewField label="Documentos associados" value={String(note.bricoaval_summary.linked_documents_count)} />
                        <ViewField label="PDFs associados" value={String(note.bricoaval_summary.linked_pdfs_count)} />
                      </div>
                    ) : null}

                    {(note?.bricoaval_history || []).length > 0 ? (
                      <details className="mt-3">
                        <summary data-testid="bricoaval-history-toggle" className="cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground">
                          Histórico do número ({note.bricoaval_history.length})
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {[...note.bricoaval_history].reverse().map((h, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              <span className="font-mono">{h.from || "(nenhum)"}</span> → <span className="font-mono font-bold text-foreground">{h.to || "(removido)"}</span>
                              {" · "}{formatDateTime(h.changed_at)}{h.author ? ` · ${h.author}` : ""}
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </>
              ) : null}

              <SectionTitle title="Etiquetas" />
              <div className="mt-3 space-y-1.5">
                {form.labels.length === 0 && !editMode ? (
                  <p className="text-sm italic text-muted-foreground">Sem etiquetas.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.labels.map((l) => (
                      <span key={l} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                        <Tag className="h-3 w-3" /> {l}
                        {editMode ? (
                          <button data-testid={`remove-label-${l}`} onClick={() => removeLabel(l)} className="ml-0.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        ) : null}
                      </span>
                    ))}
                    {editMode ? (
                      <Input
                        data-testid="label-input"
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
                        placeholder="+ etiqueta"
                        className="h-8 w-32 rounded-full text-xs"
                      />
                    ) : null}
                  </div>
                )}
                {editMode ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(labelsList || []).filter((l) => !form.labels.includes(l)).slice(0, 6).map((l) => (
                      <button key={l} data-testid={`suggest-label-${l}`} onClick={() => addLabel(l)} className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-input hover:text-foreground">+ {l}</button>
                    ))}
                  </div>
                ) : null}
              </div>

              <SectionTitle title="Fornecedor e alertas" />
              {editMode ? (
                <div className="mt-3 space-y-1.5">
                  <Label>Fornecedor preferido</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => set("supplier_id", v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-pref-supplier"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="mt-3">
                  <ViewField label="Fornecedor preferido" value={suppliers.find((s) => s.id === form.supplier_id)?.name} />
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label>Prazo alerta (dias)</Label>
                    <Input data-testid="input-sla" type="number" min={1} value={form.sla_days} onChange={(e) => set("sla_days", parseInt(e.target.value) || 2)} className="font-mono" />
                  </div>
                ) : (
                  <ViewField label="Prazo alerta (dias)" value={form.sla_days} mono />
                )}
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label>Lembrete a cada (dias)</Label>
                    <Input data-testid="input-reminder-interval" type="number" min={1} value={form.reminder_interval_days} onChange={(e) => set("reminder_interval_days", parseInt(e.target.value) || 3)} className="font-mono" />
                  </div>
                ) : (
                  <ViewField label="Lembrete a cada (dias)" value={form.reminder_interval_days} mono />
                )}
              </div>

              {!isCreate && !editMode && preflight ? (
                <>
                  <SectionTitle title="Estado de completude" />
                  <div data-testid="preflight-panel" className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <p className={`flex items-center gap-1.5 text-xs font-extrabold ${preflight.ready ? "text-success" : "text-warning"}`}>
                      {preflight.ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {preflight.ready ? "Informação completa" : "Falta informação para avançar"}
                    </p>
                    {preflight.missing?.length ? (
                      <p className="mt-1.5 text-[11px] font-semibold text-warning">Em falta: {preflight.missing.join(", ")}</p>
                    ) : null}
                    {preflight.warnings?.length ? (
                      <p className="mt-1 text-[11px] text-warning">{preflight.warnings.join(" ")}</p>
                    ) : null}
                    {preflight.checklist?.length ? (
                      <details className="mt-2 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer font-semibold">Checklist para {preflight.product_label || "este tipo de pedido"}</summary>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {preflight.checklist.map((c, idx) => <li key={idx}>{c}</li>)}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </>
              ) : null}

              {!isCreate && !editMode && clientHistory && (clientHistory.past_count > 0 || clientHistory.reusable_quotes?.length > 0) ? (
                <>
                  <SectionTitle title="Histórico deste cliente" />
                  <div data-testid="client-history-panel" className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      {clientHistory.past_count} pedido(s) anterior(es) deste cliente
                      {clientHistory.suppliers_used?.length ? ` · fornecedores já usados: ${clientHistory.suppliers_used.join(", ")}` : ""}
                    </p>
                    {clientHistory.reusable_quotes?.length ? (
                      <ul className="mt-2 space-y-1.5 text-[11px]">
                        {clientHistory.reusable_quotes.slice(0, 5).map((q, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-card px-2 py-1.5">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {q.product || q.supplier_name}
                              <span className="ml-1 text-foreground/60">({Math.round((q.similarity || 0) * 100)}% semelhante)</span>
                            </span>
                            <span className="shrink-0 font-mono font-bold text-foreground">{Number(q.price || 0).toFixed(2)} €</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </>
              ) : null}

              {!isCreate && !editMode ? (
                <>
                  <SectionTitle title="Resumo automático" />
                  <div data-testid="ai-summary-panel" className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    {note?.ai_summary || aiSummary ? (
                      <p className="text-xs italic text-foreground/80">{aiSummary || note?.ai_summary}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem resumo gerado ainda — 2-3 frases sobre o pedido, geradas por IA.</p>
                    )}
                    <Button
                      data-testid="generate-ai-summary"
                      size="sm" variant="outline" disabled={summarizing}
                      onClick={generateAiSummary}
                      className="mt-2 rounded-lg"
                    >
                      {summarizing ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      {note?.ai_summary || aiSummary ? "Atualizar resumo" : "Gerar resumo"}
                    </Button>
                  </div>
                </>
              ) : null}

              {editMode ? (
                <div className="mt-6 flex gap-2">
                  <Button data-testid="save-note-btn" onClick={saveDetails} disabled={saving} className="flex-1 rounded-xl bg-success hover:bg-success/90">
                    {showSaveSpinner ? <Spinner className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                  <Button data-testid="cancel-note-btn" variant="outline" onClick={cancelEdit} disabled={saving} className="rounded-xl">
                    <X className="mr-2 h-4 w-4" /> Cancelar
                  </Button>
                </div>
              ) : (
                <Button data-testid="detalhes-edit-btn" variant="outline" onClick={() => setEditMode(true)} className="mt-6 w-full rounded-xl border-border font-bold">
                  <Pencil className="mr-2 h-4 w-4" /> Editar pedido
                </Button>
              )}
            </TabsContent>

            {/* ORCAMENTOS */}
            <TabsContent value="orcamentos" className="mt-0 focus-visible:outline-none">
              <section className="rounded-2xl border border-border bg-muted/60 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-foreground" />
                  <h4 className="font-heading text-h3 text-foreground">Pedir preço a fornecedor</h4>
                </div>
                {!gmailStatus?.connected ? (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3 text-sm text-[color:var(--pastel-amber-text)]">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Gmail não ligado</p>
                      <p className="text-xs">Liga o Gmail para enviar automaticamente, ou copia o email.</p>
                      {gmailStatus?.configured ? (
                        <Button data-testid="connect-gmail-inline" size="sm" onClick={() => { window.location.href = `${API}/gmail/connect`; }} className="mt-2 h-8 rounded-lg bg-warning hover:bg-warning/90">Ligar Gmail</Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-[var(--pastel-emerald-bg)] p-2.5 text-xs font-medium text-[color:var(--pastel-emerald-text)]">
                    <CheckCircle2 className="h-4 w-4" /> Ligado como {gmailStatus.email}
                  </div>
                )}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Fornecedor</Label>
                    {selectedSupplier ? (
                      <button
                        type="button"
                        data-testid="open-supplier-frame"
                        onClick={() => pushFrame({ kind: "fornecedor", label: selectedSupplier.name, data: selectedSupplier })}
                        className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <Building2 className="h-3 w-3" /> Ver ficha
                      </button>
                    ) : null}
                  </div>
                  <Combobox
                    data-testid="select-email-supplier"
                    value={emailSupplier}
                    onChange={(v) => { setEmailSupplier(v); loadTemplate(v, isReminder); }}
                    options={suppliers.map((s) => ({ value: s.id, label: `${s.name}${s.email ? ` · ${s.email}` : " · (sem email)"}` }))}
                    placeholder="Escolher fornecedor..."
                    searchPlaceholder="Procurar fornecedor..."
                    emptyText="Sem fornecedores."
                  />
                  {selectedSupplier && !selectedSupplier.email ? (
                    <p className="text-xs text-destructive">Este fornecedor não tem email.</p>
                  ) : null}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Checkbox data-testid="reminder-checkbox" checked={isReminder} onCheckedChange={(v) => { setIsReminder(!!v); loadTemplate(emailSupplier, !!v); }} /> Enviar como lembrete
                </label>
                <div className="mt-3 space-y-1.5">
                  <Label>Assunto</Label>
                  <Input data-testid="input-email-subject" value={emailData.subject} onChange={(e) => setEmailData((d) => ({ ...d, subject: e.target.value }))} />
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label>Mensagem</Label>
                  <Textarea data-testid="input-email-body" value={emailData.body} onChange={(e) => setEmailData((d) => ({ ...d, body: e.target.value }))} rows={6} className="font-mono text-xs" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button data-testid="send-email-btn" onClick={sendEmail} disabled={sending || !gmailStatus?.connected} className="rounded-xl">
                    {sending ? <Spinner className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />} {isReminder ? "Enviar lembrete" : "Enviar por Gmail"}
                  </Button>
                  <Button data-testid="copy-email-btn" variant="outline" onClick={copyEmail} className="rounded-xl">
                    <Copy className="mr-2 h-4 w-4" /> Copiar email
                  </Button>
                </div>
              </section>


              {/* Email + PDF prontos — confirmação a um clique, sem sair do pedido */}
              {note?.pending_client_send ? (
                <section data-testid="pending-send-panel" className="mt-6 rounded-2xl border border-emerald-300 bg-[var(--pastel-emerald-bg)] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="flex items-center gap-2 font-heading text-h3 text-[color:var(--pastel-emerald-text)]">
                        <Send className="h-4 w-4 text-[color:var(--pastel-emerald-text)]" /> Pronto para enviar ao cliente
                      </h4>
                      <p className="mt-0.5 text-xs text-[color:var(--pastel-emerald-text)]/80">
                        {note.pending_client_send.pdf_filename || "PDF"} anexado
                        {note.pending_client_send.total != null ? ` · ${Number(note.pending_client_send.total).toFixed(2)} € c/ IVA` : ""}
                        {note.pending_client_send.eff_margin_pct != null ? ` · margem ${Number(note.pending_client_send.eff_margin_pct).toFixed(1)}%` : ""}
                        {" — nada é enviado sem a tua confirmação."}
                      </p>
                    </div>
                    <Button
                      data-testid="open-confirm-send"
                      onClick={() => setConfirmSendOpen(true)}
                      className="rounded-xl bg-success hover:bg-success/90"
                    >
                      <Send className="mr-2 h-4 w-4" /> Rever e enviar
                    </Button>
                  </div>
                </section>
              ) : null}

              {/* Orçamento do fornecedor (PDF) → PDF de venda ao cliente */}
              <section data-testid="supplier-pdf-panel" className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-foreground" />
                      <h4 className="font-heading text-h3 text-foreground">Orçamento do fornecedor (PDF)</h4>
                    </div>
                    <p className="mt-1 text-xs text-text-body">
                      Envia o PDF da BandAluminios: a app lê as linhas, sugere preços de venda e gera o PDF com a marca da loja para entregar ao cliente.
                    </p>
                  </div>
                </div>
                <input
                  ref={supplierPdfInputRef}
                  data-testid="supplier-pdf-input"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => uploadSupplierPdf(e.target.files?.[0])}
                />
                <Button
                  data-testid="supplier-pdf-upload"
                  variant={sq ? "outline" : "default"}
                  disabled={importingPdf}
                  onClick={() => supplierPdfInputRef.current?.click()}
                  className="mt-3 rounded-xl"
                >
                  {importingPdf ? <Spinner className="mr-2 h-4 w-4" /> : <FileUp className="mr-2 h-4 w-4" />}
                  {sq ? "Substituir PDF do fornecedor" : "Importar PDF do fornecedor"}
                </Button>

                {sq ? (
                  <div className="mt-4">
                    <Attachment className="w-full max-w-full" size="sm">
                      <AttachmentMedia>
                        <FileText />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>{sq.quote_number}</AttachmentTitle>
                        <AttachmentDescription>
                          {sq.date ? `${sq.date} · ` : ""}{sq.obra ? `Obra ${sq.obra} · ` : ""}{sq.items.length} linha(s)
                          {sq.total ? ` · custo total ${Number(sq.total).toFixed(2)} € c/ IVA` : ""}
                          {sq.revision_number > 1 ? ` · revisão ${sq.revision_number}` : ""}
                          {sq.confidence_score != null ? ` · confiança ${sq.confidence_score}%` : ""}
                        </AttachmentDescription>
                      </AttachmentContent>
                    </Attachment>

                    {sq.source_file_id ? (
                      <a
                        data-testid="sq-view-original"
                        href={withDeviceToken(`${API}/notes/${id}/files/${sq.source_file_id}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" /> Ver PDF original do fornecedor
                      </a>
                    ) : null}

                    {/* Centro de Validação Automática: confere a leitura do PDF
                        (imagens, preços, descrições, totais) antes de o marcar
                        como pronto — nunca bloqueia, só avisa. */}
                    {sq.quality_report ? (
                      <div
                        data-testid="sq-quality-report"
                        className={`mt-3 rounded-xl border p-3 ${
                          sq.quality_report.status === "ok"
                            ? "border-emerald-200 bg-[var(--pastel-emerald-bg)]"
                            : sq.quality_report.status === "error"
                            ? "border-red-200 bg-[var(--pastel-red-bg)]"
                            : "border-amber-200 bg-[var(--pastel-amber-bg)]"
                        }`}
                      >
                        <p className={`flex items-center gap-1.5 text-xs font-extrabold ${
                          sq.quality_report.status === "ok" ? "text-success"
                          : sq.quality_report.status === "error" ? "text-destructive" : "text-warning"
                        }`}>
                          {sq.quality_report.status === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                          {sq.quality_report.status === "ok" ? "Pronto para enviar — nenhum problema encontrado" : "Verificar antes de enviar"}
                        </p>
                        {sq.quality_report.checks.filter((c) => c.status !== "ok").length > 0 ? (
                          <ul className="mt-1.5 space-y-1 text-[11px] text-foreground/80">
                            {sq.quality_report.checks.filter((c) => c.status !== "ok").map((c) => (
                              <li key={c.id} className="flex items-start gap-1.5">
                                <span className="mt-0.5">{c.status === "error" ? "✕" : "!"}</span>
                                <span>{c.detail || c.label}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    {sq.duplicate_medidas?.length ? (
                      <div data-testid="sq-duplicate-medidas" className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                        <p className="font-semibold text-foreground/80">A confirmar — medidas repetidas (pode ser propositado):</p>
                        <ul className="mt-1 space-y-0.5">
                          {sq.duplicate_medidas.map((d, idx) => (
                            <li key={idx}>{d.medida}: artigos nº {d.items.join(", ")}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {sq.diff_since_previous?.has_changes ? (
                      <div data-testid="sq-diff-panel" className="mt-3 rounded-xl border border-blue-200 bg-[var(--pastel-blue-bg)] p-3">
                        <p className="flex items-center gap-1.5 text-xs font-extrabold text-[color:var(--pastel-blue-text)]">
                          <FileWarning className="h-4 w-4" /> Alterado desde a última importação
                        </p>
                        <ul className="mt-1.5 space-y-1 text-[11px] text-foreground/80">
                          {sq.diff_since_previous.added.map((it) => (
                            <li key={`add-${it.n}`}>+ Nº {it.n} adicionado — {it.description}</li>
                          ))}
                          {sq.diff_since_previous.removed.map((it) => (
                            <li key={`rem-${it.n}`}>− Nº {it.n} removido — {it.description}</li>
                          ))}
                          {sq.diff_since_previous.changed.map((it) => (
                            <li key={`chg-${it.n}`}>
                              ~ Nº {it.n} alterado — {it.description}
                              {Object.values(it.fields).map((f, idx) => (
                                <span key={idx} className="ml-1 font-mono text-[10px]">
                                  ({f.label}: {String(f.old ?? "—")} → {String(f.new ?? "—")})
                                </span>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Margens automáticas por material: <b>PVC 15%</b> · <b>alumínio, redes mosquiteiras e portadas 18%</b> — a margem é ajustável linha a linha; o coeficiente e o preço final recalculam-se sozinhos com a fórmula exata da loja.
                    </p>

                    <div className="mt-3 space-y-3">
                      {sq.items.map((i) => (
                        <div key={i.n} data-testid={`sq-item-${i.n}`} className={`rounded-xl border p-3 ${i.include === false ? "border-border opacity-50" : "border-border"}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              data-testid={`sq-include-${i.n}`}
                              checked={i.include !== false}
                              onCheckedChange={(v) => setSqItem(i.n, { include: !!v })}
                              className="mt-1 h-5 w-5 rounded-md"
                            />
                            {i.image_b64 ? (
                              <img src={`data:image/png;base64,${i.image_b64}`} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border object-contain" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <Textarea
                                data-testid={`sq-desc-${i.n}`}
                                value={i.description}
                                onChange={(e) => setSqItem(i.n, { description: e.target.value })}
                                rows={3}
                                className="text-xs"
                              />
                              <div className="mt-2 flex flex-wrap items-end gap-3">
                                <label className="text-[11px] font-semibold text-muted-foreground">
                                  Qtd.
                                  <Input data-testid={`sq-qty-${i.n}`} type="number" min="1" value={i.qty} onChange={(e) => setSqItem(i.n, { qty: e.target.value })} className="mt-0.5 h-8 w-16 rounded-lg font-mono text-xs" />
                                </label>
                                <label className="text-[11px] font-semibold text-muted-foreground">
                                  Margem %
                                  <Input data-testid={`sq-margin-${i.n}`} type="number" min="0" max={MAX_MARGIN_PCT} step="0.5" value={i.margin_pct ?? 18} onChange={(e) => applyItemMargin(i.n, e.target.value)} className="mt-0.5 h-8 w-20 rounded-lg font-mono text-xs" />
                                </label>
                                <label className="text-[11px] font-semibold text-muted-foreground" title="Calculado automaticamente pela mesma fórmula do software da loja — nunca editável.">
                                  Coeficiente
                                  <span data-testid={`sq-coef-${i.n}`} className="mt-0.5 flex h-8 w-16 items-center rounded-lg bg-muted px-2 font-mono text-xs text-muted-foreground">
                                    {(i.coefficient ?? priceCoefficient(i.margin_pct ?? 18))?.toFixed(3) ?? "—"}
                                  </span>
                                </label>
                                <label className="text-[11px] font-semibold text-muted-foreground" title="Preço final — calculado automaticamente a partir da margem, nunca editável.">
                                  PVP/ud. (€, c/ IVA)
                                  <span data-testid={`sq-price-${i.n}`} className="mt-0.5 flex h-8 w-24 items-center rounded-lg bg-muted px-2 font-mono text-xs font-bold text-foreground">
                                    {Number(i.client_price || 0).toFixed(2)} €
                                  </span>
                                </label>
                                <p className="ml-auto text-[11px] text-muted-foreground">
                                  <span data-testid={`sq-material-${i.n}`} className="mr-1.5 rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">{i.material_label || "Alumínio"}</span>
                                  Custo: <span className="font-mono">{i.supplier_unit_price != null ? Number(i.supplier_unit_price).toFixed(2) : "—"} €</span> s/ IVA
                                  <span className="mx-1.5">·</span>
                                  Total: <span className="font-mono font-bold text-foreground">{(((parseFloat(i.client_price) || 0) * (parseInt(i.qty, 10) || 1))).toFixed(2)} €</span>
                                  {itemEffMargin(i) != null ? (
                                    <>
                                      <span className="mx-1.5">·</span>
                                      Margem final: <span data-testid={`sq-eff-margin-${i.n}`} className={`font-mono font-bold ${itemEffMargin(i) + 0.05 < (parseFloat(i.margin_pct) || 0) ? "text-destructive" : "text-success"}`}>{itemEffMargin(i).toFixed(1)}%</span>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="card-elevated mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted p-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">TOTAL ORÇAMENTO <span className="font-mono">{sqTotal.toFixed(2)} €</span> <span className="text-xs font-normal text-muted-foreground">c/ IVA</span></p>
                        {sqEffMargin != null ? (
                          <p data-testid="sq-eff-margin-total" className="mt-0.5 text-[11px] text-muted-foreground">
                            Margem final: <span className="font-mono font-bold text-foreground">{sqEffMargin.toFixed(1)}%</span> — o valor a reportar
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sq.client_pdf_file_id ? (
                          <a
                            data-testid="sq-download-last"
                            href={withDeviceToken(`${API}/notes/${id}/files/${sq.client_pdf_file_id}`)}
                            className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" /> Último PDF
                          </a>
                        ) : null}
                        <Button
                          data-testid="sq-generate-pdf"
                          size="sm"
                          disabled={generatingPdf}
                          onClick={generateClientPdf}
                          className="rounded-lg"
                        >
                          {generatingPdf ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                          Gerar PDF para o cliente
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {quotes.length > 0 ? (
                <section data-testid="client-email-panel" className="mt-6 rounded-2xl border border-blue-200 bg-[var(--pastel-blue-bg)] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4 text-[color:var(--pastel-blue-text)]" />
                        <h4 className="font-heading text-h3 text-foreground">Responder ao cliente</h4>
                      </div>
                      <p className="mt-1 text-xs text-text-body">Mensagem no teu formato habitual. Abre o email, anexa o orçamento e só depois regista o envio.</p>
                    </div>
                    {clientTemplateLoading ? <Spinner className="h-4 w-4 shrink-0 text-blue-500" /> : null}
                  </div>

                  {!form.email ? (
                    <button type="button" onClick={() => setTab("detalhes")} className="mt-3 w-full rounded-xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3 text-left text-xs text-[color:var(--pastel-amber-text)]">
                      <span className="font-bold">Falta o email do cliente.</span> Toca aqui para o adicionar nos Detalhes.
                    </button>
                  ) : (
                    <p className="mt-3 rounded-lg bg-card/80 px-3 py-2 font-mono text-xs text-muted-foreground">Para: {form.email}</p>
                  )}

                  <div className="mt-3 space-y-1.5">
                    <Label>Assunto</Label>
                    <Input data-testid="client-email-subject" value={clientEmailData.subject} onChange={(e) => setClientEmailData((d) => ({ ...d, subject: e.target.value }))} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label>Mensagem</Label>
                    <Textarea data-testid="client-email-body" value={clientEmailData.body} onChange={(e) => setClientEmailData((d) => ({ ...d, body: e.target.value }))} rows={7} className="bg-card font-mono text-xs" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {gmailStatus?.connected ? (
                      <Button data-testid="send-client-email" onClick={sendClientEmail} disabled={!form.email || !clientEmailData.body || sendingClient || clientTemplateLoading} className="rounded-xl bg-blue-700 hover:bg-blue-800">
                        {sendingClient ? <Spinner className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />} Enviar por email
                      </Button>
                    ) : null}
                    <Button data-testid="open-client-email" variant={gmailStatus?.connected ? "outline" : "default"} onClick={openClientEmail} disabled={!form.email || clientTemplateLoading} className={`rounded-xl ${gmailStatus?.connected ? "bg-card" : "bg-blue-700 hover:bg-blue-800"}`}>
                      <Mail className="mr-2 h-4 w-4" /> Abrir no email
                    </Button>
                    <Button data-testid="copy-client-email" variant="outline" onClick={copyClientEmail} disabled={!clientEmailData.body} className="rounded-xl bg-card">
                      <Copy className="mr-2 h-4 w-4" /> Copiar resposta
                    </Button>
                    <Button data-testid="register-client-email" variant="ghost" onClick={registerClientEmail} disabled={!clientEmailData.body} className="rounded-xl text-[color:var(--pastel-emerald-text)] hover:bg-[var(--pastel-emerald-bg)] hover:text-[color:var(--pastel-emerald-text)]">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Registar envio
                    </Button>
                  </div>
                </section>
              ) : null}

            </TabsContent>

            {/* COMUNICAÇÃO — toda a troca de emails deste pedido (enviados +
                recebidos), numa só linha temporal pesquisável. Substitui o
                antigo painel "Respostas recebidas" (só recebidos, sem
                pesquisa nem resumo), que vivia aqui em Orçamentos. */}
            <TabsContent value="comunicacao" className="mt-0 focus-visible:outline-none">
              {communication.summary ? (
                <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
                    <p className="font-mono text-value-lg tabular-nums text-foreground">{communication.summary.total_emails}</p>
                    <p className="text-label uppercase text-muted-foreground">Emails trocados</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
                    <p className="font-mono text-value-lg tabular-nums text-foreground">{communication.summary.total_attachments}</p>
                    <p className="text-label uppercase text-muted-foreground">Anexos</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
                    <p className="text-xs font-black text-foreground">
                      {communication.summary.last_activity_at ? timeAgo(communication.summary.last_activity_at) : "–"}
                    </p>
                    <p className="text-label uppercase text-muted-foreground">Última atividade</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
                    <p className="text-xs font-black text-foreground">{COMM_STATUS_LABEL[communication.summary.status] || "–"}</p>
                    <p className="text-label uppercase text-muted-foreground">Estado</p>
                  </div>
                </section>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <Input
                  data-testid="communication-search" value={commSearch}
                  onChange={(e) => setCommSearch(e.target.value)}
                  placeholder="Pesquisar assunto, mensagem, fornecedor, anexo…"
                />
                {gmailStatus?.method === "smtp" ? (
                  <Button data-testid="sync-emails-btn" size="sm" variant="outline" disabled={syncingEmails} onClick={syncEmails} className="h-9 shrink-0 rounded-lg text-xs">
                    {syncingEmails ? <Spinner className="mr-1 h-3.5 w-3.5" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Verificar agora
                  </Button>
                ) : null}
              </div>

              {communication.items.length === 0 ? (
                <Empty className="border-0 py-8">
                  <EmptyDescription>
                    {commSearch ? "Sem resultados para esta pesquisa." : "Ainda sem comunicação registada para este pedido."}
                  </EmptyDescription>
                </Empty>
              ) : (
                <MessageGroup className="mt-4 gap-0">
                  {communication.items.map((item, i) => {
                    const Icon = item.direction === "sent" ? Send : Inbox;
                    const who = item.direction === "sent"
                      ? (item.to_label || item.to)
                      : (item.supplier_name || item.from_name || item.from_email);
                    return (
                      <Message key={item.id} data-testid={`communication-item-${item.id}`} className="pb-5">
                        {i < communication.items.length - 1 ? <span className="absolute left-[15px] top-8 h-full w-px bg-muted" /> : null}
                        <MessageAvatar className="z-10 h-8 w-8 min-w-8 self-start bg-muted text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </MessageAvatar>
                        <MessageContent className="gap-0.5 pt-0.5">
                          <button
                            type="button"
                            data-testid={`open-communication-frame-${item.id}`}
                            onClick={() => pushFrame({
                              kind: item.direction === "sent" ? "sent_email" : "email",
                              label: item.subject || "Email", data: item,
                            })}
                            className="text-left"
                          >
                            <p className="text-sm font-bold text-foreground hover:underline">{who || "(sem remetente)"}</p>
                            <p className="text-xs text-muted-foreground">{item.subject || "(sem assunto)"}</p>
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {item.direction === "sent" ? "Enviado" : "Recebido"} · {formatDateTime(item.at)}{" "}
                            <span className="text-muted-foreground">({timeAgo(item.at)})</span>
                            {item.status === "erro" ? (
                              <span className="ml-2 inline-flex rounded-full bg-[var(--pastel-red-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-red-text)]">Erro</span>
                            ) : null}
                            {(item.attachments || []).length ? (
                              <span className="ml-2">
                                · {item.attachments.length} anexo{item.attachments.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </p>
                        </MessageContent>
                      </Message>
                    );
                  })}
                </MessageGroup>
              )}
            </TabsContent>

            {/* FOTOS — disponível tanto em Pedidos Gerais como em Banda Alumínios */}
            <TabsContent value="fotos" className="mt-0 focus-visible:outline-none">
              <section data-testid="photos-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="flex items-center gap-2 font-heading text-h3 text-foreground">
                      <Camera className="h-4 w-4 text-foreground" /> Fotos do pedido
                    </h4>
                    <p className="mt-1 text-xs text-text-body">
                      Fotos do local, do vão, de danos ou de referência — até {MAX_PHOTOS_PER_NOTE} por pedido.
                    </p>
                  </div>
                  <input
                    ref={photoInputRef}
                    data-testid="photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadPhotos(e.target.files)}
                  />
                  <Button
                    data-testid="photo-upload-btn"
                    size="sm"
                    disabled={uploadingPhotos || photos.length >= MAX_PHOTOS_PER_NOTE}
                    onClick={() => photoInputRef.current?.click()}
                    className="rounded-xl"
                  >
                    {uploadingPhotos ? <Spinner className="mr-1.5 h-4 w-4" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
                    Adicionar fotos
                  </Button>
                </div>

                {photos.length === 0 ? (
                  <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
                    <Camera className="h-8 w-8" />
                    <p className="mt-3 text-sm font-semibold">Sem fotos ainda.</p>
                    <p className="mt-0.5 text-xs">Toca em "Adicionar fotos" para tirar ou escolher uma foto.</p>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 3xl:grid-cols-6">
                    {photos.map((p) => (
                      <div
                        key={p.id}
                        data-testid={`photo-thumb-${p.id}`}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxPhoto(p)}
                          className="block h-full w-full"
                        >
                          <img
                            src={withDeviceToken(`${API}/notes/${id}/files/${p.id}`)}
                            alt={p.filename}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                          />
                        </button>
                        <button
                          type="button"
                          data-testid={`photo-delete-${p.id}`}
                          onClick={() => deletePhoto(p.id)}
                          disabled={deletingPhotoId === p.id}
                          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-all duration-150 hover:scale-110 hover:bg-destructive active:scale-90 group-hover:opacity-100"
                        >
                          {deletingPhotoId === p.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            {/* CRONOLOGIA */}
            <TabsContent value="cronologia" className="mt-0 focus-visible:outline-none">
              <section className="rounded-2xl border border-border bg-muted/60 p-3">
                <p className="text-label uppercase text-muted-foreground">Registo rápido</p>
                {(note?.client_no_answer_count > 0 || note?.supplier_no_answer_count > 0) ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {note?.client_no_answer_count > 0 ? (
                      <span data-testid="client-no-answer-count" className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-red-bg)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--pastel-red-text)]">
                        <PhoneMissed className="h-3 w-3" /> Cliente sem resposta ({note.client_no_answer_count}×)
                      </span>
                    ) : null}
                    {note?.supplier_no_answer_count > 0 ? (
                      <span data-testid="supplier-no-answer-count" className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-red-bg)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--pastel-red-text)]">
                        <PhoneMissed className="h-3 w-3" /> Fornecedor sem resposta ({note.supplier_no_answer_count}×)
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_LOG_OPTIONS.map(({ event, label, icon: Icon, tone }) => (
                    <button
                      key={event}
                      data-testid={`quick-log-${event}`}
                      onClick={() => quickLog(event)}
                      disabled={!!loggingEvent}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${QUICK_LOG_TONES[tone]}`}
                    >
                      {loggingEvent === event ? <Spinner className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              <div className="mt-4 flex gap-2">
                <Input data-testid="comment-input" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Adicionar nota / comentário..." />
                <Button data-testid="add-comment-btn" onClick={addComment} className="rounded-xl"><MessageSquare className="h-4 w-4" /></Button>
              </div>
              {activities.length === 0 ? (
                <Empty className="border-0 py-8">
                  <EmptyDescription>Sem atividade registada.</EmptyDescription>
                </Empty>
              ) : (
                <MessageGroup className="mt-5 gap-0">
                  {activities.map((a, i) => {
                    const Icon = ACT_ICONS[a.type] || Sparkles;
                    return (
                      <Message key={a.id} data-testid={`activity-${a.id}`} className="pb-5">
                        {i < activities.length - 1 ? <span className="absolute left-[15px] top-8 h-full w-px bg-muted" /> : null}
                        <MessageAvatar className="z-10 h-8 w-8 min-w-8 self-start bg-muted text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </MessageAvatar>
                        <MessageContent className="gap-0.5 pt-0.5">
                          <p className="text-sm text-foreground">{a.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.author} · {formatDateTime(a.created_at)} <span className="text-muted-foreground">({timeAgo(a.created_at)})</span>
                          </p>
                        </MessageContent>
                      </Message>
                    );
                  })}
                </MessageGroup>
              )}
            </TabsContent>

            {/* TAREFAS / LEMBRETES */}
            <TabsContent value="tarefas" className="mt-0 focus-visible:outline-none">
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/60 p-4 sm:flex-row">
                <Input data-testid="note-task-title" value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))} placeholder="Novo lembrete..." className="flex-1" />
                <Input data-testid="note-task-date" type="date" value={newTask.due_date} onChange={(e) => setNewTask((t) => ({ ...t, due_date: e.target.value }))} className="sm:w-44" />
                <Button data-testid="add-note-task-btn" onClick={addTask} className="rounded-xl"><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
              </div>
              <div className="mt-4 space-y-2">
                {tasks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Sem lembretes para este pedido.</p>
                ) : tasks.map((t) => {
                  const overdue = t.due_date && !t.done && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <div key={t.id} data-testid={`note-task-${t.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                      <Checkbox data-testid={`note-task-toggle-${t.id}`} checked={t.done} onCheckedChange={() => toggleTask(t)} className="h-5 w-5 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium text-foreground ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
                        {t.due_date ? (
                          <p className={`mt-0.5 flex items-center gap-1 text-xs ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                            <Calendar className="h-3 w-3" /> {new Date(t.due_date).toLocaleDateString("pt-PT")}{overdue ? " · em atraso" : ""}
                          </p>
                        ) : null}
                      </div>
                      <button data-testid={`delete-note-task-${t.id}`} onClick={() => deleteTask(t.id)} className="rounded-lg p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </div>
        </Tabs>
        )}
      </DialogContent>

      <CaixilhariaDialog open={caixOpen} onOpenChange={setCaixOpen} note={note} suppliers={suppliers} onSaved={refresh} />
      <ConfirmSendDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        note={note}
        onDone={refresh}
      />

      <Dialog open={!!lightboxPhoto} onOpenChange={(v) => { if (!v) setLightboxPhoto(null); }}>
        <DialogContent data-testid="photo-lightbox" className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
          {lightboxPhoto ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              <div className="bg-muted">
                <img
                  src={withDeviceToken(`${API}/notes/${id}/files/${lightboxPhoto.id}`)}
                  alt={lightboxPhoto.filename}
                  className="max-h-[75vh] w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border bg-card p-3">
                <p className="truncate text-xs font-medium text-muted-foreground">{lightboxPhoto.filename}</p>
                <div className="flex shrink-0 gap-1.5">
                  <a
                    href={withDeviceToken(`${API}/notes/${id}/files/${lightboxPhoto.id}`)}
                    download={lightboxPhoto.filename}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm" variant="outline" className="rounded-xl" data-testid="photo-download">
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Descarregar
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingPhotoId === lightboxPhoto.id}
                    onClick={() => deletePhoto(lightboxPhoto.id)}
                    className="rounded-xl"
                    data-testid="photo-lightbox-delete"
                  >
                    {deletingPhotoId === lightboxPhoto.id ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                    Remover
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AttachmentPreviewDialog
        open={!!previewAttachment}
        onOpenChange={(v) => !v && setPreviewAttachment(null)}
        attachment={previewAttachment}
      />
    </Dialog>
  );
}

// Campo em modo de leitura — mesmo espaço/alinhamento do campo editável
// equivalente, para o layout não "saltar" ao entrar/sair do modo de edição.
function ViewField({ label, value, mono = false, link = null, multiline = false }) {
  const empty = value === null || value === undefined || value === "";
  const content = empty ? "—" : value;
  return (
    <div className="space-y-1.5">
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      {link && !empty ? (
        <a href={link} className={`block text-sm font-semibold text-foreground hover:underline ${mono ? "font-mono" : ""}`}>
          {content}
        </a>
      ) : (
        <p className={`text-sm font-semibold text-foreground ${multiline ? "whitespace-pre-wrap" : "truncate"} ${mono ? "font-mono" : ""} ${empty ? "font-normal italic text-muted-foreground" : ""}`}>
          {content}
        </p>
      )}
    </div>
  );
}

// Título de categoria centrado, com traços dos dois lados: - - - Cliente - - -
function SectionTitle({ title, first = false }) {
  return (
    <div className={`flex items-center gap-3 ${first ? "" : "mt-5 sm:mt-6"}`}>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-border" />
      <h3 className="shrink-0 text-label uppercase text-muted-foreground">{title}</h3>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-border" />
    </div>
  );
}
