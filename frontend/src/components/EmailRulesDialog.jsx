import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Plus, Pencil, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const FIELD_LABELS = { subject: "Assunto", body: "Corpo", from_email: "Remetente", category: "Categoria (IA)" };
const OP_LABELS = { contains: "contém", equals: "é igual a" };
const ACTION_LABELS = { priority: "Definir prioridade" };
const SELECT_CLS = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500";

const EMPTY = { name: "", enabled: true, conditions: [{ field: "subject", op: "contains", value: "" }], actions: [{ type: "priority", value: "" }] };

// Regras automáticas — aplicadas a cada email recebido logo após a
// classificação por IA (ver _apply_rules no backend). "Se TODAS as
// condições corresponderem, aplica TODAS as ações."
export default function EmailRulesDialog({ open, onOpenChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/email-rules").then(({ data }) => setItems(data))
      .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar regras")))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open) { load(); setEditing(null); } }, [open]);

  const startNew = () => { setEditing({}); setForm(EMPTY); };
  const startEdit = (r) => { setEditing(r); setForm({ name: r.name, enabled: r.enabled, conditions: r.conditions, actions: r.actions }); };

  const setCondition = (i, patch) => setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const addCondition = () => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "subject", op: "contains", value: "" }] }));
  const removeCondition = (i) => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));

  const setAction = (i, patch) => setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  const addAction = () => setForm((f) => ({ ...f, actions: [...f.actions, { type: "priority", value: "" }] }));
  const removeAction = (i) => setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name.trim()) { toast.error("O nome da regra é obrigatório"); return; }
    setSaving(true);
    try {
      if (editing?.id) await api.put(`/email-rules/${editing.id}`, form);
      else await api.post("/email-rules", form);
      toast.success("Regra guardada");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar a regra"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Apagar a regra "${r.name}"?`)) return;
    try {
      await api.delete(`/email-rules/${r.id}`);
      toast.success("Regra apagada");
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível apagar a regra"));
    }
  };

  const toggleEnabled = async (r) => {
    try {
      await api.put(`/email-rules/${r.id}`, { ...r, enabled: !r.enabled });
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="email-rules-dialog" className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <Wand2 className="h-5 w-5" /> Regras automáticas
          </DialogTitle>
          <p className="text-xs text-slate-500">Aplicadas a cada email recebido — se todas as condições corresponderem, todas as ações são executadas.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input data-testid="rule-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex.: Prioridade alta para reclamações" autoFocus />
              </div>

              <div>
                <Label>Se (todas as condições)</Label>
                <div className="mt-1.5 space-y-2">
                  {form.conditions.map((c, i) => (
                    <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-slate-100 p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0">
                      <div className="flex gap-1.5">
                        <select value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })} className={`${SELECT_CLS} flex-1 sm:flex-none min-w-0`}>
                          {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <select value={c.op} onChange={(e) => setCondition(i, { op: e.target.value })} className={`${SELECT_CLS} flex-1 sm:flex-none min-w-0`}>
                          {Object.entries(OP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input value={c.value} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="valor" className="h-8 flex-1 text-xs" />
                        {form.conditions.length > 1 ? (
                          <button type="button" onClick={() => removeCondition(i)} aria-label="Remover condição" title="Remover condição" className="shrink-0 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addCondition} className="h-7 rounded-lg text-xs">
                    <Plus className="mr-1 h-3 w-3" /> Condição
                  </Button>
                </div>
              </div>

              <div>
                <Label>Então (define a prioridade)</Label>
                <div className="mt-1.5 space-y-2">
                  {form.actions.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <select value={a.value} onChange={(e) => setAction(i, { type: "priority", value: e.target.value })} className={`${SELECT_CLS} flex-1 sm:flex-none min-w-0`}>
                        <option value="">escolher...</option>
                        <option value="alta">alta</option>
                        <option value="normal">normal</option>
                        <option value="baixa">baixa</option>
                      </select>
                      {form.actions.length > 1 ? (
                        <button type="button" onClick={() => removeAction(i)} aria-label="Remover ação" title="Remover ação" className="shrink-0 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addAction} className="h-7 rounded-lg text-xs">
                    <Plus className="mr-1 h-3 w-3" /> Ação
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button data-testid="rule-save-btn" onClick={save} disabled={saving} className="rounded-xl">
                  {saving ? <Spinner className="mr-2 h-4 w-4" /> : null} Guardar
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              <Button data-testid="rule-new-btn" onClick={startNew} size="sm" className="mb-3 rounded-lg text-xs">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova regra
              </Button>
              {loading ? (
                <div className="flex justify-center py-8"><Spinner className="h-5 w-5 text-slate-400" /></div>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sem regras criadas.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((r) => (
                    <div key={r.id} data-testid={`rule-${r.id}`} className={`rounded-xl border p-3 ${r.enabled ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{r.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {r.conditions.length} condição(ões) · {r.actions.map((a) => ACTION_LABELS[a.type] || a.type).join(", ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Switch checked={r.enabled} onCheckedChange={() => toggleEnabled(r)} aria-label={r.enabled ? "Desativar regra" : "Ativar regra"} />
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(r)} aria-label="Editar regra" title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => remove(r)} aria-label="Eliminar regra" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
