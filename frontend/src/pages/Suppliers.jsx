import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Mail, Phone, MessageCircle, Trash2, Pencil, Truck, Receipt, ClipboardList } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia,
} from "@/components/ui/empty";
import { CategoryBadge } from "@/components/CategoryBadge";
import PhoneInput from "@/components/PhoneInput";
import { formatPhoneDisplay } from "@/lib/phoneFormat";
import LabelEditor from "@/components/LabelEditor";
import AttachmentManager from "@/components/AttachmentManager";
import { toast } from "sonner";

const empty = { name: "", email: "", phone: "", category: "construcao", notes: "", labels: [], contacts: [] };
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PHONE_DIGITS = 9;
const MAX_CONTACTS = 10;

// Reutilizados nas validações do fornecedor e de cada contacto extra — assim
// o limiar de "telefone incompleto" e o formato de email só existem numa
// única definição, em vez de espalhados por vários pontos do ficheiro.
const isValidPhoneDigits = (phone) => (phone || "").replace(/\D/g, "").length >= MIN_PHONE_DIGITS;
const isValidEmail = (email) => EMAIL_RX.test(email);

// Formato internacional (com indicativo) do PhoneInput → link de WhatsApp.
// Números antigos sem indicativo assumem Portugal, tal como o "tel:".
function waLink(phone) {
  // Números legados/mal formados (menos dígitos do que um telefone real)
  // geravam um link wa.me quebrado — mais vale não mostrar o atalho do que
  // mostrar um que dá erro ao abrir.
  if (!isValidPhoneDigits(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${phone.trim().startsWith("+") ? digits : `351${digits}`}`;
}

function PhoneActions({ phone }) {
  const wa = waLink(phone);
  if (!wa) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <a href={`tel:${phone}`} title="Ligar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <Phone className="h-3.5 w-3.5" />
      </a>
      <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" className="rounded-md p-1 text-muted-foreground hover:bg-[var(--pastel-emerald-bg)] hover:text-success">
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

function EmailAction({ email }) {
  if (!email) return null;
  return (
    <a href={`mailto:${email}`} title="Enviar email" className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      <Mail className="h-3.5 w-3.5" />
    </a>
  );
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const { data } = await api.get("/suppliers");
      if (seq !== loadSeq.current) return;
      setSuppliers(data);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar fornecedores"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...empty, ...s, contacts: (s.contacts || []).map((c) => ({ name: "", phone: "", email: "", ...c })) });
    setOpen(true);
  };

  const addContact = () => setForm((f) => {
    if ((f.contacts || []).length >= MAX_CONTACTS) {
      toast.error(`Máximo de ${MAX_CONTACTS} contactos extra por fornecedor.`);
      return f;
    }
    return { ...f, contacts: [...(f.contacts || []), { name: "", phone: "", email: "" }] };
  });
  const updateContact = (i, k, v) => setForm((f) => ({
    ...f, contacts: f.contacts.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)),
  }));
  const removeContact = (i) => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (saving) return; // Enter repetido/duplo clique não deve disparar dois guardados concorrentes
    if (!form.name.trim()) { toast.error("Indica o nome do fornecedor."); return; }
    if (form.email && !isValidEmail(form.email.trim())) {
      toast.error("O email do fornecedor não parece válido.");
      return;
    }
    if (form.phone && !isValidPhoneDigits(form.phone)) {
      toast.error("O telefone do fornecedor parece incompleto.");
      return;
    }
    const contacts = (form.contacts || [])
      .map((c) => ({ name: (c.name || "").trim(), phone: (c.phone || "").trim(), email: (c.email || "").trim() }))
      .filter((c) => c.name || c.phone || c.email);
    for (const c of contacts) {
      if (c.phone && !isValidPhoneDigits(c.phone)) {
        toast.error(`O telefone de ${c.name || "contacto"} parece incompleto.`);
        return;
      }
      if (c.email && !isValidEmail(c.email)) {
        toast.error(`O email de ${c.name || "contacto"} não parece válido.`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), email: form.email.trim(), contacts };
      if (editing) await api.put(`/suppliers/${editing.id}`, payload);
      else await api.post("/suppliers", payload);
      toast.success(editing ? "Fornecedor atualizado" : "Fornecedor adicionado");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (deletingId === s.id) return; // já há uma remoção deste fornecedor em curso
    if (!window.confirm(`Mover o fornecedor "${s.name}" para a lixeira? Podes restaurá-lo depois, na Lixeira.`)) return;
    setDeletingId(s.id);
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success("Fornecedor movido para a lixeira");
      load();
    } catch (e) {
      // 409: fornecedor associado a pedidos em aberto — o backend descreve
      // quantos/quais; se o utilizador confirmar outra vez, força a remoção
      // e desassocia esses pedidos (ficam sem fornecedor, mas não são apagados).
      if (e?.response?.status === 409) {
        const detail = getErrorMessage(e);
        if (window.confirm(`${detail}\n\nMover para a lixeira mesmo assim?`)) {
          try {
            await api.delete(`/suppliers/${s.id}`, { params: { force: true } });
            toast.success("Fornecedor movido para a lixeira e pedidos desassociados");
            load();
          } catch (e2) {
            toast.error(getErrorMessage(e2, "Erro ao eliminar"));
          }
        }
        return;
      }
      toast.error(getErrorMessage(e, "Erro ao eliminar"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="kicker">Contactos</p>
          <h1 className="mt-0.5 font-heading text-h1 text-foreground">Fornecedores</h1>
          <p className="text-body text-text-body">
            {suppliers.length > 0
              ? `${suppliers.length} contacto${suppliers.length === 1 ? "" : "s"} pronto${suppliers.length === 1 ? "" : "s"} a receber pedidos de orçamento.`
              : "Para onde enviar os pedidos de orçamento."}
          </p>
        </div>
        <Button data-testid="add-supplier-btn" onClick={openNew} className="hidden rounded-xl shadow-lg shadow-slate-400/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:inline-flex">
          <Plus className="mr-2 h-4 w-4" /> Novo fornecedor
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {suppliers.map((s, idx) => {
          const c = getCategory(s.category);
          // Um registo antigo/corrompido sem nome não pode derrubar a grelha
          // inteira — "?" é um resultado degradado, não um crash.
          const initials = (s.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
          return (
            <div
              key={s.id}
              data-testid={`supplier-card-${s.id}`}
              className="group relative animate-fade-up overflow-hidden rounded-2xl border border-border bg-card p-4 card-elevated card-elevated-hover transition-all duration-200 hover:-translate-y-1 hover:border-input sm:p-5"
              style={{ "--stagger-i": Math.min(idx, 8) }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-extrabold shadow-sm transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-h3 text-foreground">{s.name}</h3>
                    {s.category ? <div className="mt-1"><CategoryBadge category={s.category} /></div> : null}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button data-testid={`edit-supplier-${s.id}`} onClick={() => openEdit(s)} className="rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:scale-110 hover:bg-muted hover:text-foreground active:scale-90">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button data-testid={`delete-supplier-${s.id}`} disabled={deletingId === s.id} onClick={() => remove(s)} className="rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:scale-110 hover:bg-[var(--pastel-red-bg)] hover:text-destructive active:scale-90 disabled:opacity-50">
                    {deletingId === s.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {s.email ? <span className="truncate font-mono text-xs">{s.email}</span> : <span className="text-xs text-destructive">Sem email definido</span>}
                  </span>
                  <EmailAction email={s.email} />
                </p>
                {s.phone ? (
                  <p className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> <span className="truncate font-mono text-xs">{formatPhoneDisplay(s.phone)}</span>
                    </span>
                    <PhoneActions phone={s.phone} />
                  </p>
                ) : null}
                {(s.contacts || []).filter((c) => c.phone || c.email).map((c, i) => (
                  <p key={i} className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs">
                        {c.name ? <span className="font-semibold">{c.name}</span> : null}{c.name && (c.phone || c.email) ? " · " : ""}
                        {c.phone ? <span className="font-mono">{formatPhoneDisplay(c.phone)}</span> : null}
                        {c.phone && c.email ? " · " : ""}
                        {c.email ? <span className="font-mono">{c.email}</span> : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <PhoneActions phone={c.phone} />
                      <EmailAction email={c.email} />
                    </span>
                  </p>
                ))}
                {s.notes ? <p className="pt-1 text-xs text-text-body">{s.notes}</p> : null}
                {(s.labels || []).length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {s.labels.slice(0, 4).map((l) => (
                      <span key={l} className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{l}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              {(s.open_notes > 0 || s.quotes_given > 0) ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {s.open_notes > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-blue-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--pastel-blue-text)]">
                      <ClipboardList className="h-3 w-3" /> {s.open_notes} pedido{s.open_notes === 1 ? "" : "s"} em aberto
                    </span>
                  ) : null}
                  {s.quotes_given > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-emerald-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--pastel-emerald-text)]">
                      <Receipt className="h-3 w-3" /> {s.quotes_approved}/{s.quotes_given} orçamento{s.quotes_given === 1 ? "" : "s"} aprovado{s.quotes_approved === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {suppliers.length === 0 ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-float-slow rounded-3xl bg-muted/60 blur-xl" />
              <div className="card-elevated relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 text-red-600">
                <Truck className="h-7 w-7" />
              </div>
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-foreground">Ainda sem fornecedores</EmptyTitle>
            <EmptyDescription className="text-muted-foreground">Adiciona o primeiro contacto para começar a pedir orçamentos num clique.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-lg shadow-slate-400/40 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95">
              <Plus className="h-4 w-4" strokeWidth={2.6} /> Adicionar fornecedor
            </button>
          </EmptyContent>
        </Empty>
      ) : null}

      {/* Portal para o <body> — mesmo motivo do botão + dos Pedidos: fica fora
          do wrapper com transform, para o "position: fixed" prender à janela. */}
      {createPortal(
        <button
          data-testid="fab-new-supplier"
          onClick={() => {
            haptics.tap();
            openNew();
          }}
          aria-label="Novo fornecedor"
          title="Novo fornecedor"
          className="group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 select-none touch-manipulation items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-black text-white shadow-[0_16px_35px_-8px_rgba(15,23,42,0.55)] ring-1 ring-black/10 transition-all duration-150 will-change-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/50 active:scale-90 active:duration-75 sm:hidden"
        >
          <Plus className="h-7 w-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
        </button>,
        document.body,
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="supplier-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-h2">
              {editing ? "Editar fornecedor" : "Novo fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input data-testid="supplier-name" value={form.name} onChange={(e) => set("name", e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Ex.: Alumínios Algarve" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input data-testid="supplier-email" value={form.email} onChange={(e) => set("email", e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="geral@fornecedor.pt" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone principal</Label>
              <PhoneInput testId="supplier-phone" value={form.phone} onChange={(v) => set("phone", v)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="912345678" />
            </div>
            <div className="space-y-1.5">
              <Label>Secção</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger data-testid="supplier-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Outros contactos (opcional)</Label>
                <Button type="button" data-testid="add-supplier-contact" size="sm" variant="outline" onClick={addContact} className="h-7 rounded-lg px-2 text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
              {(form.contacts || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Ex.: número/email pessoal da Camila, do Jorge, etc.</p>
              ) : (
                <div className="space-y-2">
                  {form.contacts.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-border p-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Input
                          data-testid={`supplier-contact-name-${i}`}
                          value={c.name}
                          onChange={(e) => updateContact(i, "name", e.target.value)}
                          placeholder="Nome (ex.: Camila)"
                          className="h-8 text-sm"
                        />
                        <PhoneInput
                          testId={`supplier-contact-phone-${i}`}
                          value={c.phone}
                          onChange={(v) => updateContact(i, "phone", v)}
                          placeholder="912345678"
                        />
                        <Input
                          data-testid={`supplier-contact-email-${i}`}
                          value={c.email}
                          onChange={(e) => updateContact(i, "email", e.target.value)}
                          placeholder="email@fornecedor.pt"
                          className="h-8 font-mono text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        data-testid={`remove-supplier-contact-${i}`}
                        onClick={() => removeContact(i)}
                        className="mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea data-testid="supplier-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="O que fornece..." />
            </div>
            <div className="space-y-1.5">
              <Label>Etiquetas</Label>
              <LabelEditor testIdPrefix="supplier-label" labels={form.labels || []} onChange={(labels) => set("labels", labels)} />
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label>Anexos</Label>
                <AttachmentManager ownerKind="supplier" ownerId={editing.id} />
              </div>
            ) : null}
            <Button data-testid="save-supplier-btn" onClick={save} disabled={saving} loading={saving} className="w-full rounded-xl">
              {editing ? "Guardar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
