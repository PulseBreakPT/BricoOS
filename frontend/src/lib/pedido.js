// Preto/branco/vermelho, com lógica de progressão: o cinzento escurece à
// medida que o pedido avança, o vermelho assinala sempre "é a sua vez de
// agir" ou um desfecho negativo, e o preto sólido marca os estados finais
// positivos.
export const STATUS_CONFIG = {
  novo: { label: "Novo", bg: "#FAFAFA", text: "#737373", dot: "#A3A3A3" },
  pendente: { label: "Pendente", bg: "#F5F5F5", text: "#525252", dot: "#737373" },
  em_preparacao: { label: "Em preparação", bg: "#E5E5E5", text: "#404040", dot: "#525252" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "#D4D4D4", text: "#262626", dot: "#404040" },
  aguarda_fornecedor: { label: "Espera fornecedor", bg: "#A3A3A3", text: "#FFFFFF", dot: "#FFFFFF" },
  orcamento_recebido: { label: "Orçamento recebido", bg: "#FEE2E2", text: "#B91C1C", dot: "#DC2626" },
  aguarda_cliente: { label: "Espera cliente", bg: "#737373", text: "#FFFFFF", dot: "#FFFFFF" },
  aprovado: { label: "Aprovado", bg: "#262626", text: "#FFFFFF", dot: "#FFFFFF" },
  rejeitado: { label: "Rejeitado", bg: "#FCA5A5", text: "#7F1D1D", dot: "#DC2626" },
  encomendado: { label: "Encomendado", bg: "#171717", text: "#FFFFFF", dot: "#FFFFFF" },
  concluido: { label: "Concluído", bg: "#000000", text: "#FFFFFF", dot: "#FFFFFF" },
  cancelado: { label: "Cancelado", bg: "#7F1D1D", text: "#FFFFFF", dot: "#FCA5A5" },
};
export const STATUS_ORDER = Object.keys(STATUS_CONFIG);
export const getStatusCfg = (k) => STATUS_CONFIG[k] || STATUS_CONFIG.novo;

export const PRIORITY_CONFIG = {
  urgente: { label: "Urgente", bg: "#DC2626", text: "#FFFFFF", dot: "#FFFFFF" },
  alta: { label: "Alta", bg: "#FEE2E2", text: "#B91C1C", dot: "#DC2626" },
  media: { label: "Média", bg: "#E5E5E5", text: "#404040", dot: "#525252" },
  baixa: { label: "Baixa", bg: "#F5F5F5", text: "#737373", dot: "#A3A3A3" },
};
export const PRIORITY_ORDER = ["urgente", "alta", "media", "baixa"];
export const getPriorityCfg = (k) => PRIORITY_CONFIG[k] || PRIORITY_CONFIG.media;

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
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const GUIDED_ACTIONS = {
  em_preparacao: { mode: "compose_supplier_email", label: "Preparar email" },
  aguarda_fornecedor: { mode: "record_quote", label: "Registar resposta" },
  orcamento_recebido: { mode: "reply_to_client", label: "Responder ao cliente" },
  aguarda_cliente: { mode: "record_client_decision", label: "Registar decisão" },
};

export function getNextActionMode(note) {
  return note?.next_action_mode || GUIDED_ACTIONS[note?.status]?.mode || "status";
}

export function getNextActionCta(note) {
  return GUIDED_ACTIONS[note?.status]?.label || note?.next_status_label || "Abrir pedido";
}

export function formatHours(h) {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1).replace(".0", "")} h`;
  return `${(h / 24).toFixed(1).replace(".0", "")} dias`;
}

export function formatEuro(v) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

// ---- Fallbacks locais para quando o servidor não consegue gerar o modelo ----
export const TEMPLATE_OPTIONS = [
  { key: "geral", label: "Geral" },
  { key: "construcao", label: "Construção" },
  { key: "bricolage", label: "Bricolagem" },
  { key: "decoracao", label: "Decoração" },
  { key: "jardim", label: "Jardim" },
];

function greeting() {
  return new Date().getHours() < 13 ? "Bom dia" : "Boa tarde";
}

export function buildEmail(note) {
  const description = note.description || "artigo";
  const count = parseInt(String(note.quantity || "").match(/\d+/)?.[0] || "1", 10);
  const article = count > 1 ? "os seguintes artigos" : "o seguinte artigo";
  const subject = `Pedido de cotação — ${description}`;
  const lines = [`${greeting()} Exmos. Senhores,`, "",
    `Venho por este meio solicitar um pedido de cotação para ${article}:`, "",
    `Artigo: ${description}`];
  if (note.reference) lines.push(`Código EAN13: ${note.reference}`);
  if (note.measurements) lines.push(`Medidas: ${note.measurements}`);
  if (note.quantity) lines.push(`Quantidade: ${note.quantity}`);
  if (note.color) lines.push(`Cor / acabamento: ${note.color}`);
  if (note.details) lines.push(`Observações: ${note.details}`);
  lines.push("", "Com os melhores cumprimentos,");
  return { subject, body: lines.join("\n") };
}

export function buildReminder(note) {
  const subject = `Lembrete · Pedido de cotação — ${note.description || "artigo"}`;
  const lines = [`${greeting()} Exmos. Senhores,`, "",
    "Venho por este meio reforçar o pedido de cotação enviado anteriormente:", "",
    `Artigo: ${note.description || "-"}`];
  if (note.measurements) lines.push(`Medidas: ${note.measurements}`);
  if (note.quantity) lines.push(`Quantidade: ${note.quantity}`);
  lines.push("", "Com os melhores cumprimentos,");
  return { subject, body: lines.join("\n") };
}
