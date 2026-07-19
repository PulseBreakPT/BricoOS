import { useCallback, useRef, useState } from "react";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";

const MIN_W = 420;
const MIN_H = 320;

// Janela flutuante do desktop — arrastar pela barra de título, redimensionar
// pelo canto inferior direito. A posição/tamanho só é confirmada no
// context (e por isso só aí é persistida) ao soltar o gesto; durante o
// arrasto vive em estado local, para não disparar dezenas de escritas por
// segundo no localStorage.
export default function Window({ panel, zIndex }) {
  const { closePanel, focusPanel, movePanel, resizePanel, toggleMinimize, toggleMaximize, activeId } = useWorkspace();
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [transient, setTransient] = useState(null);

  const meta = PANEL_TYPES[panel.type];
  const Icon = meta?.icon;
  const Content = meta?.Component;

  const onTitleBarPointerDown = useCallback((e) => {
    if (panel.maximized) return;
    if (e.target.closest("[data-window-btn]")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { startX, startY, origX: panel.x, origY: panel.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panel.x, panel.y, panel.maximized]);

  const onTitleBarPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nx = Math.max(0, dragRef.current.origX + dx);
    const ny = Math.max(0, dragRef.current.origY + dy);
    setTransient((t) => ({ w: panel.w, h: panel.h, ...t, x: nx, y: ny }));
  }, [panel.w, panel.h]);

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setTransient((t) => {
      if (t) movePanel(panel.id, t.x, t.y);
      return null;
    });
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }
  }, [panel.id, movePanel]);

  const onResizePointerDown = useCallback((e) => {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: panel.w, origH: panel.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panel.w, panel.h]);

  const onResizePointerMove = useCallback((e) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    const nw = Math.max(MIN_W, resizeRef.current.origW + dx);
    const nh = Math.max(MIN_H, resizeRef.current.origH + dy);
    setTransient((t) => ({ x: panel.x, y: panel.y, ...t, w: nw, h: nh }));
  }, [panel.x, panel.y]);

  const endResize = useCallback((e) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setTransient((t) => {
      if (t) resizePanel(panel.id, t.w, t.h);
      return null;
    });
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }
  }, [panel.id, resizePanel]);

  if (panel.minimized || !meta) return null;

  const isActive = activeId === panel.id;
  const style = panel.maximized
    ? { left: 12, top: 12, right: 12, bottom: 84, zIndex }
    : {
      left: transient?.x ?? panel.x, top: transient?.y ?? panel.y,
      width: transient?.w ?? panel.w, height: transient?.h ?? panel.h, zIndex,
    };

  return (
    <div
      data-testid={`window-${panel.type}`}
      onPointerDownCapture={() => focusPanel(panel.id)}
      className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl ${isActive ? "border-slate-300 shadow-slate-400/30" : "border-slate-200 shadow-slate-300/20"}`}
      style={style}
    >
      <div
        data-testid={`window-titlebar-${panel.type}`}
        onPointerDown={onTitleBarPointerDown}
        onPointerMove={onTitleBarPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => toggleMaximize(panel.id)}
        className={`flex shrink-0 cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing ${isActive ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50/70"}`}
      >
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : null}
        <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{meta.title}</p>
        <button data-window-btn data-testid={`window-minimize-${panel.type}`} onClick={() => toggleMinimize(panel.id)} title="Minimizar" className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button data-window-btn data-testid={`window-maximize-${panel.type}`} onClick={() => toggleMaximize(panel.id)} title={panel.maximized ? "Restaurar" : "Maximizar"} className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
          {panel.maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button data-window-btn data-testid={`window-close-${panel.type}`} onClick={() => closePanel(panel.id)} title="Fechar" className="rounded-md p-1 text-slate-400 hover:bg-red-100 hover:text-red-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4">
        <Content />
      </div>
      {!panel.maximized ? (
        <div
          data-testid={`window-resize-${panel.type}`}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        />
      ) : null}
    </div>
  );
}
