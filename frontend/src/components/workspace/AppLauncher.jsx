import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  PANEL_TYPES,
  PANEL_ORDER,
  routeMatchesPanelType,
} from "@/lib/panelRegistry";
import DockIcon from "@/components/workspace/DockIcon";
import { haptics } from "@/lib/haptics";

const DOCK_ORDER_KEY = "brico_dock_order_v1";

// Ordem dos ícones do lançador, guardada localmente — reconciliada com
// PANEL_ORDER a cada carregamento: tipos novos entram no fim, tipos
// removidos desaparecem, sem partir nada.
function loadDockOrder() {
  let saved = [];
  try {
    saved = JSON.parse(window.localStorage.getItem(DOCK_ORDER_KEY) || "[]");
  } catch {
    saved = [];
  }
  const known = saved.filter((t) => PANEL_ORDER.includes(t));
  const missing = PANEL_ORDER.filter((t) => !known.includes(t));
  return [...known, ...missing];
}

// Grelha de lançamento de "aplicações" na sidebar — o Dock que antes vivia
// espremido na taskbar, agora ao lado da navegação principal, com espaço
// para todas as apps sem disputar largura com os separadores abertos.
export default function AppLauncher({
  variant = "sidebar",
  onLaunch,
  types,
}) {
  const { panels, openPanel } = useWorkspace();
  const location = useLocation();
  const [dockOrder, setDockOrder] = useState(loadDockOrder);
  const [dragType, setDragType] = useState(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_ORDER_KEY, JSON.stringify(dockOrder));
    } catch {
      /* quota cheia ou modo privado */
    }
  }, [dockOrder]);

  const dropOnType = (targetType) => {
    if (!dragType || dragType === targetType) {
      setDragType(null);
      return;
    }
    haptics.impact();
    setDockOrder((prev) => {
      const next = prev.filter((t) => t !== dragType);
      const targetIndex = next.indexOf(targetType);
      next.splice(targetIndex, 0, dragType);
      return next;
    });
    setDragType(null);
  };

  return (
    <div
      className={
        variant === "launcher"
          ? "grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6"
          : "grid grid-cols-5 gap-1.5"
      }
    >
      {dockOrder
        .filter((type) => !types || types.includes(type))
        .map((type) => {
        const meta = PANEL_TYPES[type];
        if (!meta) return null;
        const count = panels.filter((p) => p.type === type).length;
        const isCurrentRoute = routeMatchesPanelType(location.pathname, type);
        return (
          <DockIcon
            key={type}
            type={type}
            meta={meta}
            isOpen={count > 0}
            count={count}
            isCurrentRoute={isCurrentRoute}
            variant={variant === "launcher" ? "launcher" : "compact"}
            onOpen={() => {
              openPanel(type);
              onLaunch?.();
            }}
            onOpenNew={() => {
              openPanel(type, { forceNew: true });
              onLaunch?.();
            }}
            onDragStartType={setDragType}
            onDropOnType={dropOnType}
          />
        );
        })}
    </div>
  );
}
