import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

const STORAGE_KEY = "brico_workspace_v1";
const DEFAULT_W = 880;
const DEFAULT_H = 600;

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.panels)) return null;
    return data;
  } catch {
    return null;
  }
}

const initialState = {
  panels: [], // { id, type, x, y, w, h, minimized, maximized, prevRect } — título/ícone vêm do registo PANEL_TYPES, pelo tipo
  zOrder: [], // ids, último = topo
  activeId: null,
  activeContext: null, // { kind: "pedido", id, label }
  changeBumps: {}, // { notes: 3, emails: 1, ... } — para painéis relacionados saberem quando recarregar
};

function cascadePosition(count) {
  const step = count % 6;
  return { x: 72 + step * 32, y: 56 + step * 28 };
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE": {
      return { ...state, ...action.payload, changeBumps: {} };
    }
    case "OPEN_PANEL": {
      const existing = state.panels.find((p) => p.type === action.panelType);
      if (existing) {
        return {
          ...state,
          panels: state.panels.map((p) => (p.id === existing.id ? { ...p, minimized: false } : p)),
          zOrder: [...state.zOrder.filter((id) => id !== existing.id), existing.id],
          activeId: existing.id,
        };
      }
      const { x, y } = cascadePosition(state.panels.length);
      const panel = {
        id: `${action.panelType}-${Date.now().toString(36)}`,
        type: action.panelType,
        x, y, w: DEFAULT_W, h: DEFAULT_H,
        minimized: false, maximized: false, prevRect: null,
      };
      return {
        ...state,
        panels: [...state.panels, panel],
        zOrder: [...state.zOrder, panel.id],
        activeId: panel.id,
      };
    }
    case "CLOSE_PANEL": {
      const panels = state.panels.filter((p) => p.id !== action.id);
      const zOrder = state.zOrder.filter((id) => id !== action.id);
      return {
        ...state,
        panels,
        zOrder,
        activeId: state.activeId === action.id ? (zOrder[zOrder.length - 1] || null) : state.activeId,
      };
    }
    case "FOCUS_PANEL": {
      if (!state.panels.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        panels: state.panels.map((p) => (p.id === action.id ? { ...p, minimized: false } : p)),
        zOrder: [...state.zOrder.filter((id) => id !== action.id), action.id],
        activeId: action.id,
      };
    }
    case "MOVE_PANEL":
      return {
        ...state,
        panels: state.panels.map((p) => (p.id === action.id ? { ...p, x: action.x, y: action.y } : p)),
      };
    case "RESIZE_PANEL":
      return {
        ...state,
        panels: state.panels.map((p) => (p.id === action.id ? { ...p, w: action.w, h: action.h } : p)),
      };
    case "TOGGLE_MINIMIZE":
      return {
        ...state,
        panels: state.panels.map((p) => (p.id === action.id ? { ...p, minimized: !p.minimized } : p)),
      };
    case "TOGGLE_MAXIMIZE":
      return {
        ...state,
        panels: state.panels.map((p) => {
          if (p.id !== action.id) return p;
          if (p.maximized) return { ...p, maximized: false, ...(p.prevRect || {}), prevRect: null };
          return { ...p, maximized: true, prevRect: { x: p.x, y: p.y, w: p.w, h: p.h } };
        }),
      };
    case "SET_ACTIVE_CONTEXT":
      return { ...state, activeContext: action.context };
    case "NOTIFY_CHANGED":
      return {
        ...state,
        changeBumps: { ...state.changeBumps, [action.scope]: (state.changeBumps[action.scope] || 0) + 1 },
      };
    default:
      return state;
  }
}

const WorkspaceCtx = createContext(null);

export function WorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    const persisted = loadPersisted();
    if (!persisted) return init;
    return {
      ...init,
      panels: persisted.panels || [],
      zOrder: persisted.zOrder || [],
      activeContext: persisted.activeContext || null,
    };
  });

  // Persistência local ao dispositivo — não há conceito de "utilizador" além
  // do PIN por dispositivo, por isso localStorage chega (mesma lógica do
  // device_token já usado no resto da app).
  const saveTimer = useRef(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          panels: state.panels, zOrder: state.zOrder, activeContext: state.activeContext,
        }));
      } catch { /* quota cheia ou modo privado — a app continua a funcionar sem persistir */ }
    }, 250);
    return () => clearTimeout(saveTimer.current);
  }, [state.panels, state.zOrder, state.activeContext]);

  const openPanel = useCallback((panelType) => dispatch({ type: "OPEN_PANEL", panelType }), []);
  const closePanel = useCallback((id) => dispatch({ type: "CLOSE_PANEL", id }), []);
  const focusPanel = useCallback((id) => dispatch({ type: "FOCUS_PANEL", id }), []);
  const movePanel = useCallback((id, x, y) => dispatch({ type: "MOVE_PANEL", id, x, y }), []);
  const resizePanel = useCallback((id, w, h) => dispatch({ type: "RESIZE_PANEL", id, w, h }), []);
  const toggleMinimize = useCallback((id) => dispatch({ type: "TOGGLE_MINIMIZE", id }), []);
  const toggleMaximize = useCallback((id) => dispatch({ type: "TOGGLE_MAXIMIZE", id }), []);
  const setActiveContext = useCallback((context) => dispatch({ type: "SET_ACTIVE_CONTEXT", context }), []);
  const notifyChanged = useCallback((scope) => dispatch({ type: "NOTIFY_CHANGED", scope }), []);

  const value = useMemo(() => ({
    ...state,
    openPanel, closePanel, focusPanel, movePanel, resizePanel,
    toggleMinimize, toggleMaximize, setActiveContext, notifyChanged,
  }), [state, openPanel, closePanel, focusPanel, movePanel, resizePanel,
      toggleMinimize, toggleMaximize, setActiveContext, notifyChanged]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
