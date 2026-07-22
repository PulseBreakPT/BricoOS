import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, ListChecks, CalendarDays, Repeat, FolderTree } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { CategoryBadge } from "@/components/CategoryBadge";
import TaskDialog from "@/components/TaskDialog";
import { haptics } from "@/lib/haptics";
import { toast } from "sonner";
import {
  getTaskPriority, isOverdue, isToday, isNext7Days, formatDue, smartTaskSort, subtaskProgress,
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

// Definido fora de Tasks(): declará-lo lá dentro fazia o React ver um "novo"
// componente a cada render do pai (ex.: só por marcar uma checkbox), o que
// desmontava e remontava TODAS as linhas da lista de cada vez — perdia
// transições, scroll de foco e era um custo de DOM desnecessário.
function Row({ t, selected, onToggleSelect, onToggle, onOpen, onDelete, deleting, toggling, groupName }) {
  const c = getCategory(t.category);
  const p = getTaskPriority(t.priority);
  const overdue = isOverdue(t.due_date, t.done);
  const progress = subtaskProgress(t);
  return (
    <div
      data-testid={`task-row-${t.id}`}
      className={`group flex items-center gap-3 rounded-xl border bg-card p-3.5 card-elevated transition-all duration-150 hover:-translate-y-0.5 hover:border-input card-elevated-hover ${selected ? "border-foreground ring-2 ring-foreground/10" : "border-border"}`}
    >
      <Checkbox
        data-testid={`task-select-${t.id}`}
        checked={selected}
        onCheckedChange={onToggleSelect}
        className="h-4 w-4 rounded-md"
      />
      <Checkbox
        data-testid={`task-toggle-${t.id}`}
        checked={t.done}
        disabled={toggling}
        onCheckedChange={onToggle}
        className="h-5 w-5 rounded-md transition-transform duration-150 hover:scale-110 active:scale-90"
      />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className={`text-sm font-semibold text-foreground ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={t.category} />
          {groupName ? (
            <span className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              <FolderTree className="h-3 w-3" /> {groupName}
            </span>
          ) : null}
          {t.priority && t.priority !== "nenhuma" ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: p.bg, color: p.color }}>
              {p.label}
            </span>
          ) : null}
          {t.due_date ? (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                overdue ? "bg-[var(--pastel-red-bg)] text-[color:var(--pastel-red-text)]" : isToday(t.due_date) ? "bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)]" : "bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]"
              }`}
            >
              <CalendarDays className="h-3 w-3" /> {formatDue(t.due_date)}
              {t.repeat && t.repeat !== "none" ? <Repeat className="h-3 w-3" /> : null}
            </span>
          ) : null}
          {progress ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          ) : null}
          {(t.labels || []).slice(0, 3).map((l) => (
            <span key={l} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{l}</span>
          ))}
        </div>
      </button>
      <button data-testid={`delete-task-${t.id}`} disabled={deleting} onClick={onDelete} className="rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:scale-110 hover:bg-[var(--pastel-red-bg)] hover:text-red-500 active:scale-90 disabled:opacity-50">
        {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("todas");
  const [category, setCategory] = useState("todos");
  const [groups, setGroups] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const loadSeq = useRef(0);
  const loadGroupsSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const { data } = await api.get("/tasks");
      if (seq !== loadSeq.current) return;
      setTasks(data);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar tarefas"));
    }
  }, []);
  const loadGroups = useCallback(async () => {
    const seq = ++loadGroupsSeq.current;
    try {
      const { data } = await api.get("/task-groups");
      if (seq !== loadGroupsSeq.current) return;
      setGroups(data);
    } catch (e) {
      if (seq !== loadGroupsSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar grupos"));
    }
  }, []);
  useEffect(() => { load(); loadGroups(); }, [load, loadGroups]);

  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);

  const toggle = async (t) => {
    // Um duplo clique/toque rápido no mesmo checkbox não pode disparar dois
    // PATCH /toggle concorrentes — numa tarefa recorrente, cada toggle para
    // "concluída" cria a próxima ocorrência, e dois em corrida criava-a a dobrar.
    if (togglingIds.has(t.id)) return;
    setTogglingIds((prev) => new Set(prev).add(t.id));
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api.patch(`/tasks/${t.id}/toggle`);
      await load(); // recarrega para apanhar a próxima ocorrência de tarefas recorrentes
    } catch (e) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      toast.error(getErrorMessage(e, "Erro ao atualizar a tarefa"));
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(t.id); return next; });
    }
  };

  const remove = async (id) => {
    if (deletingIds.has(id)) return; // já há uma remoção desta tarefa em curso
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Tarefa movida para a lixeira", { description: "Podes restaurá-la na Lixeira." });
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mover para a lixeira"));
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
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
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/tasks/${id}/toggle`)));
    const failedIds = ids.filter((_, i) => results[i].status === "rejected");
    toast[failedIds.length ? "warning" : "success"](
      failedIds.length ? `${ids.length - failedIds.length} concluída(s), ${failedIds.length} falhou(aram)` : `${ids.length} tarefa(s) concluída(s)`
    );
    // Mantém selecionadas só as que falharam, para se poder repetir a ação
    // exatamente sobre elas em vez de perder essa informação.
    setSelected(new Set(failedIds));
    load();
    setBulkBusy(false);
  };
  const bulkTrash = async () => {
    const ids = [...selected];
    if (!window.confirm(`Mover ${ids.length} tarefa(s) para a lixeira? Podes restaurá-las depois, na Lixeira.`)) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/tasks/${id}`)));
    const failedIds = ids.filter((_, i) => results[i].status === "rejected");
    toast[failedIds.length ? "warning" : "success"](
      failedIds.length ? `${ids.length - failedIds.length} movida(s), ${failedIds.length} falhou(aram)` : `${ids.length} tarefa(s) movida(s) para a lixeira`
    );
    setSelected(new Set(failedIds));
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

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="kicker">Coisas por fazer</p>
          <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">Tarefas</h1>
          <p className="text-sm text-muted-foreground">Por secção: construção, bricolagem, decoração e jardim.</p>
        </div>
        <div className="flex items-center gap-3">
          {tasks.length > 0 ? (
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="leading-tight">
                <p className="font-mono text-lg font-bold tabular-nums text-foreground">{allDone}<span className="text-muted-foreground">/{tasks.length}</span></p>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">concluídas</p>
              </div>
              <div className="w-24 sm:w-32">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-foreground"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right font-mono text-[10px] font-bold tabular-nums text-muted-foreground">{pct}%</p>
              </div>
            </div>
          ) : null}
          <Button data-testid="add-task-btn" onClick={openNew} className="hidden rounded-xl shadow-lg shadow-slate-400/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:inline-flex">
            <Plus className="mr-2 h-4 w-4" /> Nova tarefa
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
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${view === v.key ? "bg-foreground text-background shadow-md shadow-slate-400/40" : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:border-input hover:shadow-md"}`}
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
          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${category === "todos" ? "bg-foreground text-background shadow-md shadow-slate-400/40" : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md"}`}
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
        <div className="card-elevated mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <span className="text-xs font-bold text-foreground">
            <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-red-600 px-1 font-mono text-[11px] font-black text-white">{selected.size}</span>
            selecionada{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button data-testid="task-bulk-complete" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkComplete} className="h-8 rounded-lg border-border bg-muted px-2.5 text-xs text-foreground hover:bg-muted hover:text-foreground">
              Concluir
            </Button>
            <Button data-testid="task-bulk-trash" size="sm" variant="outline" disabled={bulkBusy} onClick={bulkTrash} className="h-8 rounded-lg border-red-200 bg-[var(--pastel-red-bg)] px-2.5 text-xs text-[color:var(--pastel-red-text)] hover:bg-[var(--pastel-red-bg)]">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Mover para a lixeira
            </Button>
            <Button data-testid="task-bulk-clear" size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              Limpar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {pending.map((t) => (
          <Row
            key={t.id} t={t}
            selected={selected.has(t.id)} onToggleSelect={() => toggleSelect(t.id)}
            onToggle={() => toggle(t)} toggling={togglingIds.has(t.id)}
            onOpen={() => openEdit(t)}
            onDelete={() => remove(t.id)} deleting={deletingIds.has(t.id)}
            groupName={t.group_id ? groupsById[t.group_id] : null}
          />
        ))}
      </div>

      {done.length > 0 ? (
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Concluídas ({done.length})</p>
          <div className="space-y-2">
            {done.map((t) => (
              <Row
                key={t.id} t={t}
                selected={selected.has(t.id)} onToggleSelect={() => toggleSelect(t.id)}
                onToggle={() => toggle(t)} toggling={togglingIds.has(t.id)}
                onOpen={() => openEdit(t)}
                onDelete={() => remove(t.id)} deleting={deletingIds.has(t.id)}
                groupName={t.group_id ? groupsById[t.group_id] : null}
              />
            ))}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-float-slow rounded-3xl bg-muted/60 blur-xl" />
              <div className="card-elevated relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 text-red-600">
                <ListChecks className="h-7 w-7" />
              </div>
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-foreground">Nada por fazer aqui</EmptyTitle>
            <EmptyDescription className="text-muted-foreground">Cria a primeira tarefa — fica organizada por secção e prioridade.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {createPortal(
        <button
          data-testid="fab-new-task"
          onClick={() => {
            haptics.tap();
            openNew();
          }}
          aria-label="Nova tarefa"
          title="Nova tarefa"
          className="group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 select-none touch-manipulation items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-black text-white shadow-[0_16px_35px_-8px_rgba(15,23,42,0.55)] ring-1 ring-black/10 transition-all duration-150 will-change-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/50 active:scale-90 active:duration-75 sm:hidden"
        >
          <Plus className="h-7 w-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
        </button>,
        document.body,
      )}

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editingTask} onSaved={() => { load(); loadGroups(); }} />
    </div>
  );
}
