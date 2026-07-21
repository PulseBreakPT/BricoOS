import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Trash2, Plus, Repeat } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST } from "@/lib/categories";
import { TASK_PRIORITIES, TASK_REPEATS } from "@/lib/taskMeta";
import LabelEditor from "@/components/LabelEditor";
import AttachmentManager from "@/components/AttachmentManager";

const emptyForm = {
  title: "", category: "construcao", priority: "nenhuma", due_date: "", repeat: "none", subtasks: [], labels: [],
};

export default function TaskDialog({ open, onOpenChange, task, onSaved }) {
  const isEdit = Boolean(task && task.id);
  const [form, setForm] = useState(emptyForm);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setForm(task ? { ...emptyForm, ...task } : emptyForm);
      setNewSubtask("");
    }
  }, [open, task]);

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setForm((f) => ({ ...f, subtasks: [...(f.subtasks || []), { id: "", title: newSubtask.trim(), done: false }] }));
    setNewSubtask("");
  };

  const toggleSubtask = (idx) => {
    setForm((f) => ({
      ...f,
      subtasks: f.subtasks.map((s, i) => (i === idx ? { ...s, done: !s.done } : s)),
    }));
  };

  const removeSubtask = (idx) => {
    setForm((f) => ({ ...f, subtasks: f.subtasks.filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Escreve o título da tarefa.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/tasks/${task.id}`, form);
        toast.success("Tarefa atualizada");
      } else {
        await api.post("/tasks", form);
        toast.success("Tarefa adicionada");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar a tarefa"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success("Tarefa movida para a lixeira", { description: "Podes restaurá-la na Lixeira." });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mover para a lixeira"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="task-dialog" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-bold tracking-tight">
            {isEdit ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Prazo, prioridade, repetição e subtarefas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input
            data-testid="task-dialog-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Ex.: Ligar ao fornecedor de tintas"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Secção</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger data-testid="task-dialog-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger data-testid="task-dialog-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Data limite</Label>
            <Input
              data-testid="task-dialog-due-date"
              type="date"
              value={form.due_date || ""}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Repetir</Label>
            <Select value={form.repeat} onValueChange={(v) => set("repeat", v)} disabled={!form.due_date}>
              <SelectTrigger data-testid="task-dialog-repeat"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_REPEATS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {!form.due_date && form.repeat !== "none" ? (
          <p className="text-xs text-amber-600">Define uma data limite para poder repetir a tarefa.</p>
        ) : null}

        <div className="space-y-2">
          <Label>Subtarefas</Label>
          <div className="space-y-1.5">
            {(form.subtasks || []).map((s, idx) => (
              <div key={s.id || idx} data-testid={`task-dialog-subtask-${idx}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <Checkbox checked={s.done} onCheckedChange={() => toggleSubtask(idx)} className="h-4 w-4" />
                <span className={`flex-1 text-sm ${s.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{s.title}</span>
                <button onClick={() => removeSubtask(idx)} aria-label={`Remover subtarefa ${s.title}`} title="Remover subtarefa" className="text-slate-300 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              data-testid="task-dialog-new-subtask"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
              placeholder="Adicionar subtarefa..."
              className="h-9"
            />
            <Button type="button" variant="outline" onClick={addSubtask} className="h-9 shrink-0 px-3">
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Etiquetas</Label>
          <LabelEditor testIdPrefix="task-label" labels={form.labels || []} onChange={(labels) => set("labels", labels)} />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Anexos</Label>
            <AttachmentManager ownerKind="task" ownerId={task.id} />
          </div>
        ) : null}

        <div className="flex items-center gap-3 pt-2">
          <Button data-testid="task-dialog-save" onClick={save} disabled={saving} className="flex-1 rounded-xl">
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {isEdit ? "Guardar alterações" : "Criar tarefa"}
          </Button>
          {isEdit ? (
            <Button
              data-testid="task-dialog-delete"
              variant="outline"
              onClick={remove}
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
