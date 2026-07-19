import { Hammer, Wrench, Sofa, Flower2 } from "lucide-react";

export const CATEGORIES = {
  construcao: {
    key: "construcao",
    label: "Construção",
    icon: Hammer,
    bg: "#FFEDD5",
    text: "#C2410C",
    border: "#FDBA74",
    accent: "#EA580C",
  },
  bricolage: {
    key: "bricolage",
    label: "Bricolagem",
    icon: Wrench,
    bg: "#DBEAFE",
    text: "#1D4ED8",
    border: "#BFDBFE",
    accent: "#2563EB",
  },
  decoracao: {
    key: "decoracao",
    label: "Decoração",
    icon: Sofa,
    bg: "#F3E8FF",
    text: "#7E22CE",
    border: "#E9D5FF",
    accent: "#9333EA",
  },
  jardim: {
    key: "jardim",
    label: "Jardim",
    icon: Flower2,
    bg: "#DCFCE7",
    text: "#15803D",
    border: "#BBF7D0",
    accent: "#16A34A",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export const STATUS = {
  aberto: { label: "Aberto", color: "#0369A1", bg: "#E0F2FE" },
  preco_pedido: { label: "Preço pedido", color: "#B45309", bg: "#FEF3C7" },
  preco_recebido: { label: "Preço recebido", color: "#1D4ED8", bg: "#DBEAFE" },
  concluido: { label: "Concluído", color: "#15803D", bg: "#DCFCE7" },
};

export const getCategory = (key) => CATEGORIES[key] || CATEGORIES.construcao;
export const getStatus = (key) => STATUS[key] || STATUS.aberto;
