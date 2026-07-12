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
  Trash2, Send, Copy, Mail, Plus, Trophy, Loader2, AlertCircle, CheckCircle2,
  Star, MessageSquare, Sparkles, ArrowRightLeft, Flag, Receipt,
  BadgeCheck, Pencil, Bell, Tag, X, Calendar, Zap, ClipboardCheck, History,
  Lightbulb, GitCompare, RefreshCw, Check, AlertTriangle, Cloud,
} from "lucide-react";
import api, { API } from "@/lib/api";
import { CATEGORY_LIST } from "@/lib/categories";
import { STATUS_ORDER, getStatusCfg, getPriorityCfg, PRIORITY_ORDER, PRIORITY_CONFIG, timeAgo } from "@/lib/pedido";

const emptyForm = {
  customer_name: "", phone: "", email: "", description: "", details: "",
  category: "construcao", measurements: "", quantity: "", color: "", reference: "",
  priority: "media", labels: [], supplier_id: "", sla_days: 2, reminder_interval_days: 3,
};

const DRAFT_KEY = "brico_draft_new_note";

const ACT_ICONS = {
  created: Sparkles, status_change: ArrowRightLeft, priority_change: Flag,
  quote_added: Receipt, quote_removed: Trash2, quote_approved: BadgeCheck,
  email_sent: Send, comment: MessageSquare, updated: Pencil, task_added: Bell,
  client_contact: MessageSquare, auto_archived: Cloud,
};

const buildEmail = (n) => {
  const subject = `Pedido de orçamento - ${n.description || "artigo"}`;
  const lines = [
    "Boa tarde,", "",
    "Somos o Bricomarché de Faro e gostaríamos de solicitar um orçamento para o seguinte artigo:", "",
    `Artigo: ${n.description || "-"}`,
  ];
  if (n.reference) lines.push(`Referência: ${n.reference}`);
  if (n.measurements) lines.push(`Medidas: ${n.measurements}`);
  if (n.quantity) lines.push(`Quantidade: ${n.quantity}`);
  if (n.color) lines.push(`Cor / acabamento: ${n.color}`);
  if (n.details) lines.push(`Notas: ${n.details}`);
  lines.push("", "Agradecemos o envio do melhor preço e prazo de entrega disponíveis.", "",
    "Com os melhores cumprimentos,", "Bricomarché Faro");
  return { subject, body: lines.join("\n") };
};

