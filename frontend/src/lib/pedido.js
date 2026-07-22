// bg/text usam variáveis CSS (index.css, :root + [data-theme="dark"]) em
// vez de hex fixo — os badges de estado/prioridade, usados em toda a app
// via inline style, trocam de tom sozinhos ao mudar de tema. O "dot"
// (pequeno indicador circular) mantém a cor viva: já lê bem em ambos os temas.
export const STATUS_CONFIG = {
  novo: { label: "Novo", bg: "var(--badge-novo-bg)", text: "var(--badge-novo-text)", dot: "#84CC16" },
  pendente: { label: "Pendente", bg: "var(--badge-pendente-bg)", text: "var(--badge-pendente-text)", dot: "#D97706" },
  em_preparacao: { label: "Em preparação", bg: "var(--badge-em_preparacao-bg)", text: "var(--badge-em_preparacao-text)", dot: "#6366F1" },
  enviado_fornecedor: { label: "Enviado ao fornecedor", bg: "var(--badge-enviado_fornecedor-bg)", text: "var(--badge-enviado_fornecedor-text)", dot: "#2563EB" },
  aguarda_fornecedor: { label: "Espera fornecedor", bg: "var(--badge-aguarda_fornecedor-bg)", text: "var(--badge-aguarda_fornecedor-text)", dot: "#06B6D4" },
  orcamento_recebido: { label: "Orçamento recebido", bg: "var(--badge-orcamento_recebido-bg)", text: "var(--badge-orcamento_recebido-text)", dot: "#8B5CF6" },
  aguarda_cliente: { label: "Espera cliente", bg: "var(--badge-aguarda_cliente-bg)", text: "var(--badge-aguarda_cliente-text)", dot: "#EA580C" },
  aprovado: { label: "Aprovado", bg: "var(--badge-aprovado-bg)", text: "var(--badge-aprovado-text)", dot: "#22C55E" },
  rejeitado: { label: "Rejeitado", bg: "var(--badge-rejeitado-bg)", text: "var(--badge-rejeitado-text)", dot: "#F43F5E" },
  encomendado: { label: "Encomendado", bg: "var(--badge-encomendado-bg)", text: "var(--badge-encomendado-text)", dot: "#14B8A6" },
  concluido: { label: "Concluído", bg: "var(--badge-concluido-bg)", text: "var(--badge-concluido-text)", dot: "#16A34A" },
  cancelado: { label: "Cancelado", bg: "var(--badge-cancelado-bg)", text: "var(--badge-cancelado-text)", dot: "#EC4899" },
};
export const STATUS_ORDER = Object.keys(STATUS_CONFIG);
export const getStatusCfg = (k) => STATUS_CONFIG[k] || STATUS_CONFIG.novo;

export const PRIORITY_CONFIG = {
  urgente: { label: "Urgente", bg: "var(--badge-urgente-bg)", text: "var(--badge-urgente-text)", dot: "#DC2626" },
  alta: { label: "Alta", bg: "var(--badge-alta-bg)", text: "var(--badge-alta-text)", dot: "#EA580C" },
  media: { label: "Média", bg: "var(--badge-media-bg)", text: "var(--badge-media-text)", dot: "#EAB308" },
  baixa: { label: "Baixa", bg: "var(--badge-baixa-bg)", text: "var(--badge-baixa-text)", dot: "#22C55E" },
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
