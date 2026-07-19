import { useEffect, useState, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Trash2, Send, Copy, Mail, Plus, Loader2, AlertCircle, CheckCircle2,
  Star, MessageSquare, Sparkles, ArrowRightLeft, Flag, Receipt,
  BadgeCheck, Pencil, Bell, Tag, X, Calendar, Zap,
  Check, AlertTriangle, Cloud, Frame,
  Store, ArrowLeft, ChevronRight, PhoneMissed, PhoneCall, Package, PackageCheck, BellRing,
  FileUp, FileText, Download, Inbox, RefreshCw, Camera, ImagePlus, ImageOff,
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
import AttachmentPreviewDialog from "@/components/AttachmentPreviewDialog";
import PhoneInput from "@/components/PhoneInput";
import CaixilhariaForm, {
  caixilhariaLabels, createEmptyCaixilharia, getCaixilhariaCatalog,
  normalizeCaixilhariaSpec, validateCaixilhariaSpec,
} from "@/components/CaixilhariaForm";

const emptyForm = {
  customer_name: "", phone: "", email: "", description: "", details: "",
  category: "construcao", quantity: "", reference: "",
  priority: "media", labels: [], supplier_id: "", sla_days: 2, reminder_interval_days: 3,
};

const DRAFT_KEY = "brico_draft_new_note";
const MAX_PHOTOS_PER_NOTE = 30;

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

const QUICK_LOG_TONES = {
  red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  amber: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
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
  const [receivedEmails, setReceivedEmails] = useState([]);
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

  // Assistente de criação por etapas: escolha do tipo → passos
  const [createMode, setCreateMode] = useState("choice"); // choice | normal | band
  const [createStep, setCreateStep] = useState(0);
  const [caixSpec, setCaixSpec] = useState(() => createEmptyCaixilharia());
  const [caixCatalog, setCaixCatalog] = useState(null);
  const [creating, setCreating] = useState(false);

  // Assistant data
  const [dupWarn, setDupWarn] = useState([]);

  // AI (OpenAI) state
  const [aiSummary, setAiSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAnalyzing, setReplyAnalyzing] = useState(false);
  const [replyResult, setReplyResult] = useState(null);

  const isCreate = !id;
  const dirty = useRef(false);
  const contentScrollRef = useRef(null);
  const set = (k, v) => { dirty.current = true; setForm((f) => ({ ...f, [k]: v })); };

  const loadSub = useCallback(async (nid) => {
    const [q, a, t, m, p] = await Promise.all([
      api.get(`/notes/${nid}/quotes`),
      api.get(`/notes/${nid}/activities`),
      api.get(`/notes/${nid}/tasks`),
      api.get(`/notes/${nid}/emails`).catch(() => ({ data: [] })),
      api.get(`/notes/${nid}/photos`).catch(() => ({ data: [] })),
    ]);
    setQuotes(q.data); setActivities(a.data); setTasks(t.data); setReceivedEmails(m.data || []);
    setPhotos(p.data || []);
  }, []);

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
      setAutoState("idle");
      setEditMode(false);
      setPhotos([]);
      setLightboxPhoto(null);
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
        setNote(null); setQuotes([]); setActivities([]); setTasks([]);
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

  // Duplicate detection while creating
  useEffect(() => {
    if (!open || !isCreate) return;
    const phone = form.phone.trim(); const name = form.customer_name.trim();
    if (!phone && !name) { setDupWarn([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/notes/check-duplicate", { phone, customer_name: name, description: form.description });
        setDupWarn(data.matches || []);
      } catch { setDupWarn([]); }
    }, 600);
    return () => clearTimeout(t);
  }, [form.phone, form.customer_name, form.description, isCreate, open]);

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

  const validClientStep = () => {
    if (!form.customer_name.trim() && !form.phone.trim()) {
      toast.error("Indica pelo menos o nome ou o telefone do cliente."); return false;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("O email do cliente não parece válido."); return false;
    }
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) {
      toast.error("O telefone do cliente parece incompleto."); return false;
    }
    return true;
  };

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
    await api.patch(`/notes/${id}/status`, { status });
    toast.success("Estado atualizado");
    await refreshChrome();
  };
  const changePriority = async (priority) => {
    set("priority", priority);
    await api.put(`/notes/${id}`, { priority });
    await refreshChrome();
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
  const toggleFav = async () => {
    await api.put(`/notes/${id}`, { favorite: !note.favorite });
    await refreshChrome();
  };
  const remove = async () => {
    const who = note?.customer_name || "este pedido";
    if (!window.confirm(`Eliminar o pedido de ${who}? Os orçamentos, histórico e lembretes associados também serão eliminados.`)) return;
    try {
      await api.delete(`/notes/${id}`);
      toast.success("Pedido eliminado");
      onChanged && onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao eliminar o pedido"));
    }
  };
  const resolveNote = async () => {
    await api.post(`/notes/${id}/resolve`);
    toast.success("Pedido resolvido e arquivado");
    await refreshChrome();
  };
  const reopenNote = async () => {
    await api.post(`/notes/${id}/reopen`);
    toast.success("Pedido reaberto");
    await refreshChrome();
  };

  const addLabel = async (val) => {
    const v = (val || labelInput).trim();
    if (!v || form.labels.includes(v)) { setLabelInput(""); return; }
    const labels = [...form.labels, v];
    set("labels", labels); setLabelInput("");
    if (!isCreate) { await api.put(`/notes/${id}`, { labels }); dirty.current = false; await refresh(); }
  };
  const removeLabel = async (val) => {
    const labels = form.labels.filter((l) => l !== val);
    set("labels", labels);
    if (!isCreate) { await api.put(`/notes/${id}`, { labels }); dirty.current = false; await refresh(); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await api.post(`/notes/${id}/comment`, { message: comment.trim() });
    setComment("");
    await refresh();
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
    await api.post(`/notes/${id}/tasks`, { title: newTask.title.trim(), due_date: newTask.due_date });
    setNewTask({ title: "", due_date: "" });
    await refresh();
  };
  const toggleTask = async (t) => { await api.patch(`/tasks/${t.id}/toggle`); await loadSub(id); };
  const deleteTask = async (tid) => { await api.delete(`/tasks/${tid}`); await loadSub(id); };

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
  const priceCoefficient = (marginPct) => {
    const denom = 1 / (1 + IVA_RATE) - (parseFloat(marginPct) || 0) / 100;
    return denom > 0 ? 1 / denom : null;
  };
  const suggestClientPrice = (cost, marginPct) => {
    const coef = priceCoefficient(marginPct);
    if (!cost || cost <= 0 || coef == null) return 0;
    return roundHalfUp(cost * coef, 2);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-dialog"
        className={`flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[94vh] sm:w-full ${isCreate && createMode === "band" ? "sm:max-w-5xl xl:max-w-6xl" : "sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl"}`}
      >
        {/* Header (fixed) */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate font-heading text-lg font-bold tracking-tight sm:text-xl">
                {isCreate
                  ? (createMode === "band" ? "Pedido à medida — BandAluminios" : "Novo pedido de orçamento")
                  : (form.customer_name || "Pedido")}
              </DialogTitle>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                {isCreate
                  ? (createMode === "choice"
                    ? "Escolhe o tipo de pedido"
                    : `Passo ${createStep + 1} de ${createSteps.length} — ${createSteps[createStep]}`)
                  : (form.phone
                    ? <a href={`tel:${form.phone}`} title="Ligar ao cliente" className="font-mono hover:text-slate-900 hover:underline">{form.phone}</a>
                    : "Sem telefone")}
                {!isCreate && autoState === "saving" ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> a guardar…</span> : null}
                {!isCreate && autoState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-3 w-3" /> guardado</span> : null}
                {!isCreate && autoState === "error" ? <span className="inline-flex items-center gap-1 text-red-500" title={autoError}><AlertTriangle className="h-3 w-3" /> {autoError}</span> : null}
              </p>
              {!isCreate && note ? (
                <p className="mt-0.5 text-[10px] text-slate-400" title={`Atualizado ${timeAgo(note.updated_at)}`}>
                  Criado {formatDateTime(note.created_at)} · atualizado {formatDateTime(note.updated_at)}
                </p>
              ) : null}
            </div>
            {!isCreate && note ? (
              <button data-testid="detail-fav" onClick={toggleFav} className="mr-6 shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-amber-400">
                <Star className={`h-5 w-5 ${note.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>
            ) : null}
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
                <Button data-testid="detail-resolve" size="sm" variant="outline" onClick={resolveNote} className="h-9 w-full rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:w-auto sm:shrink-0">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolver
                </Button>
              )}

              {/* Visualização vs edição: os dados do pedido só ficam editáveis
                  depois de premir "Editar" — o estado/prioridade acima
                  continuam sempre disponíveis, sem precisar de entrar em
                  modo de edição. */}
              {editMode ? (
                <>
                  <Button data-testid="detail-save" size="sm" onClick={saveDetails} disabled={saving} className="col-span-2 h-9 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 sm:col-span-1 sm:w-auto sm:shrink-0">
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />} Guardar
                  </Button>
                  <Button data-testid="detail-cancel-edit" size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="h-9 w-full rounded-lg sm:w-auto sm:shrink-0">
                    <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </>
              ) : (
                <Button data-testid="detail-edit" size="sm" variant="outline" onClick={() => setEditMode(true)} className="h-9 w-full rounded-lg border-slate-300 font-bold sm:w-auto sm:shrink-0">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
              )}

              <Button data-testid="detail-delete" size="sm" variant="outline" onClick={remove} className="h-9 w-full rounded-lg border-red-200 text-red-600 hover:bg-red-50 sm:ml-auto sm:w-auto sm:shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        {/* Next action banner */}
        {!isCreate && note?.next_action ? (
          <div className={`shrink-0 border-b px-4 py-2.5 text-xs sm:px-6 ${note.is_overdue ? "border-red-100 bg-red-50 text-red-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}>
            <span className="font-bold">{note.is_overdue ? `Atrasado ${note.waiting_days}d · ` : "Próxima ação: "}</span>
            {note.next_action}
          </div>
        ) : null}

        {isCreate ? (
          /* ---------- Assistente de criação por etapas ---------- */
          <div ref={contentScrollRef} className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-3 pb-0 sm:px-6 sm:pt-5">
            {createMode === "choice" ? (
              <div className="space-y-3">
                <p className="text-sm font-bold text-slate-900">O que precisa de pedir?</p>
                <button
                  data-testid="create-mode-band"
                  onClick={() => { setCreateMode("band"); setCreateStep(0); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-900 hover:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <Frame className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">Caixilharia à medida — BandAluminios</span>
                    <span className="block text-xs text-slate-500">Janelas, portas, portadas e redes mosquiteiras com medidas, para pedir cotação ao fornecedor</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
                <button
                  data-testid="create-mode-normal"
                  onClick={() => { setCreateMode("normal"); setCreateStep(0); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-900 hover:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Store className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">Pedido normal de loja</span>
                    <span className="block text-xs text-slate-500">Qualquer outro artigo: preço, encomenda ou disponibilidade junto de um fornecedor</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </div>
            ) : (
              <>
                {/* Progresso */}
                <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {createSteps.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < createStep ? "bg-emerald-500 text-white" : i === createStep ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>
                        {i < createStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className={`text-xs font-semibold ${i === createStep ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
                      {i < createSteps.length - 1 ? <span className="h-px w-4 bg-slate-200" /> : null}
                    </div>
                  ))}
                </div>

                {/* Passo 1 — Cliente (comum aos dois fluxos) */}
                {createStep === 0 ? (
                  <>
                    {dupWarn.length > 0 ? (
                      <div data-testid="dup-warning" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> Possível pedido duplicado</p>
                        <ul className="mt-1.5 space-y-1">
                          {dupWarn.map((d) => (
                            <li key={d.id} className="text-xs">• {d.customer_name} — {d.description || "sem descrição"} <span className="opacity-70">({getStatusCfg(d.status).label})</span></li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Nome do cliente</Label>
                        <Input data-testid="input-customer-name" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Ex.: Teresa Mera" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Telefone</Label>
                        <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <Label>Email do cliente (opcional)</Label>
                      <Input data-testid="input-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
                    </div>
                  </>
                ) : null}

                {/* Passo 2 (normal) — artigo e especificação essencial */}
                {createMode === "normal" && createStep === 1 ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Pedido do cliente</Label>
                      <Textarea data-testid="input-description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Ex.: Motosserra a bateria 40V, cor, prazo, condições..." />
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
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                      <p><span className="font-bold text-slate-900">{form.customer_name || "Sem nome"}</span>{form.phone ? ` · ${form.phone}` : ""}</p>
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
                    <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                  ) : (
                    <>
                      <CaixilhariaForm catalog={caixCatalog} spec={caixSpec} onChange={setCaixSpec} />
                      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        Ao criar, o fornecedor BandAluminios é associado automaticamente e o email fica pronto na aba «Orçamentos».
                      </p>
                    </>
                  )
                ) : null}

                {/* Navegação */}
                <div className="sticky bottom-0 z-20 -mx-3 mt-6 flex gap-2 border-t border-slate-200 bg-white/95 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 sm:pb-4">
                  <Button data-testid="wizard-back" variant="outline" onClick={wizardBack} className="rounded-xl">
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
                  </Button>
                  {!isLastStep ? (
                    <Button data-testid="wizard-next" onClick={wizardNext} className="flex-1 rounded-xl">
                      Continuar <ChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  ) : createMode === "band" ? (
                    <Button data-testid="wizard-create-band" onClick={createBandPedido} disabled={creating || !caixCatalog} className="flex-1 rounded-xl">
                      {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Criar pedido à medida
                    </Button>
                  ) : (
                    <Button data-testid="save-note-btn" onClick={saveDetails} disabled={saving} className="flex-1 rounded-xl">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Criar pedido
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-slate-100 px-4 pt-2.5 sm:px-6 sm:pt-3">
            {/* No telemóvel as tabs deslizam na horizontal; em ecrãs maiores ocupam a largura toda */}
            <TabsList className="no-scrollbar flex w-full justify-start overflow-x-auto sm:grid sm:grid-cols-5">
              <TabsTrigger value="detalhes" data-testid="tab-detalhes" className="shrink-0 text-xs">Detalhes</TabsTrigger>
              <TabsTrigger value="orcamentos" data-testid="tab-orcamentos" className="shrink-0 text-xs" disabled={isCreate}>Orçamentos</TabsTrigger>
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
                    <Label>Nome do cliente</Label>
                    <Input data-testid="input-customer-name" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Ex.: Teresa Mera" />
                  </div>
                ) : (
                  <ViewField label="Nome do cliente" value={form.customer_name} />
                )}
                {editMode ? (
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
                  </div>
                ) : (
                  <ViewField label="Telefone" value={form.phone} mono link={form.phone ? `tel:${form.phone}` : null} />
                )}
              </div>
              {editMode ? (
                <div className="mt-4 space-y-1.5">
                  <Label>Email do cliente</Label>
                  <Input data-testid="input-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
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
                  <Textarea data-testid="input-description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Ex.: Janela de correr alumínio, cor, prazo, condições..." />
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
                    <div data-testid="caixilharia-summary" className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                            <Frame className="h-4 w-4 shrink-0 text-slate-500" />
                            {note.caixilharia.display?.produto || "Caixilharia à medida"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {note.caixilharia.display?.element_count
                              ? `${note.caixilharia.display.element_count} elemento(s) · ${note.caixilharia.display.option_count} opção(ões) · `
                              : ""}
                            {note.caixilharia.display?.total_un} un
                            {note.caixilharia.data_entrega ? ` · entrega ${note.caixilharia.data_entrega}` : ""}
                          </p>
                          {note.caixilharia.display?.comparison_count ? (
                            <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
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
                          <div key={line.id || index} className="rounded-lg bg-white p-2 text-xs text-slate-600">
                            <p className="font-mono font-semibold text-slate-700">
                              {index + 1}. {line.produto} — {line.quantidade} un — {line.largura_mm} × {line.altura_mm} mm
                              {line.sentido_abertura ? ` — ${line.sentido_abertura}` : ""}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(line.opcoes || []).map((option, optionIndex) => (
                                <span key={option.id || optionIndex} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {String.fromCharCode(65 + optionIndex)} · {option.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {!note.caixilharia.display?.lines?.length ? (note.caixilharia.itens || []).map((item, index) => (
                          <p key={index} className="font-mono text-xs text-slate-600">
                            {item.quantidade} un — {item.largura_mm} × {item.altura_mm} mm{item.sentido_abertura ? ` — ${item.sentido_abertura}` : ""}
                          </p>
                        )) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <SectionTitle title="Etiquetas" />
              <div className="mt-3 space-y-1.5">
                {form.labels.length === 0 && !editMode ? (
                  <p className="text-sm italic text-slate-400">Sem etiquetas.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {form.labels.map((l) => (
                      <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Tag className="h-3 w-3" /> {l}
                        {editMode ? (
                          <button data-testid={`remove-label-${l}`} onClick={() => removeLabel(l)} className="ml-0.5 text-slate-400 hover:text-red-500"><X className="h-3 w-3" /></button>
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
                      <button key={l} data-testid={`suggest-label-${l}`} onClick={() => addLabel(l)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700">+ {l}</button>
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
              <div className="mt-4 grid grid-cols-2 gap-4">
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

              {editMode ? (
                <div className="mt-6 flex gap-2">
                  <Button data-testid="save-note-btn" onClick={saveDetails} disabled={saving} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                  <Button data-testid="cancel-note-btn" variant="outline" onClick={cancelEdit} disabled={saving} className="rounded-xl">
                    <X className="mr-2 h-4 w-4" /> Cancelar
                  </Button>
                </div>
              ) : (
                <Button data-testid="detalhes-edit-btn" variant="outline" onClick={() => setEditMode(true)} className="mt-6 w-full rounded-xl border-slate-300 font-bold">
                  <Pencil className="mr-2 h-4 w-4" /> Editar pedido
                </Button>
              )}
            </TabsContent>

            {/* ORCAMENTOS */}
            <TabsContent value="orcamentos" className="mt-0 focus-visible:outline-none">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-700" />
                  <h4 className="font-heading text-sm font-extrabold text-slate-900">Pedir preço a fornecedor</h4>
                </div>
                {!gmailStatus?.connected ? (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Gmail não ligado</p>
                      <p className="text-xs">Liga o Gmail para enviar automaticamente, ou copia o email.</p>
                      {gmailStatus?.configured ? (
                        <Button data-testid="connect-gmail-inline" size="sm" onClick={() => { window.location.href = `${API}/gmail/connect`; }} className="mt-2 h-8 rounded-lg bg-amber-600 hover:bg-amber-700">Ligar Gmail</Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Ligado como {gmailStatus.email}
                  </div>
                )}
                <div className="mt-4 space-y-1.5">
                  <Label>Fornecedor</Label>
                  <Select value={emailSupplier} onValueChange={(v) => { setEmailSupplier(v); loadTemplate(v, isReminder); }}>
                    <SelectTrigger data-testid="select-email-supplier"><SelectValue placeholder="Escolher fornecedor..." /></SelectTrigger>
                    <SelectContent>
                      {suppliers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">Sem fornecedores.</div>
                      ) : suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}{s.email ? ` · ${s.email}` : " · (sem email)"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSupplier && !selectedSupplier.email ? (
                    <p className="text-xs text-red-500">Este fornecedor não tem email.</p>
                  ) : null}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
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
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {isReminder ? "Enviar lembrete" : "Enviar por Gmail"}
                  </Button>
                  <Button data-testid="copy-email-btn" variant="outline" onClick={copyEmail} className="rounded-xl">
                    <Copy className="mr-2 h-4 w-4" /> Copiar email
                  </Button>
                </div>
              </section>

              {/* Respostas recebidas — fornecedor ou cliente (IMAP, só leitura) */}
              {gmailStatus?.method === "smtp" || receivedEmails.length > 0 ? (
                <section data-testid="received-emails-panel" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 font-heading text-sm font-extrabold text-slate-900">
                      <Inbox className="h-4 w-4 text-slate-700" /> Respostas recebidas
                    </h4>
                    {gmailStatus?.method === "smtp" ? (
                      <Button data-testid="sync-emails-btn" size="sm" variant="outline" disabled={syncingEmails} onClick={syncEmails} className="h-8 shrink-0 rounded-lg text-xs">
                        {syncingEmails ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Verificar agora
                      </Button>
                    ) : null}
                  </div>
                  {receivedEmails.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Ainda sem respostas. A caixa de entrada é verificada automaticamente — quando o fornecedor ou o
                      cliente responderem, a mensagem aparece aqui (e uma resposta do fornecedor avança o estado
                      sozinho para «Orçamento recebido»).
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {receivedEmails.map((m) => (
                        <details key={m.id} data-testid={`received-email-${m.id}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                          <summary className="cursor-pointer select-none">
                            <span className="text-sm font-bold text-slate-900">{m.supplier_name || m.from_name || m.from_email}</span>
                            {m.reply_kind === "client" ? (
                              <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Cliente</span>
                            ) : null}
                            <span className="ml-2 text-xs text-slate-500">{m.subject || "(sem assunto)"}</span>
                            <span className="ml-2 text-[11px] text-slate-400">{timeAgo(m.received_at)}</span>
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-sans text-xs text-slate-700">{m.body || "(sem texto)"}</pre>
                          {(m.attachments || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.attachments.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setPreviewAttachment({ url: withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`), filename: a.filename })}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-700"
                                >
                                  <FileText className="h-3.5 w-3.5" /> {a.filename}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {/* Email + PDF prontos — confirmação a um clique, sem sair do pedido */}
              {note?.pending_client_send ? (
                <section data-testid="pending-send-panel" className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="flex items-center gap-2 font-heading text-sm font-extrabold text-emerald-900">
                        <Send className="h-4 w-4 text-emerald-600" /> Pronto para enviar ao cliente
                      </h4>
                      <p className="mt-0.5 text-xs text-emerald-800/80">
                        {note.pending_client_send.pdf_filename || "PDF"} anexado
                        {note.pending_client_send.total != null ? ` · ${Number(note.pending_client_send.total).toFixed(2)} € c/ IVA` : ""}
                        {note.pending_client_send.eff_margin_pct != null ? ` · margem ${Number(note.pending_client_send.eff_margin_pct).toFixed(1)}%` : ""}
                        {" — nada é enviado sem a tua confirmação."}
                      </p>
                    </div>
                    <Button
                      data-testid="open-confirm-send"
                      onClick={() => setConfirmSendOpen(true)}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Send className="mr-2 h-4 w-4" /> Rever e enviar
                    </Button>
                  </div>
                </section>
              ) : null}

              {/* Orçamento do fornecedor (PDF) → PDF de venda ao cliente */}
              <section data-testid="supplier-pdf-panel" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-700" />
                      <h4 className="font-heading text-sm font-extrabold text-slate-900">Orçamento do fornecedor (PDF)</h4>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
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
                  {importingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                  {sq ? "Substituir PDF do fornecedor" : "Importar PDF do fornecedor"}
                </Button>

                {sq ? (
                  <div className="mt-4">
                    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      <p>
                        <span className="font-bold text-slate-900">{sq.quote_number}</span>
                        {sq.date ? ` · ${sq.date}` : ""}{sq.obra ? ` · Obra ${sq.obra}` : ""} · {sq.items.length} linha(s)
                        {sq.total ? ` · custo total ${Number(sq.total).toFixed(2)} € c/ IVA` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Margens automáticas por material: <b>PVC 15%</b> · <b>alumínio, redes mosquiteiras e portadas 18%</b> — a margem é ajustável linha a linha; o coeficiente e o preço final recalculam-se sozinhos com a fórmula exata da loja.
                      </p>
                    </div>

                    <div className="mt-3 space-y-3">
                      {sq.items.map((i) => (
                        <div key={i.n} data-testid={`sq-item-${i.n}`} className={`rounded-xl border p-3 ${i.include === false ? "border-slate-200 opacity-50" : "border-slate-200"}`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              data-testid={`sq-include-${i.n}`}
                              checked={i.include !== false}
                              onCheckedChange={(v) => setSqItem(i.n, { include: !!v })}
                              className="mt-1 h-5 w-5 rounded-md"
                            />
                            {i.image_b64 ? (
                              <img src={`data:image/png;base64,${i.image_b64}`} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-contain" />
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
                                <label className="text-[11px] font-semibold text-slate-500">
                                  Qtd.
                                  <Input data-testid={`sq-qty-${i.n}`} type="number" min="1" value={i.qty} onChange={(e) => setSqItem(i.n, { qty: e.target.value })} className="mt-0.5 h-8 w-16 rounded-lg font-mono text-xs" />
                                </label>
                                <label className="text-[11px] font-semibold text-slate-500">
                                  Margem %
                                  <Input data-testid={`sq-margin-${i.n}`} type="number" min="0" max={MAX_MARGIN_PCT} step="0.5" value={i.margin_pct ?? 18} onChange={(e) => applyItemMargin(i.n, e.target.value)} className="mt-0.5 h-8 w-20 rounded-lg font-mono text-xs" />
                                </label>
                                <label className="text-[11px] font-semibold text-slate-500" title="Calculado automaticamente pela mesma fórmula do software da loja — nunca editável.">
                                  Coeficiente
                                  <span data-testid={`sq-coef-${i.n}`} className="mt-0.5 flex h-8 w-16 items-center rounded-lg bg-slate-100 px-2 font-mono text-xs text-slate-500">
                                    {(i.coefficient ?? priceCoefficient(i.margin_pct ?? 18))?.toFixed(3) ?? "—"}
                                  </span>
                                </label>
                                <label className="text-[11px] font-semibold text-slate-500" title="Preço final — calculado automaticamente a partir da margem, nunca editável.">
                                  PVP/ud. (€, c/ IVA)
                                  <span data-testid={`sq-price-${i.n}`} className="mt-0.5 flex h-8 w-24 items-center rounded-lg bg-slate-100 px-2 font-mono text-xs font-bold text-slate-700">
                                    {Number(i.client_price || 0).toFixed(2)} €
                                  </span>
                                </label>
                                <p className="ml-auto text-[11px] text-slate-400">
                                  <span data-testid={`sq-material-${i.n}`} className="mr-1.5 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{i.material_label || "Alumínio"}</span>
                                  Custo: <span className="font-mono">{i.supplier_unit_price != null ? Number(i.supplier_unit_price).toFixed(2) : "—"} €</span> s/ IVA
                                  <span className="mx-1.5">·</span>
                                  Total: <span className="font-mono font-bold text-slate-700">{(((parseFloat(i.client_price) || 0) * (parseInt(i.qty, 10) || 1))).toFixed(2)} €</span>
                                  {itemEffMargin(i) != null ? (
                                    <>
                                      <span className="mx-1.5">·</span>
                                      Margem final: <span data-testid={`sq-eff-margin-${i.n}`} className={`font-mono font-bold ${itemEffMargin(i) + 0.05 < (parseFloat(i.margin_pct) || 0) ? "text-red-600" : "text-emerald-600"}`}>{itemEffMargin(i).toFixed(1)}%</span>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="card-elevated mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">TOTAL ORÇAMENTO <span className="font-mono">{sqTotal.toFixed(2)} €</span> <span className="text-xs font-normal text-slate-500">c/ IVA</span></p>
                        {sqEffMargin != null ? (
                          <p data-testid="sq-eff-margin-total" className="mt-0.5 text-[11px] text-slate-500">
                            Margem final: <span className="font-mono font-bold text-slate-700">{sqEffMargin.toFixed(1)}%</span> — o valor a reportar
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sq.client_pdf_file_id ? (
                          <a
                            data-testid="sq-download-last"
                            href={withDeviceToken(`${API}/notes/${id}/files/${sq.client_pdf_file_id}`)}
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
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
                          {generatingPdf ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                          Gerar PDF para o cliente
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {quotes.length > 0 ? (
                <section data-testid="client-email-panel" className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4 text-blue-700" />
                        <h4 className="font-heading text-sm font-extrabold text-slate-900">Responder ao cliente</h4>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">Mensagem no teu formato habitual. Abre o email, anexa o orçamento e só depois regista o envio.</p>
                    </div>
                    {clientTemplateLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" /> : null}
                  </div>

                  {!form.email ? (
                    <button type="button" onClick={() => setTab("detalhes")} className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
                      <span className="font-bold">Falta o email do cliente.</span> Toca aqui para o adicionar nos Detalhes.
                    </button>
                  ) : (
                    <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 font-mono text-xs text-slate-600">Para: {form.email}</p>
                  )}

                  <div className="mt-3 space-y-1.5">
                    <Label>Assunto</Label>
                    <Input data-testid="client-email-subject" value={clientEmailData.subject} onChange={(e) => setClientEmailData((d) => ({ ...d, subject: e.target.value }))} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label>Mensagem</Label>
                    <Textarea data-testid="client-email-body" value={clientEmailData.body} onChange={(e) => setClientEmailData((d) => ({ ...d, body: e.target.value }))} rows={7} className="bg-white font-mono text-xs" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {gmailStatus?.connected ? (
                      <Button data-testid="send-client-email" onClick={sendClientEmail} disabled={!form.email || !clientEmailData.body || sendingClient || clientTemplateLoading} className="rounded-xl bg-blue-700 hover:bg-blue-800">
                        {sendingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar por email
                      </Button>
                    ) : null}
                    <Button data-testid="open-client-email" variant={gmailStatus?.connected ? "outline" : "default"} onClick={openClientEmail} disabled={!form.email || clientTemplateLoading} className={`rounded-xl ${gmailStatus?.connected ? "bg-white" : "bg-blue-700 hover:bg-blue-800"}`}>
                      <Mail className="mr-2 h-4 w-4" /> Abrir no email
                    </Button>
                    <Button data-testid="copy-client-email" variant="outline" onClick={copyClientEmail} disabled={!clientEmailData.body} className="rounded-xl bg-white">
                      <Copy className="mr-2 h-4 w-4" /> Copiar resposta
                    </Button>
                    <Button data-testid="register-client-email" variant="ghost" onClick={registerClientEmail} disabled={!clientEmailData.body} className="rounded-xl text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Registar envio
                    </Button>
                  </div>
                </section>
              ) : null}

            </TabsContent>

            {/* FOTOS — disponível tanto em Pedidos Gerais como em Banda Alumínios */}
            <TabsContent value="fotos" className="mt-0 focus-visible:outline-none">
              <section data-testid="photos-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="flex items-center gap-2 font-heading text-sm font-extrabold text-slate-900">
                      <Camera className="h-4 w-4 text-slate-700" /> Fotos do pedido
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
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
                    {uploadingPhotos ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
                    Adicionar fotos
                  </Button>
                </div>

                {photos.length === 0 ? (
                  <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
                    <Camera className="h-8 w-8" />
                    <p className="mt-3 text-sm font-semibold">Sem fotos ainda.</p>
                    <p className="mt-0.5 text-xs">Toca em "Adicionar fotos" para tirar ou escolher uma foto.</p>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                    {photos.map((p) => (
                      <div
                        key={p.id}
                        data-testid={`photo-thumb-${p.id}`}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
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
                          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-all duration-150 hover:scale-110 hover:bg-red-600 active:scale-90 group-hover:opacity-100"
                        >
                          {deletingPhotoId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            {/* CRONOLOGIA */}
            <TabsContent value="cronologia" className="mt-0 focus-visible:outline-none">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Registo rápido</p>
                {(note?.client_no_answer_count > 0 || note?.supplier_no_answer_count > 0) ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {note?.client_no_answer_count > 0 ? (
                      <span data-testid="client-no-answer-count" className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                        <PhoneMissed className="h-3 w-3" /> Cliente sem resposta ({note.client_no_answer_count}×)
                      </span>
                    ) : null}
                    {note?.supplier_no_answer_count > 0 ? (
                      <span data-testid="supplier-no-answer-count" className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
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
                      {loggingEvent === event ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              <div className="mt-4 flex gap-2">
                <Input data-testid="comment-input" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Adicionar nota / comentário..." />
                <Button data-testid="add-comment-btn" onClick={addComment} className="rounded-xl"><MessageSquare className="h-4 w-4" /></Button>
              </div>
              <div className="mt-5 space-y-0">
                {activities.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">Sem atividade registada.</p>
                ) : activities.map((a, i) => {
                  const Icon = ACT_ICONS[a.type] || Sparkles;
                  return (
                    <div key={a.id} data-testid={`activity-${a.id}`} className="relative flex gap-3 pb-5">
                      {i < activities.length - 1 ? <span className="absolute left-[15px] top-8 h-full w-px bg-slate-200" /> : null}
                      <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm text-slate-800">{a.message}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {a.author} · {formatDateTime(a.created_at)} <span className="text-slate-300">({timeAgo(a.created_at)})</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* TAREFAS / LEMBRETES */}
            <TabsContent value="tarefas" className="mt-0 focus-visible:outline-none">
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row">
                <Input data-testid="note-task-title" value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))} placeholder="Novo lembrete..." className="flex-1" />
                <Input data-testid="note-task-date" type="date" value={newTask.due_date} onChange={(e) => setNewTask((t) => ({ ...t, due_date: e.target.value }))} className="sm:w-44" />
                <Button data-testid="add-note-task-btn" onClick={addTask} className="rounded-xl"><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
              </div>
              <div className="mt-4 space-y-2">
                {tasks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">Sem lembretes para este pedido.</p>
                ) : tasks.map((t) => {
                  const overdue = t.due_date && !t.done && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <div key={t.id} data-testid={`note-task-${t.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <Checkbox data-testid={`note-task-toggle-${t.id}`} checked={t.done} onCheckedChange={() => toggleTask(t)} className="h-5 w-5 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium text-slate-900 ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
                        {t.due_date ? (
                          <p className={`mt-0.5 flex items-center gap-1 text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>
                            <Calendar className="h-3 w-3" /> {new Date(t.due_date).toLocaleDateString("pt-PT")}{overdue ? " · em atraso" : ""}
                          </p>
                        ) : null}
                      </div>
                      <button data-testid={`delete-note-task-${t.id}`} onClick={() => deleteTask(t.id)} className="rounded-lg p-1 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
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
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="bg-slate-100">
                <img
                  src={withDeviceToken(`${API}/notes/${id}/files/${lightboxPhoto.id}`)}
                  alt={lightboxPhoto.filename}
                  className="max-h-[75vh] w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
                <p className="truncate text-xs font-medium text-slate-600">{lightboxPhoto.filename}</p>
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
                    {deletingPhotoId === lightboxPhoto.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {link && !empty ? (
        <a href={link} className={`block text-sm font-semibold text-slate-900 hover:underline ${mono ? "font-mono" : ""}`}>
          {content}
        </a>
      ) : (
        <p className={`text-sm font-semibold text-slate-900 ${multiline ? "whitespace-pre-wrap" : "truncate"} ${mono ? "font-mono" : ""} ${empty ? "font-normal italic text-slate-400" : ""}`}>
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
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-slate-200" />
      <h3 className="shrink-0 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{title}</h3>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-slate-200" />
    </div>
  );
}
