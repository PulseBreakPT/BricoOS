import { ClipboardList, Mail, Truck, ListChecks, BarChart3, BookOpenCheck, Calculator as CalculatorIcon, StickyNote, Timer, HeartPulse, FolderDown, FolderTree, Settings as SettingsIcon, Bell } from "lucide-react";
import Notes from "@/pages/Notes";
import Emails from "@/pages/Emails";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import TaskGroups from "@/pages/TaskGroups";
import Dashboard from "@/pages/Dashboard";
import Catalog from "@/pages/Catalog";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
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
  taskGroups: { title: "Grupos de Tarefas", icon: FolderTree, Component: TaskGroups },
  dashboard: { title: "Estatísticas", icon: BarChart3, Component: Dashboard },
  catalog: { title: "Catálogo técnico", icon: BookOpenCheck, Component: Catalog },
  health: { title: "Painel de Saúde", icon: HeartPulse, Component: HealthPanel },
  downloads: { title: "Downloads", icon: FolderDown, Component: DownloadsCenter },
  explorer: { title: "Explorador", icon: FolderTree, Component: Explorer },
  calculator: { title: "Calculadora", icon: CalculatorIcon, Component: Calculator },
  scratchpad: { title: "Bloco de notas", icon: StickyNote, Component: Scratchpad },
  stopwatch: { title: "Cronómetro", icon: Timer, Component: Stopwatch },
  settings: { title: "Definições", icon: SettingsIcon, Component: Settings },
  notifications: { title: "Notificações", icon: Bell, Component: Notifications },
};

export const PANEL_ORDER = [
  "notes", "emails", "suppliers", "tasks", "taskGroups", "dashboard", "catalog",
  "explorer", "health", "downloads", "calculator", "scratchpad", "stopwatch", "settings", "notifications",
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
  taskGroups: "/grupos-tarefas",
  dashboard: "/estatisticas",
  catalog: "/catalogo-tecnico",
  settings: "/definicoes",
  notifications: "/notificacoes",
};

// Ferramentas que no computador só existem como painel flutuante — no
// telemóvel abrem dentro de uma folha inferior (ver components/Layout.jsx:
// MobileToolPanelBody, components/workspace/MobileHomeSurface.jsx), sem
// duplicar componente nenhum. As páginas normais (notes/emails/tasks/...)
// já têm rota própria no telemóvel, por isso ficam de fora desta lista.
export const MOBILE_TOOL_TYPES = ["explorer", "downloads", "calculator", "scratchpad", "stopwatch", "health"];

export function routeMatchesPanelType(pathname, type) {
  const route = PANEL_ROUTES[type];
  if (!route) return false;
  if (route === "/") return pathname === "/";
  return pathname.startsWith(route);
}
