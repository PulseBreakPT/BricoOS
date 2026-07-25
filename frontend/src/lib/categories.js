import { Hammer, Wrench, Sofa, Flower2, Circle, Send, Inbox, CheckCircle2 } from "lucide-react";

// bg/text/border usam variáveis CSS (index.css, :root — tema claro único)
// — os badges de categoria/estado, usados um pouco por toda a app via
// inline style, trocam de tom sozinhos com o tema. O "accent" fica vivo em
// hex fixo: só é usado no estado "selecionado" (fundo sólido) e lê bem em
// ambos os temas.
export const CATEGORIES = {
  construcao: {
    key: "construcao",
    label: "Construção",
    icon: Hammer,
    bg: "var(--badge-construcao-bg)",
    text: "var(--badge-construcao-text)",
    border: "var(--badge-construcao-border)",
    accent: "#EA580C",
  },
  bricolage: {
    key: "bricolage",
    label: "Bricolagem",
    icon: Wrench,
    bg: "var(--badge-bricolage-bg)",
    text: "var(--badge-bricolage-text)",
    border: "var(--badge-bricolage-border)",
    accent: "#2563EB",
  },
  decoracao: {
    key: "decoracao",
    label: "Decoração",
    icon: Sofa,
    bg: "var(--badge-decoracao-bg)",
    text: "var(--badge-decoracao-text)",
    border: "var(--badge-decoracao-border)",
    accent: "#9333EA",
  },
  jardim: {
    key: "jardim",
    label: "Jardim",
    icon: Flower2,
    bg: "var(--badge-jardim-bg)",
    text: "var(--badge-jardim-text)",
    border: "var(--badge-jardim-border)",
    accent: "#16A34A",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export const STATUS = {
  aberto: { label: "Aberto", color: "var(--badge-aberto-text)", bg: "var(--badge-aberto-bg)", icon: Circle },
  preco_pedido: { label: "Preço pedido", color: "var(--badge-preco_pedido-text)", bg: "var(--badge-preco_pedido-bg)", icon: Send },
  preco_recebido: { label: "Preço recebido", color: "var(--badge-preco_recebido-text)", bg: "var(--badge-preco_recebido-bg)", icon: Inbox },
  concluido: { label: "Concluído", color: "var(--badge-concluido-text)", bg: "var(--badge-concluido-bg)", icon: CheckCircle2 },
};

export const getCategory = (key) => CATEGORIES[key] || CATEGORIES.construcao;
export const getStatus = (key) => STATUS[key] || STATUS.aberto;
