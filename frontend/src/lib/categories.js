import { Hammer, Wrench, Sofa, Flower2 } from "lucide-react";

// Matriz deliberada preto/branco/vermelho: cada categoria combina intensidade
// (clara/escura) com tom (neutro/vermelho) — quatro combinações distintas,
// sem sair da paleta da marca.
export const CATEGORIES = {
  construcao: {
    key: "construcao",
    label: "Construção",
    icon: Hammer,
    bg: "#F5F5F5",
    text: "#171717",
    border: "#D4D4D4",
    accent: "#171717",
  },
  bricolage: {
    key: "bricolage",
    label: "Bricolagem",
    icon: Wrench,
    bg: "#171717",
    text: "#FFFFFF",
    border: "#404040",
    accent: "#FFFFFF",
  },
  decoracao: {
    key: "decoracao",
    label: "Decoração",
    icon: Sofa,
    bg: "#FEE2E2",
    text: "#B91C1C",
    border: "#FECACA",
    accent: "#DC2626",
  },
  jardim: {
    key: "jardim",
    label: "Jardim",
    icon: Flower2,
    bg: "#7F1D1D",
    text: "#FFFFFF",
    border: "#991B1B",
    accent: "#FFFFFF",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

// Progressão lógica: cinzento intensifica-se enquanto o pedido aguarda,
// vermelho assinala que a bola está do nosso lado (preço recebido = agir
// agora), preto sólido marca o estado concluído.
export const STATUS = {
  aberto: { label: "Aberto", color: "#57534E", bg: "#F5F5F5" },
  preco_pedido: { label: "Preço pedido", color: "#404040", bg: "#E5E5E5" },
  preco_recebido: { label: "Preço recebido", color: "#B91C1C", bg: "#FEE2E2" },
  concluido: { label: "Concluído", color: "#FFFFFF", bg: "#171717" },
};

export const getCategory = (key) => CATEGORIES[key] || CATEGORIES.construcao;
export const getStatus = (key) => STATUS[key] || STATUS.aberto;