export default function PedidoDetail({ open, onOpenChange, noteId, suppliers, gmailStatus, labelsList, onChanged }) {
  const [id, setId] = useState(noteId);
  const [note, setNote] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("detalhes");
  const [saving, setSaving] = useState(false);
  const [autoState, setAutoState] = useState("idle"); // idle | saving | saved

  const [quotes, setQuotes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [comment, setComment] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });

  const [emailSupplier, setEmailSupplier] = useState("");
  const [emailData, setEmailData] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [isReminder, setIsReminder] = useState(false);
  const [newQuote, setNewQuote] = useState({ supplier_name: "", product: "", price: "", notes: "" });

  // Assistant data
  const [assist, setAssist] = useState({ preflight: null, history: null, suggestions: null, alternatives: null, duplicates: null });
  const [dupWarn, setDupWarn] = useState([]);

  const isCreate = !id;
  const dirty = useRef(false);
  const set = (k, v) => { dirty.current = true; setForm((f) => ({ ...f, [k]: v })); };

  const loadSub = useCallback(async (nid) => {
    const [q, a, t] = await Promise.all([
      api.get(`/notes/${nid}/quotes`),
      api.get(`/notes/${nid}/activities`),
      api.get(`/notes/${nid}/tasks`),
    ]);
    setQuotes(q.data); setActivities(a.data); setTasks(t.data);
  }, []);

  const loadNote = useCallback(async (nid) => {
    const { data } = await api.get(`/notes/${nid}`);
    setNote(data);
    setForm({ ...emptyForm, ...data });
    setEmailData(buildEmail(data));
    dirty.current = false;
  }, []);

  const loadAssistant = useCallback(async (nid) => {
    try {
      const [p, h, s, a, d] = await Promise.all([
        api.get(`/notes/${nid}/preflight`),
        api.get(`/notes/${nid}/client-history`),
        api.get(`/notes/${nid}/smart-suggestions`),
        api.get(`/notes/${nid}/alternatives`),
        api.get(`/notes/${nid}/duplicates`),
      ]);
      setAssist({ preflight: p.data, history: h.data, suggestions: s.data, alternatives: a.data, duplicates: d.data });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) {
      setId(noteId);
      setTab("detalhes");
      setEmailSupplier("");
      setIsReminder(false);
      setDupWarn([]);
      setAutoState("idle");
      setAssist({ preflight: null, history: null, suggestions: null, alternatives: null, duplicates: null });
      setNewQuote({ supplier_name: "", product: "", price: "", notes: "" });
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
  }, [open, noteId, loadNote, loadSub]);

  // Load assistant lazily when tab is opened
  useEffect(() => {
    if (open && id && tab === "assistente" && !assist.preflight) loadAssistant(id);
  }, [open, id, tab, assist.preflight, loadAssistant]);

  // Autosave (existing notes) / draft (new notes)
  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      if (dirty.current) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* noop */ } }
      return;
    }
    if (!id || !dirty.current) return;
    setAutoState("saving");
    const t = setTimeout(async () => {
      try {
        await api.put(`/notes/${id}`, {
          customer_name: form.customer_name, phone: form.phone, email: form.email,
          description: form.description, details: form.details, category: form.category,
          measurements: form.measurements, quantity: form.quantity, color: form.color,
          reference: form.reference, sla_days: form.sla_days, reminder_interval_days: form.reminder_interval_days,
        });
        setAutoState("saved");
        dirty.current = false;
        onChanged && onChanged();
      } catch { setAutoState("idle"); }
    }, 900);
    return () => clearTimeout(t);
  }, [form, id, isCreate, open]);

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
    if (id) { await loadNote(id); await loadSub(id); if (tab === "assistente") loadAssistant(id); }
    onChanged && onChanged();
  };

  const saveDetails = async () => {
    if (!form.customer_name && !form.description) {
      toast.error("Preencha o cliente ou a descrição."); return;
    }
    setSaving(true);
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
      }
      onChanged && onChanged();
    } catch {
      toast.error("Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status) => {
    await api.patch(`/notes/${id}/status`, { status });
    toast.success("Estado atualizado");
    await refresh();
  };
  const changePriority = async (priority) => {
    set("priority", priority);
    await api.put(`/notes/${id}`, { priority });
    await refresh();
  };
  const advance = async () => {
    if (note?.next_status) { await changeStatus(note.next_status); }
  };
  const toggleFav = async () => {
    await api.put(`/notes/${id}`, { favorite: !note.favorite });
    await refresh();
  };
  const remove = async () => {
    await api.delete(`/notes/${id}`);
    toast.success("Pedido eliminado");
    onChanged && onChanged();
    onOpenChange(false);
  };
  const resolveNote = async () => {
    await api.post(`/notes/${id}/resolve`);
    toast.success("Pedido resolvido e arquivado");
    await refresh();
  };
  const reopenNote = async () => {
    await api.post(`/notes/${id}/reopen`);
    toast.success("Pedido reaberto");
    await refresh();
  };

  const applySuggestedSupplier = async () => {
    const sup = assist.suggestions?.suggested_supplier;
    if (!sup) return;
    set("supplier_id", sup.id);
    await api.put(`/notes/${id}`, { supplier_id: sup.id });
    dirty.current = false;
    toast.success(`Fornecedor sugerido aplicado: ${sup.name}`);
    await refresh();
  };
  const applySuggestedReminder = async () => {
    const days = assist.suggestions?.suggested_reminder_days;
    if (!days) return;
    set("reminder_interval_days", days);
    await api.put(`/notes/${id}`, { reminder_interval_days: days });
    dirty.current = false;
    toast.success(`Lembrete configurado para ${days} dia(s)`);
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

  const addTask = async () => {
    if (!newTask.title.trim()) { toast.error("Escreva o lembrete."); return; }
    await api.post(`/notes/${id}/tasks`, { title: newTask.title.trim(), due_date: newTask.due_date });
    setNewTask({ title: "", due_date: "" });
    await refresh();
  };
  const toggleTask = async (t) => { await api.patch(`/tasks/${t.id}/toggle`); await loadSub(id); };
  const deleteTask = async (tid) => { await api.delete(`/tasks/${tid}`); await loadSub(id); };

  const addQuote = async () => {
    if (!newQuote.supplier_name || !newQuote.price) { toast.error("Indique fornecedor e preço."); return; }
    await api.post(`/notes/${id}/quotes`, {
      supplier_name: newQuote.supplier_name, product: newQuote.product || form.description,
      price: parseFloat(newQuote.price), notes: newQuote.notes,
    });
    setNewQuote({ supplier_name: "", product: "", price: "", notes: "" });
    toast.success("Orçamento adicionado");
    await refresh();
  };
  const deleteQuote = async (qid) => { await api.delete(`/notes/${id}/quotes/${qid}`); await refresh(); };
  const approveQuote = async (qid) => {
    await api.post(`/notes/${id}/quotes/${qid}/approve`);
    toast.success("Orçamento aprovado");
    await refresh();
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
    if (!emailSupplier) { toast.error("Escolha um fornecedor."); return; }
    setSending(true);
    try {
      await api.post(`/notes/${id}/send-quote-request`, {
        supplier_id: emailSupplier, subject: emailData.subject, body: emailData.body, is_reminder: isReminder,
      });
      toast.success(isReminder ? "Lembrete enviado!" : "Email enviado ao fornecedor!");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao enviar email");
    } finally {
      setSending(false);
    }
  };

  const lowest = quotes.length ? Math.min(...quotes.filter((q) => q.price > 0).map((q) => q.price)) : null;
  const selectedSupplier = suppliers.find((s) => s.id === emailSupplier);
  const st = note ? getStatusCfg(note.status) : null;
  const pf = assist.preflight;
  const sg = assist.suggestions;
  const hist = assist.history;
  const alt = assist.alternatives;
  const dups = assist.duplicates?.matches || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-dialog"
        className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
      >
        {/* Header (fixed) */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate font-heading text-lg font-bold tracking-tight sm:text-xl">
                {isCreate ? "Novo pedido de orçamento" : (form.customer_name || "Pedido")}
              </DialogTitle>
              <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-500">
                {isCreate ? "Registe o pedido do cliente" : (form.phone || "Sem telefone")}
                {!isCreate && note ? ` · atualizado ${timeAgo(note.updated_at)}` : ""}
                {!isCreate && autoState === "saving" ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> a guardar…</span> : null}
                {!isCreate && autoState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-3 w-3" /> guardado</span> : null}
              </p>
            </div>
            {!isCreate && note ? (
              <button data-testid="detail-fav" onClick={toggleFav} className="mr-6 shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-amber-400">
                <Star className={`h-5 w-5 ${note.favorite ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>
            ) : null}
          </div>

          {/* Quick actions */}
          {!isCreate && note ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={note.status} onValueChange={changeStatus}>
                <SelectTrigger data-testid="quick-status" className="h-9 w-auto gap-1.5 rounded-lg border-0 text-xs font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`status-opt-${s}`}>{getStatusCfg(s).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={note.priority} onValueChange={changePriority}>
                <SelectTrigger data-testid="quick-priority" className="h-9 w-auto gap-1.5 rounded-lg text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {note.next_status ? (
                <Button data-testid="detail-advance" size="sm" onClick={advance} className="h-9 rounded-lg">
                  <Zap className="mr-1.5 h-3.5 w-3.5" /> {note.next_status_label}
                </Button>
              ) : null}
              {note.archived ? (
                <Button data-testid="detail-reopen" size="sm" variant="outline" onClick={reopenNote} className="h-9 rounded-lg">Reabrir</Button>
              ) : (
                <Button data-testid="detail-resolve" size="sm" variant="outline" onClick={resolveNote} className="h-9 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolver
                </Button>
              )}
              <Button data-testid="detail-delete" size="sm" variant="outline" onClick={remove} className="ml-auto h-9 rounded-lg border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        {/* Next action banner */}
        {!isCreate && note?.next_action ? (
          <div className={`shrink-0 border-b px-5 py-2.5 text-xs sm:px-6 ${note.is_overdue ? "border-red-100 bg-red-50 text-red-700" : "border-slate-100 bg-slate-50 text-slate-600"}`}>
            <span className="font-bold">{note.is_overdue ? `Atrasado ${note.waiting_days}d · ` : "Próxima ação: "}</span>
            {note.next_action}
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-slate-100 px-5 pt-3 sm:px-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="detalhes" data-testid="tab-detalhes" className="text-xs">Detalhes</TabsTrigger>
              <TabsTrigger value="assistente" data-testid="tab-assistente" className="text-xs" disabled={isCreate}>Assistente</TabsTrigger>
              <TabsTrigger value="orcamentos" data-testid="tab-orcamentos" className="text-xs" disabled={isCreate}>Orçamentos</TabsTrigger>
              <TabsTrigger value="cronologia" data-testid="tab-cronologia" className="text-xs" disabled={isCreate}>Cronologia</TabsTrigger>
              <TabsTrigger value="tarefas" data-testid="tab-tarefas" className="text-xs" disabled={isCreate}>Lembretes</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {/* DETALHES */}
            <TabsContent value="detalhes" className="mt-0 focus-visible:outline-none">
              {isCreate && dupWarn.length > 0 ? (
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
                  <Input data-testid="input-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="font-mono" placeholder="917100512" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Email do cliente</Label>
                  <Input data-testid="input-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Referência do artigo</Label>
                  <Input data-testid="input-reference" value={form.reference} onChange={(e) => set("reference", e.target.value)} className="font-mono" placeholder="Ref. do produto" />
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <Label>Descrição / pedido</Label>
                <Input data-testid="input-description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Janela de correr alumínio" />
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
                  <Label>Medidas / à medida</Label>
                  <Input data-testid="input-measurements" value={form.measurements} onChange={(e) => set("measurements", e.target.value)} className="font-mono" placeholder="2000x1000mm" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input data-testid="input-quantity" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Ex.: 2 unidades" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cor / acabamento</Label>
                  <Input data-testid="input-color" value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <Label>Notas adicionais</Label>
                <Textarea data-testid="input-details" value={form.details} onChange={(e) => set("details", e.target.value)} rows={3} placeholder="Detalhes, prazo, condições..." />
              </div>

              {/* Labels */}
              <div className="mt-4 space-y-1.5">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {form.labels.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      <Tag className="h-3 w-3" /> {l}
                      <button data-testid={`remove-label-${l}`} onClick={() => removeLabel(l)} className="ml-0.5 text-slate-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                  <Input
                    data-testid="label-input"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
                    placeholder="+ etiqueta"
                    className="h-8 w-32 rounded-full text-xs"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(labelsList || []).filter((l) => !form.labels.includes(l)).slice(0, 6).map((l) => (
                    <button key={l} data-testid={`suggest-label-${l}`} onClick={() => addLabel(l)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700">+ {l}</button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <Label>Fornecedor preferido</Label>
                <Select value={form.supplier_id || "none"} onValueChange={(v) => set("supplier_id", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-pref-supplier"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Prazo alerta (dias)</Label>
                  <Input data-testid="input-sla" type="number" min={1} value={form.sla_days} onChange={(e) => set("sla_days", parseInt(e.target.value) || 2)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Lembrete a cada (dias)</Label>
                  <Input data-testid="input-reminder-interval" type="number" min={1} value={form.reminder_interval_days} onChange={(e) => set("reminder_interval_days", parseInt(e.target.value) || 3)} className="font-mono" />
                </div>
              </div>

              <Button data-testid="save-note-btn" onClick={saveDetails} disabled={saving} className="mt-6 w-full rounded-xl">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isCreate ? "Criar pedido" : "Guardar alterações"}
              </Button>
            </TabsContent>

            {/* ASSISTENTE */}
            <TabsContent value="assistente" className="mt-0 focus-visible:outline-none">
              {!pf ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : (
                <div className="space-y-5">
                  {/* Smart suggestion */}
                  <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                    <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-violet-900"><Lightbulb className="h-4 w-4" /> Sugestão do assistente</h4>
                    {sg?.learned && sg?.suggested_supplier ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{sg.suggested_supplier.name}</p>
                            <p className="truncate text-xs text-slate-500">{sg.supplier_reason}</p>
                          </div>
                          <Button data-testid="apply-suggested-supplier" size="sm" className="h-8 shrink-0 rounded-lg text-xs" onClick={applySuggestedSupplier}>Aplicar</Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-xl bg-white p-3">
                          <p className="text-xs text-slate-600">Lembrete sugerido: <b>{sg.suggested_reminder_days} dia(s)</b></p>
                          <Button data-testid="apply-suggested-reminder" size="sm" variant="outline" className="h-8 shrink-0 rounded-lg text-xs" onClick={applySuggestedReminder}>Aplicar</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-violet-700/80">Ainda a aprender. Quando enviar mais pedidos, o assistente começa a sugerir o fornecedor automaticamente.</p>
                    )}
                  </section>

                  {/* Preflight checklist */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900">
                      <ClipboardCheck className="h-4 w-4" /> Antes de enviar {pf.product_label ? `· ${pf.product_label}` : ""}
                    </h4>
                    {pf.missing.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pf.missing.map((m) => <span key={m} className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Falta: {m}</span>)}
                      </div>
                    ) : (
                      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Toda a informação essencial está preenchida.</p>
                    )}
                    {pf.warnings.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {pf.warnings.map((w, i) => <p key={i} className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
                      </div>
                    ) : null}
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Checklist</p>
                    <ul className="mt-1 space-y-1">
                      {pf.checklist.map((c) => <li key={c} className="flex items-start gap-1.5 text-xs text-slate-600"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" /> {c}</li>)}
                    </ul>
                  </section>

                  {/* Duplicates */}
                  {dups.length > 0 ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                      <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-amber-900"><GitCompare className="h-4 w-4" /> Possíveis duplicados</h4>
                      <div className="mt-2 space-y-1.5">
                        {dups.map((d) => (
                          <div key={d.id} className="rounded-lg bg-white p-2.5 text-xs">
                            <p className="font-semibold text-slate-900">{d.customer_name} — {d.description}</p>
                            <p className="text-slate-500">{d.match_reasons.join(" · ")}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {/* Client history */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900"><History className="h-4 w-4" /> Histórico do cliente</h4>
                    {hist ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <p className="text-slate-600">{hist.past_count} pedido(s) anterior(es) deste cliente.</p>
                        {hist.suppliers_used?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-slate-400">Fornecedores usados:</span>
                            {hist.suppliers_used.map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{s}</span>)}
                          </div>
                        ) : null}
                        {hist.reusable_quotes?.length ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-700">Orçamentos reutilizáveis (artigo semelhante):</p>
                            {hist.reusable_quotes.map((q) => (
                              <div key={q.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-2">
                                <span className="text-slate-700">{q.supplier_name} · {q.from_customer}</span>
                                <span className="font-mono font-bold text-slate-900">{q.price?.toFixed(2)} €</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : <p className="mt-2 text-xs text-slate-400">Sem histórico.</p>}
                  </section>

                  {/* Alternatives */}
                  {alt?.suggest_alternatives ? (
                    <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
                      <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-orange-900"><RefreshCw className="h-4 w-4" /> Sem resposta após {alt.reminder_count} lembretes</h4>
                      <p className="mt-1 text-xs text-orange-800">Considere fornecedores alternativos:</p>
                      <div className="mt-2 space-y-1.5">
                        {alt.alternatives.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-lg bg-white p-2 text-xs">
                            <span className="font-semibold text-slate-900">{s.name}{s.email ? "" : " · (sem email)"}</span>
                            {s.avg_hours != null ? <span className="text-slate-500">~{s.avg_hours}h resposta</span> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </TabsContent>

            {/* ORCAMENTOS */}
            <TabsContent value="orcamentos" className="mt-0 focus-visible:outline-none">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-700" />
                  <h4 className="font-heading text-sm font-bold text-slate-900">Pedir preço a fornecedor</h4>
                </div>
                {!gmailStatus?.connected ? (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Gmail não ligado</p>
                      <p className="text-xs">Ligue o Gmail para enviar automaticamente, ou copie o email.</p>
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

              <section className="mt-6">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-slate-700" />
                  <h4 className="font-heading text-sm font-bold text-slate-900">Comparar orçamentos recebidos</h4>
                </div>
                <div className="mt-3 space-y-2">
                  {quotes.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Ainda sem orçamentos.</p>
                  ) : quotes.map((q) => {
                    const isBest = q.price === lowest && q.price > 0;
                    return (
                      <div key={q.id} data-testid={`quote-row-${q.id}`} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${isBest ? "border-emerald-300 bg-emerald-50" : q.approved ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{q.supplier_name}</p>
                            {isBest ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Melhor preço</span> : null}
                            {q.approved ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Aprovado</span> : null}
                          </div>
                          {q.product ? <p className="truncate text-xs text-slate-500">{q.product}</p> : null}
                          {q.notes ? <p className="truncate text-xs text-slate-400">{q.notes}</p> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`font-mono text-base font-bold ${isBest ? "text-emerald-700" : "text-slate-900"}`}>{q.price.toFixed(2)} €</span>
                          {!q.approved ? (
                            <button data-testid={`approve-quote-${q.id}`} onClick={() => approveQuote(q.id)} title="Aprovar" className="rounded-lg p-1 text-slate-400 hover:text-emerald-600"><BadgeCheck className="h-4 w-4" /></button>
                          ) : null}
                          <button data-testid={`delete-quote-${q.id}`} onClick={() => deleteQuote(q.id)} className="rounded-lg p-1 text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                  <Input data-testid="quote-supplier-input" placeholder="Fornecedor" value={newQuote.supplier_name} onChange={(e) => setNewQuote((q) => ({ ...q, supplier_name: e.target.value }))} />
                  <Input data-testid="quote-price-input" type="number" placeholder="Preço (€)" value={newQuote.price} onChange={(e) => setNewQuote((q) => ({ ...q, price: e.target.value }))} className="font-mono" />
                  <Input data-testid="quote-product-input" placeholder="Artigo (opcional)" value={newQuote.product} onChange={(e) => setNewQuote((q) => ({ ...q, product: e.target.value }))} />
                  <Input data-testid="quote-notes-input" placeholder="Nota (prazo, ref...)" value={newQuote.notes} onChange={(e) => setNewQuote((q) => ({ ...q, notes: e.target.value }))} />
                  <Button data-testid="add-quote-btn" onClick={addQuote} className="rounded-xl sm:col-span-2"><Plus className="mr-2 h-4 w-4" /> Adicionar orçamento</Button>
                </div>
              </section>
            </TabsContent>

            {/* CRONOLOGIA */}
            <TabsContent value="cronologia" className="mt-0 focus-visible:outline-none">
              <div className="flex gap-2">
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
                        <p className="mt-0.5 text-xs text-slate-400">{a.author} · {timeAgo(a.created_at)}</p>
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
      </DialogContent>
    </Dialog>
  );
}
