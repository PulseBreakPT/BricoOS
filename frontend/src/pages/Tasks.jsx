import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, ListChecks, CalendarDays, Repeat, SlidersHorizontal } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { CategoryBadge } from "@/components/CategoryBadge";
import TaskDialog from "@/components/TaskDialog";
import FavoriteToggle from "@/components/FavoriteToggle";
import { toast } from "sonner";
import {
  getTaskPriority, TASK_PRIORITIES, isOverdue, isToday, isNext7Days, formatDue, smartTaskSort, subtaskProgress,
} from "@/lib/taskMeta";

const SMART_VIEWS = [
  { key: "todas", label: "Todas" },
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Próximos 7 dias" },
  { key: "atrasadas", label: "Atrasadas" },
  { key: "sem_data", label: "Sem data" },
];

function matchesView(t, view) {
  switch (view) {
    case "hoje": return isToday(t.due_date);
    case "semana": return isNext7Days(t.due_date);
    case "atrasadas": return isOverdue(t.due_date, t.done);
    case "sem_data": return !t.due_date;
    default: return true;
  }
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("todas");
  const [category, setCategory] = useState("todos");
  const [title, setTitle] = useState("");
  const [addCategory, setAddCategory] = useState("construcao");
  const [addPriority, setAddPriority] = useState("nenhuma");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/tasks");
      setTasks(data);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar tarefas"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!title.trim()) { toast.error("Escreve a tarefa."); return; }
    try {
      await api.post("/tasks", { title: title.trim(), category: addCategory, priority: addPriority });
      setTitle("");
      toast.success("Tarefa adicionada");
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao adicionar a tarefa"));
    }
  };

  const toggle = async (t) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api.patch(`/tasks/${t.id}/toggle`);
      load(); // recarrega para apanhar a próxima ocorrência de tarefas recorrentes
    } catch (e) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      toast.error(getErrorMessage(e, "Erro ao atualizar a tarefa"));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Tarefa movida para a lixeira", { description: "Podes restaurá-la na Lixeira." });
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mover para a lixeira"));
    }
  };

  const openEdit = (t) => { setEditingTask(t); setDialogOpen(true); };
  const openNew = () => { setEditingTask(null); setDialogOpen(true); };

  // ---- Seleção em grupo — ações sobre várias tarefas de uma vez (lógica base 21) ----
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const bulkComplete = async () => {
    setBulkBusy(true);
    // /toggle inverte o estado — só chama para as que ainda não estão
    // concluídas, senão desmarcava por engano as que já o estavam.
    const ids = tasks.filter((t) => selected.has(t.id) && !t.done).map((t) => t.id);
    await Promise.allSettled(ids.map((id) => api.patch(`/tasks/${id}/toggle`)));
    toast.success(`${ids.length} tarefa(s) concluída(s)`);
    clearSelection();
    load();
    setBulkBusy(false);
  };
  const bulkTrash = async () => {
    const ids = [...selected];
    if (!window.confirm(`Mover ${ids.length} tarefa(s) para a lixeira? Podes restaurá-las depois, na Lixeira.`)) return;
    setBulkBusy(true);
    await Promise.allSettled(ids.map((id) => api.delete(`/tasks/${id}`)));
    toast.success(`${ids.length} tarefa(s) movida(s) para a lixeira`);
    clearSelection();
    load();
    setBulkBusy(false);
  };

  const filtered = useMemo(() => tasks
    .filter((t) => category === "todos" || t.category === category)
    .filter((t) => matchesView(t, view)),
  [tasks, category, view]);

  const pending = filtered.filter((t) => !t.done).sort(smartTaskSort);
  const done = filtered.filter((t) => t.done);
  const allDone = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((allDone / tasks.length) * 100) : 0;

  const Row = ({ t }) => {
    const c = getCategory(t.category);
    const p = getTaskPriority(t.priority);
    const overdue = isOverdue(t.due_date, t.done);
    const progress = subtaskProgress(t);
    return (
      <div
        data-testid={`task-row-${t.id}`}
        className={`group flex items-center gap-3 rounded-xl border bg-white p-3.5 card-elevated transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 card-elevated-hover ${selected.has(t.id) ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200/90"}`}
      >
        <Checkbox
          data-testid={`task-select-${t.id}`}
          checked={selected.has(t.id)}
          onCheckedChange={() => toggleSelect(t.id)}
          className="h-4 w-4 rounded-md"
        />
        <Checkbox
          data-testid={`task-toggle-${t.id}`}
          checked={t.done}
          onCheckedChange={() => toggle(t)}
          className="h-5 w-5 rounded-md transition-transform duration-150 hover:scale-110 active:scale-90"
        />
        <button className="min-w-0 flex-1 text-left" onClick={() => openEdit(t)}>
          <p className={`text-sm font-semibold text-slate-900 ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={t.category} />
            {t.priority && t.priority !== "nenhuma" ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: p.bg, color: p.color }}>
                {p.label}
              </span>
            ) : null}
            {t.due_date ? (
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  overdue ? "bg-red-100 text-red-700" : isToday(t.due_date) ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                <CalendarDays className="h-3 w-3" /> {formatDue(t.due_date)}
                {t.repeat && t.repeat !== "none" ? <Repeat className="h-3 w-3" /> : null}
              </span>
            ) : null}
            {progress ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {progress.done}/{progress.total}
              </span>
            ) : null}
            {(t.labels || []).slice(0, 3).map((l) => (
              <span key={l} className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{l}</span>
            ))}
          </div>
        </button>
        <FavoriteToggle item={{ kind: "tarefa", id: t.id, label: t.title, sublabel: t.due_date ? formatDue(t.due_date) : "", to: "/tarefas" }} />
        <button data-testid={`delete-task-${t.id}`} onClick={() => remove(t.id)} className="rounded-lg p-2 text-slate-300 transition-all duration-150 hover:scale-110 hover:bg-red-50 hover:text-red-500 active:scale-90">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="kicker">Coisas por fazer</p>
          <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">Tarefas</h1>
          <p className="text-sm text-slate-500">Por secção: construção, bricolagem, decoração e jardim.</p>
        </div>
        {tasks.length > 0 ? (
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="leading-tight">
              <p className="font-mono text-lg font-bold tabular-nums text-slate-900">{allDone}<span className="text-slate-300">/{tasks.length}</span></p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">concluídas</p>
            </div>
            <div className="w-24 sm:w-32">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-slate-900"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-right font-mono text-[10px] font-bold tabular-nums text-slate-400">{pct}%</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Add task */}
      <div className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-4 card-elevated">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            data-testid="task-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nova tarefa..."
            className="h-11 flex-1 rounded-xl"
          />
          <Select value={addCategory} onValueChange={setAddCategory}>
            <SelectTrigger data-testid="task-category-select" className="h-11 rounded-xl sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={addPriority} onValueChange={setAddPriority}>
            <SelectTrigger data-testid="task-priority-select" className="h-11 rounded-xl sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button data-testid="add-task-btn" onClick={add} className="h-11 rounded-xl">
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
          <Button
            data-testid="add-task-advanced-btn"
            variant="outline"
            onClick={openNew}
            className="h-11 shrink-0 rounded-xl px-3"
            title="Nova tarefa com data, repetição e subtarefas"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Smart views */}
      <div className="no-scrollbar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {SMART_VIEWS.map((v) => (
          <button
            key={v.key}
            data-testid={`task-view-${v.key}`}
            onClick={() => setView(v.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${view === v.key ? "bg-slate-900 text-white shadow-md shadow-slate-400/40" : "border border-slate-200 bg-white text-slate-600 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Category filters */}
      <div className="no-scrollbar -mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <button
          data-testid="task-filter-todos"
          onClick={() => setCategory("todos")}
          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${category === "todos" ? "bg-slate-900 text-white shadow-md shadow-slate-400/40" : "border border-slate-200 bg-white text-slate-600 shadow-sm hover:-translate-y-0.5 hover:shadow-md"}`}
        >
          Todas as secções
        </button>
        {CATEGORY_LIST.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              data-testid={`task-filter-${c.key}`}
              onClick={() => setCategory(c.key)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${active ? "shadow-md" : "shadow-sm"}`}
              style={{ backgroundColor: active ? c.accent : c.bg, color: active ? "#fff" : c.text, boxShadow: active ? `0 6px 16px -6px ${c.accent}99` : undefined }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {selected.size > 0 ? (
        <div className="card-elevated mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-xs font-bold text-slate-900">
            <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-red-600 px-1 font-mono text-[11px] font-black text-white">{selected.size}</span>
            selecionada{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button data-testid="task-bulk-complete" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkComplete} className="h-8 rounded-lg border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              Concluir
            </Button>
            <Button data-testid="task-bulk-trash" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkTrash} className="h-8 rounded-lg border-red-200 bg-red-50 px-2.5 text-xs text-red-700 hover:bg-red-100">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Mover para a lixeira
            </Button>
            <Button data-testid="task-bulk-clear" size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              Limpar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {pending.map((t) => <Row key={t.id} t={t} />)}
      </div>

      {done.length > 0 ? (
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Concluídas ({done.length})</p>
          <div className="space-y-2">
            {done.map((t) => <Row key={t.id} t={t} />)}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-14">
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-float-slow rounded-3xl bg-slate-200/60 blur-xl" />
              <div className="card-elevated relative flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 text-red-600">
                <ListChecks className="h-7 w-7" />
              </div>
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-slate-900">Nada por fazer aqui</EmptyTitle>
            <EmptyDescription className="text-slate-500">Escreve a primeira tarefa na caixa acima — fica organizada por secção e prioridade.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editingTask} onSaved={load} />
    </div>
  );
}
