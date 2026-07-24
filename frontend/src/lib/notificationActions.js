import { Eye, Bookmark, BookmarkCheck, Clock, CheckCircle2, Pin, PinOff, Archive, ListChecks } from "lucide-react";
import api from "@/lib/api";

// Vocabulário fechado de ações — o mesmo conjunto usado pelo backend
// (server.py: ACTION_LABELS/next_best_action) para aprendizagem (§25), para
// as duas pontas nunca divergirem.
export const ACTION_ICONS = {
  open: Eye,
  track: Bookmark,
  untrack: BookmarkCheck,
  snooze: Clock,
  resolve: CheckCircle2,
  pin: Pin,
  unpin: PinOff,
  archive: Archive,
  complete_task: ListChecks,
};

export const ACTION_LABELS = {
  open: "Abrir",
  track: "Acompanhar",
  untrack: "Deixar de acompanhar",
  snooze: "Adiar",
  resolve: "Marcar resolvida",
  pin: "Fixar",
  unpin: "Desafixar",
  archive: "Arquivar",
  complete_task: "Concluir tarefa",
};

// Ações secundárias por notificação (§7) — condicionadas à presença de
// task_id e ao estado atual, em vez de uma tabela fixa por categoria: fica
// correto automaticamente para categorias novas, sem precisar de manter
// duas listas em sincronia (backend tem 22 categorias; aqui só 9 ações).
export function getSecondaryActions(n) {
  const actions = [];
  actions.push(n.status === "tracking" ? "untrack" : "track");
  if (n.status !== "snoozed") actions.push("snooze");
  if (n.task_id) actions.push("complete_task");
  if (n.status !== "resolved") actions.push("resolve");
  actions.push(n.pinned ? "unpin" : "pin");
  if (n.status !== "archived") actions.push("archive");
  return actions;
}

export async function runNotificationAction(n, key, extra = {}) {
  switch (key) {
    case "open":
      return api.post(`/notifications/${n.id}/read`);
    case "track":
      return api.post(`/notifications/${n.id}/track`);
    case "untrack":
      return api.post(`/notifications/${n.id}/untrack`);
    case "snooze":
      return api.post(`/notifications/${n.id}/snooze`, { until: extra.until });
    case "resolve":
      return api.post(`/notifications/${n.id}/resolve`);
    case "pin":
      return api.post(`/notifications/${n.id}/pin`, { pinned: true });
    case "unpin":
      return api.post(`/notifications/${n.id}/pin`, { pinned: false });
    case "archive":
      return api.post(`/notifications/${n.id}/archive`);
    case "complete_task":
      return api.patch(`/tasks/${n.task_id}/status`, { status: "done" });
    default:
      return null;
  }
}

// Predefinições rápidas de snooze (§17) — cada uma devolve uma Date; o
// chamador converte para ISO antes de enviar ao backend.
export const SNOOZE_PRESETS = [
  { key: "1h", label: "Daqui a 1h", getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    key: "tonight", label: "Hoje à noite", getDate: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    key: "tomorrow", label: "Amanhã de manhã", getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    key: "nextweek", label: "Próxima semana", getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];
