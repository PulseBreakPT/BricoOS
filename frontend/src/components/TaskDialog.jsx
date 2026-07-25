import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Trash2, Plus, Repeat, History, Copy, BookmarkPlus, FileDown } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST } from "@/lib/categories";
import {
  TASK_PRIORITIES, TASK_REPEATS, TASK_STATUS_LABELS, TASK_STATUS_TRANSITIONS, getTaskStatus,
} from "@/lib/taskMeta";
import LabelEditor from "@/components/LabelEditor";
import AttachmentManager from "@/components/AttachmentManager";

const emptyForm = {
  title: "", category: "construcao", priority: "nenhuma", due_date: "", due_time: "",
  repeat: "none", subtasks: [], labels: [], group_id: "", assignee_id: "",
  depends_on: [], remind_minutes_before: null, notes: "",
};

const NEW_GROUP_VALUE = "__new__";
const NO_GROUP_VALUE = "__none__";
const NO_ASSIGNEE_VALUE = "__none__";
const NO_REMINDER_VALUE = "__none__";

const REMINDER_OPTIONS = [
  { value: NO_REMINDER_VALUE, label: "Sem lembrete" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 dia antes" },
];

function historyLine(entry) {
  const when = entry.created_at ? new Date(entry.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "";
  const who = entry.actor ? ` — ${entry.actor}` : "";
  return { when, who };
}

export default function TaskDialog({ open, onOpenChange, task, allTasks = [], collaborators = [], onSaved }) {
  const isEdit = Boolean(task && task.id);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("todo");
  const [statusBusy, setStatusBusy] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroupBusy, setCreatingGroupBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [duplicating, setDuplicating] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const loadGroups = async () => {
    try {
      const { data } = await api.get("/task-groups");
      setGroups(data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar grupos"));
    }
  };

  const loadTemplates = async () => {
    try {
      const { data } = await api.get("/task-templates");
      setTemplates(data);
    } catch {
      // silencioso — modelos são um atalho opcional, não bloqueiam o diálogo
    }
  };

  useEffect(() => {
    if (open) {
      setForm(task ? { ...emptyForm, ...task } : emptyForm);
      setStatus(task ? getTaskStatus(task) : "todo");
      setNewSubtask("");
      setCreatingGroup(false);
      setNewGroupName("");
      setHistoryOpen(false);
      setHistory([]);
      loadGroups();
      loadTemplates();
    }
  }, [open, task]);

  const onGroupChange = (v) => {
    if (v === NEW_GROUP_VALUE) {
      setCreatingGroup(true);
      setNewGroupName("");
      return;
    }
    set("group_id", v === NO_GROUP_VALUE ? "" : v);
  };

  const createGroup = async () => {
    if (creatingGroupBusy) return; // Enter repetido não deve disparar duas criações concorrentes
    if (!newGroupName.trim()) { toast.error("Indica o nome do grupo."); return; }
    setCreatingGroupBusy(true);
    try {
      const { data } = await api.post("/task-groups", { name: newGroupName.trim() });
      setGroups((g) => [...g, data].sort((a, b) => a.name.localeCompare(b.name)));
      set("group_id", data.id);
      setCreatingGroup(false);
      setNewGroupName("");
      toast.success("Grupo criado");
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao criar grupo"));
    } finally {
      setCreatingGroupBusy(false);
    }
  };

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

  const toggleDependency = (id) => {
    setForm((f) => {
      const has = (f.depends_on || []).includes(id);
      return { ...f, depends_on: has ? f.depends_on.filter((x) => x !== id) : [...(f.depends_on || []), id] };
    });
  };

  const dependencyCandidates = useMemo(() => allTasks
    .filter((t) => t.id !== task?.id)
    .filter((t) => !form.group_id || t.group_id === form.group_id)
    .sort((a, b) => a.title.localeCompare(b.title)),
  [allTasks, form.group_id, task]);

  const save = async () => {
    if (saving) return; // segurar Enter no título não deve disparar dois guardados concorrentes
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

  const changeStatus = async (next) => {
    if (!isEdit || next === status || statusBusy) return;
    const prev = status;
    setStatus(next);
    setStatusBusy(true);
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: next });
      toast.success(`Estado alterado para "${TASK_STATUS_LABELS[next]}"`);
      onSaved();
    } catch (e) {
      setStatus(prev);
      toast.error(getErrorMessage(e, "Não foi possível alterar o estado"));
    } finally {
      setStatusBusy(false);
    }
  };

  const duplicateTask = async () => {
    if (!isEdit || duplicating) return;
    setDuplicating(true);
    try {
      await api.post(`/tasks/${task.id}/duplicate`);
      toast.success("Tarefa duplicada");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível duplicar"));
    } finally {
      setDuplicating(false);
    }
  };

  const saveAsTemplate = async () => {
    if (savingTemplate) return;
    if (!form.title.trim()) { toast.error("Escreve o título da tarefa primeiro."); return; }
    const name = window.prompt("Nome do modelo:", form.title.trim());
    if (!name || !name.trim()) return;
    setSavingTemplate(true);
    try {
      await api.post("/task-templates", {
        name: name.trim(), title: form.title.trim(), category: form.category,
        priority: form.priority, repeat: form.repeat, subtasks: form.subtasks || [],
        labels: form.labels || [],
      });
      toast.success("Modelo guardado", { description: "Gere-o em Definições > Modelos de tarefas." });
      loadTemplates();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar o modelo"));
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = (templateId) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setForm((f) => ({
      ...f, title: tpl.title, category: tpl.category, priority: tpl.priority,
      repeat: tpl.repeat, subtasks: (tpl.subtasks || []).map((s) => ({ id: "", title: s.title, done: false })),
      labels: tpl.labels || [],
    }));
    toast.success(`Preenchido a partir de "${tpl.name}"`);
  };

  const openHistory = async () => {
    if (!isEdit) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/tasks/${task.id}/history`);
      setHistory([...data].reverse());
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar o histórico"));
    } finally {
      setHistoryLoading(false);
    }
  };

  const statusOptions = TASK_STATUS_TRANSITIONS[status] || [status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="task-dialog" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-h3">
            {isEdit ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
          <DialogDescription className="text-text-body">
            Prazo, prioridade, repetição e subtarefas.
          </DialogDescription>
        </DialogHeader>

        {!isEdit && templates.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Criar a partir de modelo</Label>
            <Select value="" onValueChange={applyTemplate}>
              <SelectTrigger data-testid="task-dialog-template"><SelectValue placeholder="Escolher modelo…" /></SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input
            data-testid="task-dialog-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
            placeholder="Ex.: Ligar ao fornecedor de tintas"
            autoFocus
          />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={status} onValueChange={changeStatus} disabled={statusBusy}>
              <SelectTrigger data-testid="task-dialog-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Grupo</Label>
          {creatingGroup ? (
            <div className="flex gap-2">
              <Input
                data-testid="task-dialog-new-group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createGroup(); } }}
                placeholder="Nome do novo grupo"
                autoFocus
              />
              <Button type="button" variant="outline" disabled={creatingGroupBusy} onClick={createGroup} className="h-9 shrink-0 px-3">
                {creatingGroupBusy ? <Spinner className="h-4 w-4" /> : "Criar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreatingGroup(false)} className="h-9 shrink-0 px-3">
                Cancelar
              </Button>
            </div>
          ) : (
            <Select value={form.group_id || NO_GROUP_VALUE} onValueChange={onGroupChange}>
              <SelectTrigger data-testid="task-dialog-group"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP_VALUE}>Sem grupo</SelectItem>
                {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                <SelectItem value={NEW_GROUP_VALUE}>+ Criar novo grupo</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="space-y-1.5">
          <Label>Colaborador</Label>
          <Select value={form.assignee_id || NO_ASSIGNEE_VALUE} onValueChange={(v) => set("assignee_id", v === NO_ASSIGNEE_VALUE ? "" : v)}>
            <SelectTrigger data-testid="task-dialog-assignee"><SelectValue placeholder="Sem colaborador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ASSIGNEE_VALUE}>Sem colaborador</SelectItem>
              {collaborators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
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
            <Label>Hora</Label>
            <Input
              data-testid="task-dialog-due-time"
              type="time"
              value={form.due_time || ""}
              onChange={(e) => set("due_time", e.target.value)}
              disabled={!form.due_date}
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
          <p className="text-xs text-warning">Define uma data limite para poder repetir a tarefa.</p>
        ) : null}

        <div className="space-y-1.5">
          <Label>Lembrete</Label>
          <Select
            value={form.remind_minutes_before == null ? NO_REMINDER_VALUE : String(form.remind_minutes_before)}
            onValueChange={(v) => set("remind_minutes_before", v === NO_REMINDER_VALUE ? null : Number(v))}
            disabled={!form.due_date || !form.due_time}
          >
            <SelectTrigger data-testid="task-dialog-reminder"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REMINDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {(!form.due_date || !form.due_time) ? (
            <p className="text-xs text-text-body">Define data e hora limite para poder agendar um lembrete.</p>
          ) : null}
        </div>

        {dependencyCandidates.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Depende de</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
              {dependencyCandidates.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    data-testid={`task-dialog-dependency-${t.id}`}
                    checked={(form.depends_on || []).includes(t.id)}
                    onCheckedChange={() => toggleDependency(t.id)}
                    className="h-4 w-4"
                  />
                  <span>{t.done ? "✅" : "⏳"}</span>
                  <span className="flex-1 truncate text-foreground">{t.title}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Subtarefas</Label>
          <div className="space-y-1.5">
            {(form.subtasks || []).map((s, idx) => (
              <div key={s.id || idx} data-testid={`task-dialog-subtask-${idx}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                <Checkbox checked={s.done} onCheckedChange={() => toggleSubtask(idx)} className="h-4 w-4" />
                <span className={`flex-1 text-sm ${s.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{s.title}</span>
                <button onClick={() => removeSubtask(idx)} aria-label={`Remover subtarefa ${s.title}`} title="Remover subtarefa" className="text-text-tertiary hover:text-destructive">
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

        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Textarea
            data-testid="task-dialog-notes"
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Notas livres sobre esta tarefa…"
            rows={3}
          />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Anexos</Label>
            <AttachmentManager ownerKind="task" ownerId={task.id} />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {isEdit ? (
            <Button type="button" variant="outline" size="sm" disabled={duplicating} onClick={duplicateTask} className="rounded-lg">
              {duplicating ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} Duplicar
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={savingTemplate} onClick={saveAsTemplate} className="rounded-lg">
            {savingTemplate ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />} Guardar como modelo
          </Button>
          {!isEdit && templates.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><FileDown className="h-3.5 w-3.5" /> Modelos acima</span>
          ) : null}
          {isEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={openHistory} className="ml-auto rounded-lg">
              <History className="mr-1.5 h-3.5 w-3.5" /> Ver alterações
            </Button>
          ) : null}
        </div>

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
              className="rounded-xl border-destructive/30 text-destructive hover:bg-[var(--pastel-red-bg)]"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar
            </Button>
          ) : null}
        </div>
      </DialogContent>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent data-testid="task-history-panel" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-heading text-h3">Histórico da tarefa</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {historyLoading ? (
              <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem alterações registadas.</p>
            ) : history.map((entry) => {
              const { when, who } = historyLine(entry);
              return (
                <div key={entry.id} data-testid={`task-history-entry-${entry.id}`} className="rounded-lg border border-border p-2.5">
                  <p className="text-sm text-foreground">{entry.message}</p>
                  <p className="mt-1 text-meta text-text-tertiary">{when}{who}</p>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </Dialog>
  );
}
