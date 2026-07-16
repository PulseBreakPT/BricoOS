import { useEffect, useState, useCallback } from "react";
import { Plus, Mail, Phone, Trash2, Pencil, Truck, Loader2, Receipt, ClipboardList } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { toast } from "sonner";

const empty = { name: "", email: "", phone: "", category: "construcao", notes: "" };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/suppliers");
      setSuppliers(data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar fornecedores"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...empty, ...s }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Indique o nome do fornecedor."); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("O email do fornecedor não parece válido.");
      return;
    }
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) {
      toast.error("O telefone do fornecedor parece incompleto.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), email: form.email.trim() };
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
    if (!window.confirm(`Eliminar o fornecedor "${s.name}"? Esta ação não pode ser anulada.`)) return;
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success("Fornecedor eliminado");
      load();
    } catch (e) {
      // 409: fornecedor associado a pedidos em aberto — o backend descreve
      // quantos/quais; se o utilizador confirmar outra vez, força a remoção
      // e desassocia esses pedidos (ficam sem fornecedor, mas não são apagados).
      if (e?.response?.status === 409) {
        const detail = getErrorMessage(e);
        if (window.confirm(`${detail}\n\nEliminar mesmo assim?`)) {
          try {
            await api.delete(`/suppliers/${s.id}`, { params: { force: true } });
            toast.success("Fornecedor eliminado e pedidos desassociados");
            load();
          } catch (e2) {
            toast.error(getErrorMessage(e2, "Erro ao eliminar"));
          }
        }
        return;
      }
      toast.error(getErrorMessage(e, "Erro ao eliminar"));
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Contactos</p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Fornecedores</h1>
          <p className="text-sm text-slate-500">Para onde enviar os pedidos de orçamento.</p>
        </div>
        <Button data-testid="add-supplier-btn" onClick={openNew} className="hidden rounded-xl sm:inline-flex">
          <Plus className="mr-2 h-4 w-4" /> Novo fornecedor
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {suppliers.map((s) => {
          const c = getCategory(s.category);
          return (
            <div
              key={s.id}
              data-testid={`supplier-card-${s.id}`}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: c.accent }} />
              <div className="flex items-start justify-between gap-3 pl-2">
                <div className="min-w-0">
                  <h3 className="font-heading text-base font-bold tracking-tight text-slate-900">{s.name}</h3>
                  {s.category ? <div className="mt-2"><CategoryBadge category={s.category} /></div> : null}
                </div>
                <div className="flex gap-1">
                  <button data-testid={`edit-supplier-${s.id}`} onClick={() => openEdit(s)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button data-testid={`delete-supplier-${s.id}`} onClick={() => remove(s)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 pl-2 text-sm">
                <p className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {s.email ? <span className="font-mono text-xs">{s.email}</span> : <span className="text-xs text-red-400">Sem email definido</span>}
                </p>
                {s.phone ? (
                  <p className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400" /> <span className="font-mono text-xs">{s.phone}</span>
                  </p>
                ) : null}
                {s.notes ? <p className="pt-1 text-xs text-slate-400">{s.notes}</p> : null}
              </div>
              {(s.open_notes > 0 || s.quotes_given > 0) ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-2">
                  {s.open_notes > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                      <ClipboardList className="h-3 w-3" /> {s.open_notes} pedido{s.open_notes === 1 ? "" : "s"} em aberto
                    </span>
                  ) : null}
                  {s.quotes_given > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
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
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Truck className="h-7 w-7" />
          </div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900">Sem fornecedores</p>
          <p className="text-sm text-slate-500">Adicione fornecedores para pedir orçamentos.</p>
        </div>
      ) : null}

      <button
        data-testid="fab-new-supplier"
        onClick={openNew}
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-slate-400/40 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 sm:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="supplier-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold tracking-tight">
              {editing ? "Editar fornecedor" : "Novo fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input data-testid="supplier-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Alumínios Algarve" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input data-testid="supplier-email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="geral@fornecedor.pt" className="font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input data-testid="supplier-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="912 345 678" className="font-mono" />
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
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea data-testid="supplier-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="O que fornece..." />
            </div>
            <Button data-testid="save-supplier-btn" onClick={save} disabled={saving} className="w-full rounded-xl">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "Guardar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
