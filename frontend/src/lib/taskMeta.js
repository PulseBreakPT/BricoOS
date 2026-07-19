import { Flag } from "lucide-react";

// Prioridade de tarefas ao estilo TickTick: 4 níveis (nenhuma/baixa/média/alta).
export const TASK_PRIORITIES = {
  nenhuma: { label: "Nenhuma", color: "#A3A3A3", bg: "#FAFAFA" },
  baixa: { label: "Baixa", color: "#525252", bg: "#F5F5F5" },
  media: { label: "Média", color: "#404040", bg: "#E5E5E5" },
  alta: { label: "Alta", color: "#FFFFFF", bg: "#DC2626" },
};
export const TASK_PRIORITY_ORDER = ["alta", "media", "baixa", "nenhuma"];
export const getTaskPriority = (key) => TASK_PRIORITIES[key] || TASK_PRIORITIES.nenhuma;
export const TaskPriorityFlag = Flag;

export const TASK_REPEATS = {
  none: "Não repete",
  daily: "Diariamente",
  weekly: "Semanalmente",
  monthly: "Mensalmente",
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

export function subtaskProgress(task) {
  const subtasks = task.subtasks || [];
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total: subtasks.length };
}
