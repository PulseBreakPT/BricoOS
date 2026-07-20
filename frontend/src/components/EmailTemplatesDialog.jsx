import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Plus, Pencil, Trash2, FileStack } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const EMPTY = { name: "", subject: "", body: "" };

// Modelos de resposta reutilizáveis — geridos aqui, usados no seletor
// "Inserir modelo" do ComposeEmailDialog.
export default function EmailTemplatesDialog({ open, onOpenChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/email-templates").then(({ data }) => setItems(data))
      .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar modelos")))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open) { load(); setEditing(null); } }, [open]);

  const startNew = () => { setEditing({}); setForm(EMPTY); };
  const startEdit = (t) => { setEditing(t); setForm({ name: t.name, subject: t.subject, body: t.body }); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("O nome do modelo é obrigatório"); return; }
    setSaving(true);
    try {
      if (editing?.id) await api.put(`/email-templates/${editing.id}`, form);
      else await api.post("/email-templates", form);
      toast.success("Modelo guardado");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar o modelo"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Apagar o modelo "${t.name}"?`)) return;
    try {
      await api.delete(`/email-templates/${t.id}`);
      toast.success("Modelo apagado");
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível apagar o modelo"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="email-templates-dialog" className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
            <FileStack className="h-5 w-5" /> Modelos de resposta
          </DialogTitle>
          <p className="text-xs text-slate-500">Respostas reutilizáveis para inserir rapidamente ao escrever um email.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input data-testid="template-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex.: Pedido de desculpa por atraso" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Assunto</Label>
                <Input data-testid="template-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Mensagem</Label>
                <Textarea data-testid="template-body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={8} />
              </div>
              <div className="flex gap-2">
                <Button data-testid="template-save-btn" onClick={save} disabled={saving} className="rounded-xl">
                  {saving ? <Spinner className="mr-2 h-4 w-4" /> : null} Guardar
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              <Button data-testid="template-new-btn" onClick={startNew} size="sm" className="mb-3 rounded-lg text-xs">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo modelo
              </Button>
              {loading ? (
                <div className="flex justify-center py-8"><Spinner className="h-5 w-5 text-slate-400" /></div>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sem modelos guardados.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} data-testid={`template-${t.id}`} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{t.name}</p>
                        <p className="truncate text-xs text-slate-500">{t.subject}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
