export const STATUS_CONFIG = {
  novo: { label: "Novo", bg: "#F1F5F9", text: "#475569", dot: "#64748B" },
  pendente: { label: "Pendente", bg: "#FEF3C7", text: "#B45309", dot: "#D97706" },
  em_preparacao: { label: "Em preparação", bg: "#E0E7FF", text: "#4338CA", dot: "#6366F1" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "#DBEAFE", text: "#1D4ED8", dot: "#2563EB" },
  aguarda_fornecedor: { label: "Espera fornecedor", bg: "#CFFAFE", text: "#0E7490", dot: "#06B6D4" },
  orcamento_recebido: { label: "Orçamento recebido", bg: "#EDE9FE", text: "#6D28D9", dot: "#8B5CF6" },
  aguarda_cliente: { label: "Espera cliente", bg: "#FFEDD5", text: "#C2410C", dot: "#EA580C" },
  aprovado: { label: "Aprovado", bg: "#DCFCE7", text: "#15803D", dot: "#22C55E" },
  rejeitado: { label: "Rejeitado", bg: "#FFE4E6", text: "#BE123C", dot: "#F43F5E" },
  encomendado: { label: "Encomendado", bg: "#CCFBF1", text: "#0F766E", dot: "#14B8A6" },
  concluido: { label: "Concluído", bg: "#D1FAE5", text: "#166534", dot: "#16A34A" },
  cancelado: { label: "Cancelado", bg: "#F4F4F5", text: "#52525B", dot: "#71717A" },
};

export const STATUS_ORDER = Object.keys(STATUS_CONFIG);
export const getStatusCfg = (k) => STATUS_CONFIG[k] || STATUS_CONFIG.novo;

export const PRIORITY_CONFIG = {
  urgente: { label: "Urgente", bg: "#FEE2E2", text: "#B91C1C", dot: "#DC2626" },
  alta: { label: "Alta", bg: "#FFEDD5", text: "#C2410C", dot: "#EA580C" },
  media: { label: "Média", bg: "#DBEAFE", text: "#1D4ED8", dot: "#3B82F6" },
  baixa: { label: "Baixa", bg: "#F1F5F9", text: "#64748B", dot: "#94A3B8" },
};
export const PRIORITY_ORDER = ["urgente", "alta", "media", "baixa"];
export const getPriorityCfg = (k) => PRIORITY_CONFIG[k] || PRIORITY_CONFIG.media;

export const ACTIVITY_ICON = {
  created: "sparkles", status_change: "arrow-right-left", priority_change: "flag",
  quote_added: "receipt", quote_removed: "trash-2", quote_approved: "badge-check",
  email_sent: "send", comment: "message-square", updated: "pencil", task_added: "bell",
};

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "agora mesmo";
  const m = s / 60;
  if (m < 60) return `há ${Math.floor(m)} min`;
  const h = m / 60;
  if (h < 24) return `há ${Math.floor(h)} h`;
  const days = h / 24;
  if (days < 30) return `há ${Math.floor(days)} d`;
  return d.toLocaleDateString("pt-PT");
}

export function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function formatHours(h) {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace(".0", "")} h`;
  return `${(h / 24).toFixed(1).replace(".0", "")} dias`;
}
