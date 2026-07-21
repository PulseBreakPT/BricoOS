import { ClipboardList, Mail, Truck, ListChecks, BarChart3, BookOpenCheck, Calculator as CalculatorIcon, StickyNote, Timer, HeartPulse, FolderDown, FolderTree } from "lucide-react";
import Notes from "@/pages/Notes";
import Emails from "@/pages/Emails";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import Dashboard from "@/pages/Dashboard";
import Catalog from "@/pages/Catalog";
import Calculator from "@/components/miniapps/Calculator";
import Scratchpad from "@/components/miniapps/Scratchpad";
import Stopwatch from "@/components/miniapps/Stopwatch";
import HealthPanel from "@/components/HealthPanel";
import DownloadsCenter from "@/components/DownloadsCenter";
import Explorer from "@/components/workspace/Explorer";

// Registo único de "aplicações" que podem abrir como painel na Área de
// Trabalho — usado pelo lançador da barra lateral/taskbar, pelas janelas
// flutuantes (desktop) e pelo alternador (mobile). As páginas normais são
// reutilizadas tal e qual, sem alterações; as mini-apps (calculadora, bloco
// de notas, cronómetro, painel de saúde) só existem como painel flutuante —
// não têm rota própria, por isso ficam de fora de PANEL_ROUTES.
export const PANEL_TYPES = {
  notes: { title: "Pedidos", icon: ClipboardList, Component: Notes },
  emails: { title: "Emails", icon: Mail, Component: Emails },
  suppliers: { title: "Fornecedores", icon: Truck, Component: Suppliers },
  tasks: { title: "Tarefas", icon: ListChecks, Component: Tasks },
  dashboard: { title: "Estatísticas", icon: BarChart3, Component: Dashboard },
  catalog: { title: "Catálogo técnico", icon: BookOpenCheck, Component: Catalog },
  health: { title: "Painel de Saúde", icon: HeartPulse, Component: HealthPanel },
  downloads: { title: "Downloads", icon: FolderDown, Component: DownloadsCenter },
  explorer: { title: "Explorador", icon: FolderTree, Component: Explorer },
  calculator: { title: "Calculadora", icon: CalculatorIcon, Component: Calculator },
  scratchpad: { title: "Bloco de notas", icon: StickyNote, Component: Scratchpad },
  stopwatch: { title: "Cronómetro", icon: Timer, Component: Stopwatch },
};

export const PANEL_ORDER = [
  "notes", "emails", "suppliers", "tasks", "dashboard", "catalog",
  "explorer", "health", "downloads", "calculator", "scratchpad", "stopwatch",
];

// Caminho da rota "normal" de cada tipo — usado para impedir abrir um
// painel flutuante do mesmo tipo da página já encaminhada por baixo (evitaria
// duas instâncias da mesma página em simultâneo: atalhos de teclado e
// verificação automática de emails a duplicar). Só existe para tipos que
// também são uma página normal — as mini-apps ficam sempre disponíveis.
export const PANEL_ROUTES = {
  notes: "/",
  emails: "/emails",
  suppliers: "/fornecedores",
  tasks: "/tarefas",
  dashboard: "/estatisticas",
  catalog: "/catalogo-tecnico",
};

export function routeMatchesPanelType(pathname, type) {
  const route = PANEL_ROUTES[type];
  if (!route) return false;
  if (route === "/") return pathname === "/";
  return pathname.startsWith(route);
}
