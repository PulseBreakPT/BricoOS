import { ClipboardList, Mail, Truck, ListChecks, BarChart3, BookOpenCheck } from "lucide-react";
import Notes from "@/pages/Notes";
import Emails from "@/pages/Emails";
import Suppliers from "@/pages/Suppliers";
import Tasks from "@/pages/Tasks";
import Dashboard from "@/pages/Dashboard";
import Catalog from "@/pages/Catalog";

// Registo único de "aplicações" que podem abrir como painel na Área de
// Trabalho — usado pelo lançador da barra lateral/taskbar, pelas janelas
// flutuantes (desktop) e pelo alternador (mobile). Cada página existente é
// reutilizada tal e qual, sem alterações.
export const PANEL_TYPES = {
  notes: { title: "Pedidos", icon: ClipboardList, Component: Notes },
  emails: { title: "Emails", icon: Mail, Component: Emails },
  suppliers: { title: "Fornecedores", icon: Truck, Component: Suppliers },
  tasks: { title: "Tarefas", icon: ListChecks, Component: Tasks },
  dashboard: { title: "Estatísticas", icon: BarChart3, Component: Dashboard },
  catalog: { title: "Catálogo técnico", icon: BookOpenCheck, Component: Catalog },
};

export const PANEL_ORDER = ["notes", "emails", "suppliers", "tasks", "dashboard", "catalog"];

// Caminho da rota "normal" de cada tipo — usado para impedir abrir um
// painel flutuante do mesmo tipo da página já encaminhada por baixo (evitaria
// duas instâncias da mesma página em simultâneo: atalhos de teclado e
// verificação automática de emails a duplicar).
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
  if (route === "/") return pathname === "/";
  return pathname.startsWith(route);
}
