import { Flag } from "lucide-react";

// Prioridade de tarefas ao estilo TickTick: 4 níveis (nenhuma/baixa/média/alta).
export const TASK_PRIORITIES = {
  nenhuma: { label: "Nenhuma", color: "#15803D", bg: "#DCFCE7" },
  baixa: { label: "Baixa", color: "#2563EB", bg: "#DBEAFE" },
  media: { label: "Média", color: "#D97706", bg: "#FEF3C7" },
  alta: { label: "Alta", color: "#DC2626", bg: "#FEE2E2" },
};
export const TASK_PRIORITY_ORDER = ["alta", "media", "baixa", "nenhuma"];
export const getTaskPriority = (key) => TASK_PRIORITIES[key] || TASK_PRIORITIES.nenhuma;
export const TaskPriorityFlag = Flag;

export const TASK_REPEATS = {
  none: "Não repete",
  daily: "Diariamente",
  weekly: "Semanalmente",
  monthly: "Mensalmente",
  yearly: "Anualmente",
};

// Ciclo de vida (server.py: TASK_STATUSES) — dimensão separada da
// prioridade. `done` continua sincronizado pelo servidor por
// compatibilidade; getTaskStatus() é a forma correta de ler o estado
// visível (cobre também tarefas antigas sem campo `status`).
export const TASK_STATUS_LABELS = {
  todo: "Por fazer", in_progress: "Em execução", done: "Concluída", archived: "Arquivada",
};
export const TASK_STATUS_DOT = {
  todo: "bg-slate-400", in_progress: "bg-blue-500", done: "bg-emerald-500", archived: "bg-violet-500",
};
export function getTaskStatus(task) {
  return task.status || (task.done ? "done" : "todo");
}

// Espelha server.py: _TASK_STATUS_TRANSITIONS — inclui sempre o próprio
// estado atual (primeira opção), para o select nunca ficar vazio; arquivada
// é terminal (sem reabrir por aqui).
export const TASK_STATUS_TRANSITIONS = {
  todo: ["todo", "in_progress", "done"],
  in_progress: ["in_progress", "todo", "done"],
  done: ["done", "todo", "archived"],
  archived: ["archived"],
};

function toLocalDate(dueDate) {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isOverdue(dueDate, done) {
  if (!dueDate || done) return false;
  const d = toLocalDate(dueDate);
  if (!d) return false;
  return startOfDay(d) < startOfDay(new Date());
}

export function isToday(dueDate) {
  const d = toLocalDate(dueDate);
  if (!d) return false;
  return startOfDay(d).getTime() === startOfDay(new Date()).getTime();
}

export function isNext7Days(dueDate) {
  const d = toLocalDate(dueDate);
  if (!d) return false;
  const today = startOfDay(new Date());
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const day = startOfDay(d);
  return day >= today && day <= in7;
}

export function formatDue(dueDate) {
  const d = toLocalDate(dueDate);
  if (!d) return "";
  if (isToday(dueDate)) return "Hoje";
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startOfDay(d).getTime() === tomorrow.getTime()) return "Amanhã";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

// Ordenação inteligente: atrasadas primeiro, depois por data (as com data antes das sem data), depois por prioridade.
export function smartTaskSort(a, b) {
  const aOverdue = isOverdue(a.due_date, a.done) ? 0 : 1;
  const bOverdue = isOverdue(b.due_date, b.done) ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;
  const aHasDate = a.due_date ? 0 : 1;
  const bHasDate = b.due_date ? 0 : 1;
  if (aHasDate !== bHasDate) return aHasDate - bHasDate;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  const aRank = TASK_PRIORITY_ORDER.indexOf(a.priority || "nenhuma");
  const bRank = TASK_PRIORITY_ORDER.indexOf(b.priority || "nenhuma");
  return aRank - bRank;
}

// Ordenação fixa pedida para a lista de tarefas: fixadas, depois em
// execução (se alguém já começou, está a ser tratada — antes até de uma
// atrasada), depois atrasadas, hoje, e por prioridade — smartTaskSort
// continua a desempatar dentro do mesmo nível.
export function taskListRank(task) {
  if (task.pinned) return 0;
  if (getTaskStatus(task) === "in_progress") return 1;
  if (isOverdue(task.due_date, task.done)) return 2;
  if (isToday(task.due_date)) return 3;
  if (task.priority === "alta") return 4;
  if (task.priority === "media") return 5;
  if (task.priority === "baixa") return 6;
  return 7;
}

export function taskListSort(a, b) {
  const ra = taskListRank(a);
  const rb = taskListRank(b);
  if (ra !== rb) return ra - rb;
  return smartTaskSort(a, b);
}

export function subtaskProgress(task) {
  const subtasks = task.subtasks || [];
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total: subtasks.length };
}
