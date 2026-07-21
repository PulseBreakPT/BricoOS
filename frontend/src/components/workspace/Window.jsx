import { useCallback, useRef, useState } from "react";
import { X, Minus, Maximize2, Minimize2, PanelLeft, PanelRight } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import { SIDEBAR_WIDTH, TASKBAR_RESERVE, WORKSPACE_GAP } from "@/lib/workspaceLayout";

const MIN_W = 420;
const MIN_H = 320;
const SPLIT_FRACTIONS = [0.5, 0.33, 0.25];

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

  // Ancorar a metade do ecrã (split screen) — sai do maximizado primeiro se
  // preciso, para o novo tamanho não ficar escondido por baixo dele. A
  // metade "esquerda" começa depois da sidebar, nunca por baixo dela. Tocar
  // outra vez no mesmo lado avança para o próximo tamanho — 50% → 33% → 25%
  // → 50%... (como o Rectangle/Stage Manager); 100% já existe via maximizar.
  const snapTo = useCallback((side) => {
    if (panel.maximized) toggleMaximize(panel.id);
    const usableW = window.innerWidth - SIDEBAR_WIDTH;
    const widthFor = (fraction) => Math.max(MIN_W, Math.round(usableW * fraction) - WORKSPACE_GAP * 1.5);
    const alreadyOnSide = side === "left"
      ? Math.abs(panel.x - (SIDEBAR_WIDTH + WORKSPACE_GAP)) < 2
      : Math.abs(panel.x + panel.w - (window.innerWidth - WORKSPACE_GAP)) < 4;
    const currentIndex = alreadyOnSide
      ? SPLIT_FRACTIONS.findIndex((fraction) => Math.abs(panel.w - widthFor(fraction)) < 2)
      : -1;
    const w = widthFor(SPLIT_FRACTIONS[currentIndex >= 0 ? (currentIndex + 1) % SPLIT_FRACTIONS.length : 0]);
    const h = Math.max(MIN_H, window.innerHeight - TASKBAR_RESERVE - WORKSPACE_GAP * 2);
    const x = side === "left" ? SIDEBAR_WIDTH + WORKSPACE_GAP : window.innerWidth - w - WORKSPACE_GAP;
    movePanel(panel.id, x, WORKSPACE_GAP);
    resizePanel(panel.id, w, h);
    focusPanel(panel.id);
  }, [panel.id, panel.maximized, panel.w, panel.x, toggleMaximize, movePanel, resizePanel, focusPanel]);

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
    // Nunca deixa arrastar a janela para debaixo da sidebar — ficaria
    // parcialmente escondida mesmo com o z-index mais alto.
    const nx = Math.max(SIDEBAR_WIDTH, dragRef.current.origX + dx);
    const ny = Math.max(0, dragRef.current.origY + dy);
    setTransient((t) => ({ w: panel.w, h: panel.h, ...t, x: nx, y: ny }));
  }, [panel.w, panel.h]);

  const endDrag = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    // Largar perto de uma margem lateral ancora a janela a essa metade do
    // ecrã (gesto normal de sistema operativo) — largar em qualquer outro
    // ponto só confirma a posição do arrasto, como já era. A margem
    // esquerda "útil" começa depois da sidebar, não no canto do ecrã.
    const nearLeftEdge = e.clientX <= SIDEBAR_WIDTH + 24;
    const nearRightEdge = e.clientX >= window.innerWidth - 24;
    setTransient((t) => {
      if (t) movePanel(panel.id, t.x, t.y);
      return null;
    });
    if (nearLeftEdge) snapTo("left");
    else if (nearRightEdge) snapTo("right");
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }
  }, [panel.id, movePanel, snapTo]);

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
    ? { left: SIDEBAR_WIDTH + WORKSPACE_GAP, top: 12, right: 12, bottom: TASKBAR_RESERVE, zIndex }
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
        <button data-window-btn data-testid={`window-snap-left-${panel.type}`} onClick={() => snapTo("left")} title="Ancorar à esquerda — toca outra vez para 50% / 33% / 25%" className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <button data-window-btn data-testid={`window-snap-right-${panel.type}`} onClick={() => snapTo("right")} title="Ancorar à direita — toca outra vez para 50% / 33% / 25%" className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
          <PanelRight className="h-3.5 w-3.5" />
        </button>
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
