import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Pie, PieChart, Cell } from "recharts";
import {
  Plus, Trash2, ListChecks, CalendarDays, Repeat, FolderTree, Search, Pin, PinOff,
  Copy, Archive, MoreVertical, ChevronDown, Clock3, Lock, Sunrise, User,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CategoryBadge } from "@/components/CategoryBadge";
import TaskDialog from "@/components/TaskDialog";
import DailyOperationsView from "@/components/tasks/DailyOperationsView";
import { haptics } from "@/lib/haptics";
import { toast } from "sonner";
import {
  getTaskPriority, isOverdue, isToday, isNext7Days, formatDue, subtaskProgress,
  taskListSort, getTaskStatus, TASK_STATUS_LABELS, TASK_STATUS_DOT, TASK_PRIORITIES,
} from "@/lib/taskMeta";
import { getActiveCollaborator, setActiveCollaborator } from "@/lib/activeCollaborator";

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

function hoursSince(iso) {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 3600000);
}

const IN_PROGRESS_WARNING_HOURS = 4;

// Deslizar por toque — direita conclui de imediato, esquerda revela uma
// fila de 3 ações (Apagar/Arquivar/Adiar). Sem biblioteca: só mede o
// deslocamento horizontal do dedo. Em desktop (sem toque) isto nunca
// dispara, por isso coexiste sem conflito com o arrastar para prioridade
// (draggable/onDragStart, no Row).
function SwipeRow({ children, onComplete, actions }) {
  const [dragX, setDragX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startXRef = useRef(null);
  const draggingRef = useRef(false);
  const trayWidth = actions.length * 56;

  const handleTouchStart = (e) => {
    startXRef.current = e.touches[0].clientX;
    draggingRef.current = true;
  };
  const handleTouchMove = (e) => {
    if (!draggingRef.current || startXRef.current == null) return;
    const delta = e.touches[0].clientX - startXRef.current;
    const base = revealed ? -trayWidth : 0;
    setDragX(Math.max(-trayWidth - 20, Math.min(base + delta, 110)));
  };
  const handleTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX > 70) {
      setDragX(0);
      setRevealed(false);
      haptics.success();
      onComplete?.();
      return;
    }
    if (dragX < -trayWidth / 2) {
      setDragX(-trayWidth);
      setRevealed(true);
    } else {
      setDragX(0);
      setRevealed(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {actions.map((a) => (
          <button
            key={a.key}
            data-testid={a.testid}
            onClick={() => { a.onClick(); setDragX(0); setRevealed(false); }}
            style={{ width: 56 }}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-white ${a.className || "bg-slate-500"}`}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
          </button>
        ))}
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${dragX}px)`, transition: draggingRef.current ? "none" : "transform 180ms ease" }}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  );
}

// Definido fora de Tasks(): declará-lo lá dentro fazia o React ver um "novo"
// componente a cada render do pai (ex.: só por marcar uma checkbox), o que
// desmontava e remontava TODAS as linhas da lista de cada vez — perdia
// transições, scroll de foco e era um custo de DOM desnecessário.
function Row({
  t, selected, onToggleSelect, onToggle, onOpen, onDelete, deleting, toggling, groupName,
  assigneeName, blockedBy, onTogglePin, onDuplicate, onArchive, onSnooze,
  onDragStart, onDragOver, onDrop, dragOver,
}) {
  const c = getCategory(t.category);
  const p = getTaskPriority(t.priority);
  const status = getTaskStatus(t);
  const overdue = isOverdue(t.due_date, t.done);
  const progress = subtaskProgress(t);
  const inProgressHours = status === "in_progress" ? hoursSince(t.status_changed_at) : 0;
  const blocked = blockedBy && blockedBy.length > 0 && blockedBy.some((b) => !b.done);

  const cardBody = (
    <div
      data-testid={`task-row-${t.id}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group flex items-center gap-2.5 rounded-xl border-l-4 border bg-card py-2.5 pl-2.5 pr-3 card-elevated transition-all duration-150 hover:border-input card-elevated-hover ${selected ? "border-foreground ring-2 ring-foreground/10" : "border-border"} ${dragOver ? "ring-2 ring-foreground/40" : ""}`}
      style={{ borderLeftColor: p.color }}
    >
      <Checkbox
        data-testid={`task-select-${t.id}`}
        checked={selected}
        onCheckedChange={onToggleSelect}
        className="h-3.5 w-3.5 shrink-0 rounded-md"
      />
      <Checkbox
        data-testid={`task-toggle-${t.id}`}
        checked={t.done}
        disabled={toggling}
        onCheckedChange={onToggle}
        className="h-4.5 w-4.5 shrink-0 rounded-md transition-transform duration-150 hover:scale-110 active:scale-90"
      />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TASK_STATUS_DOT[status]}`} title={TASK_STATUS_LABELS[status]} />
          <p className={`truncate text-sm font-semibold text-foreground ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
          {t.pinned ? <Pin className="h-3 w-3 shrink-0 text-foreground" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={t.category} />
          {groupName ? (
            <span className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              <FolderTree className="h-3 w-3" /> {groupName}
            </span>
          ) : null}
          {blocked ? (
            <span
              title={`Bloqueada por: ${blockedBy.filter((b) => !b.done).map((b) => b.title).join(", ")}`}
              className="flex items-center gap-1 rounded-full bg-[var(--pastel-red-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-red-text)]"
            >
              <Lock className="h-3 w-3" /> Bloqueada ({blockedBy.filter((b) => b.done).length}/{blockedBy.length})
            </span>
          ) : null}
          {inProgressHours >= IN_PROGRESS_WARNING_HOURS ? (
            <span className="flex items-center gap-1 rounded-full bg-[var(--pastel-amber-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-amber-text)]">
              <Clock3 className="h-3 w-3" /> Em execução há {inProgressHours}h
            </span>
          ) : null}
          {(t.labels || []).slice(0, 3).map((l) => (
            <span key={l} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{l}</span>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" /> {assigneeName || "Sem colaborador"}
          </span>
          {t.due_date ? (
            <span className={`flex items-center gap-1 ${overdue ? "text-red-600" : ""}`}>
              · <CalendarDays className="h-3 w-3" /> {formatDue(t.due_date)}{t.due_time ? ` ${t.due_time}` : ""}
              {t.repeat && t.repeat !== "none" ? <Repeat className="h-3 w-3" /> : null}
            </span>
          ) : null}
          {progress ? <span>· {progress.done}/{progress.total} subtarefas</span> : null}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid={`task-menu-${t.id}`} className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onTogglePin}>
            {t.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
            {t.pinned ? "Desafixar" : "Fixar"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSnooze}>
            <CalendarDays className="mr-2 h-3.5 w-3.5" /> Adiar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="mr-2 h-3.5 w-3.5" /> Arquivar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} disabled={deleting} className="text-red-600 focus:text-red-600">
            {deleting ? <Spinner className="mr-2 h-3.5 w-3.5" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />} Apagar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <SwipeRow
      onComplete={onToggle}
      actions={[
        { key: "delete", label: "Apagar", icon: Trash2, className: "bg-red-600", onClick: onDelete, testid: `swipe-delete-${t.id}` },
        { key: "archive", label: "Arquivar", icon: Archive, className: "bg-violet-600", onClick: onArchive, testid: `swipe-archive-${t.id}` },
        { key: "snooze", label: "Adiar", icon: CalendarDays, className: "bg-amber-600", onClick: onSnooze, testid: `swipe-snooze-${t.id}` },
      ]}
    >
      {cardBody}
    </SwipeRow>
  );
}

// Donut + barra horizontal de progresso do dia — "concluídas hoje" contra
// o que ainda está por fazer/em execução (as arquivadas já saíram da
// contagem em stats). Recolhível para não ocupar espaço permanente numa
// página já densa.
function TaskDashboard({ stats, collaboratorsById }) {
  const [open, setOpen] = useState(false);
  if (!stats) return null;
  const doneToday = stats.done_today || 0;
  const remaining = (stats.pending || 0) + (stats.in_progress || 0);
  const totalToday = doneToday + remaining;
  const pct = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;
  const pieData = [
    { key: "done", label: "Concluídas hoje", count: doneToday, fill: "#10B981" },
    { key: "remaining", label: "Ainda por fazer", count: remaining, fill: "#CBD5E1" },
  ];
  const pieConfig = { done: { label: "Concluídas hoje", color: "#10B981" }, remaining: { label: "Ainda por fazer", color: "#CBD5E1" } };
  const byCategory = Object.entries(stats.by_category || {});
  const byAssignee = Object.entries(stats.by_assignee || {});

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card">
      <button
        type="button"
        data-testid="task-dashboard-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <div>
          <p className="font-heading text-sm font-extrabold text-foreground">
            Hoje tens {stats.total} tarefa{stats.total === 1 ? "" : "s"}. {doneToday} concluída{doneToday === 1 ? "" : "s"}, {stats.in_progress || 0} em execução e {stats.pending || 0} por fazer.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Dashboard de tarefas</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border/70 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Total" value={stats.total} />
            <StatTile label="Pendentes" value={stats.pending} />
            <StatTile label="Em execução" value={stats.in_progress} />
            <StatTile label="Atrasadas" value={stats.overdue} tone={stats.overdue > 0 ? "text-red-600" : undefined} />
          </div>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
            <ChartContainer config={pieConfig} className="aspect-square max-h-[140px] shrink-0">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="key" hideLabel />} />
                <Pie data={pieData} dataKey="count" nameKey="key" innerRadius="55%" outerRadius="90%" strokeWidth={2} stroke="var(--card)">
                  {pieData.map((entry) => <Cell key={entry.key} fill={entry.fill} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full flex-1">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span>Progresso do dia</span>
                <span className="font-mono tabular-nums text-foreground">{pct}%</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-foreground"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Por secção</p>
              <div className="mt-1.5 space-y-1">
                {byCategory.map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{getCategory(key).label}</span>
                    <span className="font-mono font-bold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Por colaborador</p>
              <div className="mt-1.5 space-y-1">
                {byAssignee.map(([id, count]) => (
                  <div key={id || "sem"} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{id ? (collaboratorsById[id] || "Colaborador removido") : "Sem colaborador"}</span>
                    <span className="font-mono font-bold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
      <p className={`font-mono text-lg font-black tabular-nums ${tone || "text-foreground"}`}>{value ?? "–"}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("todas");
  const [category, setCategory] = useState("todos");
  const [assigneeFilter, setAssigneeFilter] = useState("todos");
  const [priorityFilter, setPriorityFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState(null);
  const [dayView, setDayView] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const [snoozeTask, setSnoozeTask] = useState(null);
  const [snoozeDate, setSnoozeDate] = useState("");
  const [activeCollaborator, setActiveCollaboratorState] = useState(() => getActiveCollaborator());
  const dragTaskIdRef = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);
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
  const loadCollaborators = useCallback(() => {
    api.get("/collaborators").then(({ data }) => setCollaborators(data)).catch(() => {});
  }, []);
  const loadTemplates = useCallback(() => {
    api.get("/task-templates").then(({ data }) => setTemplates(data)).catch(() => {});
  }, []);
  const loadStats = useCallback(() => {
    api.get("/tasks/stats").then(({ data }) => setStats(data)).catch(() => {});
  }, []);
  useEffect(() => { load(); loadGroups(); loadCollaborators(); loadTemplates(); loadStats(); }, [load, loadGroups, loadCollaborators, loadTemplates, loadStats]);

  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g.name])), [groups]);
  const collaboratorsById = useMemo(() => Object.fromEntries(collaborators.map((c) => [c.id, c.name])), [collaborators]);
  const tasksById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const pinnedTemplates = useMemo(() => templates.filter((t) => t.pinned), [templates]);

  const reload = useCallback(() => { load(); loadStats(); }, [load, loadStats]);

  const toggle = async (t) => {
    // Um duplo clique/toque rápido no mesmo checkbox não pode disparar dois
    // PATCH /toggle concorrentes — numa tarefa recorrente, cada toggle para
    // "concluída" cria a próxima ocorrência, e dois em corrida criava-a a dobrar.
    if (togglingIds.has(t.id)) return;
    setTogglingIds((prev) => new Set(prev).add(t.id));
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api.patch(`/tasks/${t.id}/toggle`);
      await reload(); // recarrega para apanhar a próxima ocorrência de tarefas recorrentes
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
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao mover para a lixeira"));
    } finally {
      setDeletingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const togglePin = async (t) => {
    haptics.tap();
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x)));
    try {
      await api.put(`/tasks/${t.id}`, { pinned: !t.pinned });
    } catch (e) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, pinned: t.pinned } : x)));
      toast.error(getErrorMessage(e, "Não foi possível fixar"));
    }
  };

  const duplicateTask = async (t) => {
    try {
      await api.post(`/tasks/${t.id}/duplicate`);
      toast.success("Tarefa duplicada");
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível duplicar"));
    }
  };

  const archiveTask = async (t) => {
    if (!t.done) {
      toast.error("Só é possível arquivar tarefas concluídas.");
      return;
    }
    try {
      await api.patch(`/tasks/${t.id}/status`, { status: "archived" });
      toast.success("Tarefa arquivada");
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível arquivar"));
    }
  };

  const openSnooze = (t) => { setSnoozeTask(t); setSnoozeDate(t.due_date || ""); };
  const confirmSnooze = async () => {
    if (!snoozeTask || !snoozeDate) return;
    try {
      await api.put(`/tasks/${snoozeTask.id}`, { due_date: snoozeDate });
      toast.success("Tarefa adiada");
      setSnoozeTask(null);
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível adiar"));
    }
  };

  const createFromTemplate = async (tpl) => {
    try {
      await api.post(`/task-templates/${tpl.id}/create-task`);
      toast.success(`Tarefa criada a partir de "${tpl.name}"`);
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar a tarefa"));
    }
  };

  const handleActiveCollaboratorChange = (id) => {
    const collaborator = collaborators.find((c) => c.id === id) || null;
    setActiveCollaborator(collaborator);
    setActiveCollaboratorState(collaborator);
  };

  const openEdit = (t) => { setEditingTask(t); setDialogOpen(true); };
  const openNew = () => { setEditingTask(null); setDialogOpen(true); };

  // ---- Arrastar para alterar prioridade — direto na lista, sem modo à parte ----
  const handleDragStart = (id) => { dragTaskIdRef.current = id; };
  const handleDragOver = (id) => (e) => { e.preventDefault(); setDragOverId(id); };
  const handleDrop = (target) => async (e) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = dragTaskIdRef.current;
    dragTaskIdRef.current = null;
    if (!sourceId || sourceId === target.id || target.priority === undefined) return;
    if (tasksById[sourceId]?.priority === target.priority) return;
    setTasks((prev) => prev.map((x) => (x.id === sourceId ? { ...x, priority: target.priority } : x)));
    try {
      await api.put(`/tasks/${sourceId}`, { priority: target.priority });
    } catch (e2) {
      toast.error(getErrorMessage(e2, "Não foi possível alterar a prioridade"));
      load();
    }
  };

  // ---- Seleção em grupo — ações sobre várias tarefas de uma vez ----
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
    const ids = tasks.filter((t) => selected.has(t.id) && !t.done).map((t) => t.id);
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/tasks/${id}/toggle`)));
    const failedIds = ids.filter((_, i) => results[i].status === "rejected");
    toast[failedIds.length ? "warning" : "success"](
      failedIds.length ? `${ids.length - failedIds.length} concluída(s), ${failedIds.length} falhou(aram)` : `${ids.length} tarefa(s) concluída(s)`
    );
    setSelected(new Set(failedIds));
    reload();
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
    reload();
    setBulkBusy(false);
  };
  const bulkPatch = async (patch, successMsg) => {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      const { data } = await api.put("/tasks/bulk", { ids, patch });
      toast.success(successMsg || `${data.modified} tarefa(s) alterada(s)`);
      clearSelection();
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível alterar"));
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkStatus = async (status) => {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      const { data } = await api.post("/tasks/bulk/status", { ids, status });
      toast.success(`${data.modified} tarefa(s) alterada(s) para "${TASK_STATUS_LABELS[status]}"`);
      clearSelection();
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível alterar o estado"));
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkLabel = async (action) => {
    const label = window.prompt(action === "add" ? "Nome da etiqueta a adicionar:" : "Nome da etiqueta a remover:");
    if (!label || !label.trim()) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      const { data } = await api.post("/tasks/bulk/labels", { ids, label: label.trim(), action });
      toast.success(`Etiqueta atualizada em ${data.modified} tarefa(s)`);
      clearSelection();
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível alterar as etiquetas"));
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = useMemo(() => tasks
    .filter((t) => category === "todos" || t.category === category)
    .filter((t) => matchesView(t, view))
    .filter((t) => assigneeFilter === "todos" || (t.assignee_id || "") === assigneeFilter)
    .filter((t) => priorityFilter === "todas" || t.priority === priorityFilter)
    .filter((t) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const assigneeName = (collaboratorsById[t.assignee_id] || "").toLowerCase();
      return (
        (t.title || "").toLowerCase().includes(q)
        || (t.notes || "").toLowerCase().includes(q)
        || (t.labels || []).some((l) => l.toLowerCase().includes(q))
        || assigneeName.includes(q)
      );
    }),
  [tasks, category, view, assigneeFilter, priorityFilter, search, collaboratorsById]);

  const pending = filtered.filter((t) => !t.done).sort(taskListSort);
  const done = filtered.filter((t) => t.done);
  const allDone = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((allDone / tasks.length) * 100) : 0;

  const renderRow = (t) => (
    <Row
      key={t.id} t={t}
      selected={selected.has(t.id)} onToggleSelect={() => toggleSelect(t.id)}
      onToggle={() => toggle(t)} toggling={togglingIds.has(t.id)}
      onOpen={() => openEdit(t)}
      onDelete={() => remove(t.id)} deleting={deletingIds.has(t.id)}
      groupName={t.group_id ? groupsById[t.group_id] : null}
      assigneeName={t.assignee_id ? (collaboratorsById[t.assignee_id] || "Colaborador removido") : ""}
      blockedBy={(t.depends_on || []).map((id) => tasksById[id]).filter(Boolean)}
      onTogglePin={() => togglePin(t)}
      onDuplicate={() => duplicateTask(t)}
      onArchive={() => archiveTask(t)}
      onSnooze={() => openSnooze(t)}
      onDragStart={() => handleDragStart(t.id)}
      onDragOver={handleDragOver(t.id)}
      onDrop={handleDrop(t)}
      dragOver={dragOverId === t.id}
    />
  );

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
          <Button
            data-testid="task-day-view-btn"
            variant="outline"
            onClick={() => setDayView((v) => !v)}
            className={`hidden rounded-xl sm:inline-flex ${dayView ? "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background" : ""}`}
          >
            <Sunrise className="mr-2 h-4 w-4" /> Operação do Dia
          </Button>
          <Button data-testid="add-task-btn" onClick={openNew} className="hidden rounded-xl shadow-lg shadow-slate-400/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:inline-flex">
            <Plus className="mr-2 h-4 w-4" /> Nova tarefa
          </Button>
        </div>
      </div>

      {stats && (stats.overdue > 0 || stats.pending > 0 || stats.done_today > 0) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold">
          {stats.overdue > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-[var(--pastel-red-bg)] px-2.5 py-1 text-[color:var(--pastel-red-text)]">{stats.overdue} atrasada{stats.overdue === 1 ? "" : "s"}</span>
          ) : null}
          <span className="flex items-center gap-1 rounded-full bg-[var(--pastel-amber-bg)] px-2.5 py-1 text-[color:var(--pastel-amber-text)]">{filtered.filter((t) => isToday(t.due_date)).length} para hoje</span>
          <span className="flex items-center gap-1 rounded-full bg-[var(--pastel-emerald-bg)] px-2.5 py-1 text-[color:var(--pastel-emerald-text)]">{stats.done_today || 0} concluída{stats.done_today === 1 ? "" : "s"} hoje</span>
        </div>
      ) : null}

      {dayView ? (
        <DailyOperationsView tasks={tasks} stats={stats} togglingIds={togglingIds} onToggle={toggle} onOpen={openEdit} />
      ) : (
        <>
          <TaskDashboard stats={stats} collaboratorsById={collaboratorsById} />

          {pinnedTemplates.length > 0 ? (
            <div className="no-scrollbar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {pinnedTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  data-testid={`pinned-template-${tpl.id}`}
                  onClick={() => createFromTemplate(tpl)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                >
                  <Pin className="h-3 w-3" /> {tpl.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="task-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por título, notas, etiqueta ou colaborador…"
                className="h-9 pl-8"
              />
            </div>
            <NativeSelect size="sm" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="w-auto">
              <NativeSelectOption value="todos">Todos os colaboradores</NativeSelectOption>
              <NativeSelectOption value="">Sem colaborador</NativeSelectOption>
              {collaborators.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect size="sm" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-auto">
              <NativeSelectOption value="todas">Todas as prioridades</NativeSelectOption>
              {Object.entries(TASK_PRIORITIES).map(([key, v]) => <NativeSelectOption key={key} value={key}>{v.label}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect
              size="sm"
              value={activeCollaborator?.id || ""}
              onChange={(e) => handleActiveCollaboratorChange(e.target.value)}
              className="w-auto"
              title="Quem está a usar este aparelho — usado no histórico das tarefas"
            >
              <NativeSelectOption value="">Quem és? (opcional)</NativeSelectOption>
              {collaborators.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
            </NativeSelect>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="task-bulk-change" size="sm" variant="outline" disabled={bulkBusy} className="h-8 rounded-lg border-border bg-muted px-2.5 text-xs text-foreground hover:bg-muted hover:text-foreground">
                      Alterar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Secção</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {CATEGORY_LIST.map((c) => (
                          <DropdownMenuItem key={c.key} onClick={() => bulkPatch({ category: c.key })}>{c.label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Prioridade</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(TASK_PRIORITIES).map(([key, v]) => (
                          <DropdownMenuItem key={key} onClick={() => bulkPatch({ priority: key })}>{v.label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Colaborador</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => bulkPatch({ assignee_id: "" })}>Sem colaborador</DropdownMenuItem>
                        {collaborators.map((c) => (
                          <DropdownMenuItem key={c.id} onClick={() => bulkPatch({ assignee_id: c.id })}>{c.name}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Estado</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                          <DropdownMenuItem key={key} onClick={() => bulkStatus(key)}>{label}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => bulkLabel("add")}>Adicionar etiqueta…</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => bulkLabel("remove")}>Remover etiqueta…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            {pending.map(renderRow)}
          </div>

          {done.length > 0 ? (
            <div className="mt-8">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Concluídas ({done.length})</p>
              <div className="space-y-2">
                {done.map(renderRow)}
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
        </>
      )}

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

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        allTasks={tasks}
        collaborators={collaborators}
        onSaved={() => { reload(); loadGroups(); loadTemplates(); }}
      />

      <Dialog open={!!snoozeTask} onOpenChange={(v) => { if (!v) setSnoozeTask(null); }}>
        <DialogContent data-testid="snooze-dialog" className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold tracking-tight">Adiar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="date" data-testid="snooze-date-input" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} />
            <Button data-testid="snooze-confirm-btn" onClick={confirmSnooze} disabled={!snoozeDate} className="w-full rounded-xl">
              Adiar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
