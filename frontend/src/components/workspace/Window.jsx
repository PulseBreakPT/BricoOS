import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useWorkspace, MIN_PANEL_W, MIN_PANEL_H } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import {
  SIDEBAR_WIDTH,
  SYSTEM_BAR_HEIGHT,
  TASKBAR_RESERVE,
  WORKSPACE_GAP,
} from "@/lib/workspaceLayout";

// MIN_PANEL_W/MIN_PANEL_H vêm do WorkspaceContext — é lá que o reducer
// também aplica o mesmo mínimo ao RESIZE_PANEL; manter duas constantes
// locais separadas arriscava as duas divergirem com o tempo.
const MIN_W = MIN_PANEL_W;
const MIN_H = MIN_PANEL_H;
const SPLIT_FRACTIONS = [0.5, 0.33, 0.25];

function getWorkspaceMetrics() {
  if (window.innerWidth >= 3000) {
    return { systemBarHeight: 82, taskbarReserve: 128, gap: 20 };
  }
  if (window.innerWidth >= 1920) {
    return { systemBarHeight: 72, taskbarReserve: 112, gap: 18 };
  }
  return {
    systemBarHeight: SYSTEM_BAR_HEIGHT,
    taskbarReserve: TASKBAR_RESERVE,
    gap: WORKSPACE_GAP,
  };
}

// Janela flutuante do desktop — arrastar pela barra de título, redimensionar
// pelo canto inferior direito. A posição/tamanho só é confirmada no
// context (e por isso só aí é persistida) ao soltar o gesto; durante o
// arrasto vive em estado local, para não disparar dezenas de escritas por
// segundo no localStorage.
export default function Window({ panel, zIndex }) {
  const {
    closePanel,
    focusPanel,
    movePanel,
    resizePanel,
    toggleMinimize,
    toggleMaximize,
    activeId,
  } = useWorkspace();
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [transient, setTransient] = useState(null);
  const [, setViewportRevision] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setViewportRevision((revision) => revision + 1),
      );
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Ancorar a metade do ecrã (split screen) — sai do maximizado primeiro se
  // preciso, para o novo tamanho não ficar escondido por baixo dele. A
  // metade "esquerda" começa depois da sidebar, nunca por baixo dela. Tocar
  // outra vez no mesmo lado avança para o próximo tamanho — 50% → 33% → 25%
  // → 50%... (como o Rectangle/Stage Manager); 100% já existe via maximizar.
  const snapTo = useCallback(
    (side) => {
      const { systemBarHeight, taskbarReserve, gap } = getWorkspaceMetrics();
      if (panel.maximized) toggleMaximize(panel.id);
      const usableW = window.innerWidth - SIDEBAR_WIDTH;
      const widthFor = (fraction) =>
        Math.max(MIN_W, Math.round(usableW * fraction) - gap * 1.5);
      const alreadyOnSide =
        side === "left"
          ? Math.abs(panel.x - (SIDEBAR_WIDTH + gap)) < 2
          : Math.abs(panel.x + panel.w - (window.innerWidth - gap)) <
            4;
      const currentIndex = alreadyOnSide
        ? SPLIT_FRACTIONS.findIndex(
            (fraction) => Math.abs(panel.w - widthFor(fraction)) < 2,
          )
        : -1;
      const w = widthFor(
        SPLIT_FRACTIONS[
          currentIndex >= 0 ? (currentIndex + 1) % SPLIT_FRACTIONS.length : 0
        ],
      );
      const h = Math.max(
        MIN_H,
        window.innerHeight -
          systemBarHeight -
          taskbarReserve -
          gap * 2,
      );
      const x =
        side === "left"
          ? SIDEBAR_WIDTH + gap
          : window.innerWidth - w - gap;
      movePanel(panel.id, x, systemBarHeight + gap);
      resizePanel(panel.id, w, h);
      focusPanel(panel.id);
    },
    [
      panel.id,
      panel.maximized,
      panel.w,
      panel.x,
      toggleMaximize,
      movePanel,
      resizePanel,
      focusPanel,
    ],
  );

  const meta = PANEL_TYPES[panel.type];
  const Icon = meta?.icon;
  const Content = meta?.Component;

  const onTitleBarPointerDown = useCallback(
    (e) => {
      if (panel.maximized) return;
      if (e.target.closest("[data-window-btn]")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      dragRef.current = { startX, startY, origX: panel.x, origY: panel.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [panel.x, panel.y, panel.maximized],
  );

  const onTitleBarPointerMove = useCallback(
    (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const { systemBarHeight, taskbarReserve, gap } = getWorkspaceMetrics();
      // Mantém a janela dentro da área útil, abaixo da barra global.
      const maxX = Math.max(
        gap,
        window.innerWidth - panel.w - gap,
      );
      const maxY = Math.max(
        systemBarHeight,
        window.innerHeight - panel.h - taskbarReserve,
      );
      const nx = Math.min(
        maxX,
        Math.max(gap, dragRef.current.origX + dx),
      );
      const ny = Math.min(
        maxY,
        Math.max(systemBarHeight, dragRef.current.origY + dy),
      );
      setTransient((t) => ({ w: panel.w, h: panel.h, ...t, x: nx, y: ny }));
    },
    [panel.w, panel.h],
  );

  const endDrag = useCallback(
    (e) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      // Largar perto de uma margem lateral ancora a janela a essa metade do
      // ecrã (gesto normal de sistema operativo) — largar em qualquer outro
      // ponto só confirma a posição do arrasto, como já era. A margem
      // esquerda útil começa na margem segura do ambiente de trabalho.
      const { systemBarHeight } = getWorkspaceMetrics();
      const nearLeftEdge = e.clientX <= SIDEBAR_WIDTH + 24;
      const nearRightEdge = e.clientX >= window.innerWidth - 24;
      const nearTopEdge = e.clientY <= systemBarHeight + 8;
      setTransient((t) => {
        if (t) movePanel(panel.id, t.x, t.y);
        return null;
      });
      if (nearLeftEdge) snapTo("left");
      else if (nearRightEdge) snapTo("right");
      else if (nearTopEdge && !panel.maximized) toggleMaximize(panel.id);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* já libertado */
      }
    },
    [panel.id, panel.maximized, movePanel, snapTo, toggleMaximize],
  );

  const onResizePointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: panel.w,
        origH: panel.h,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [panel.w, panel.h],
  );

  const onResizePointerMove = useCallback(
    (e) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
      const dy = e.clientY - resizeRef.current.startY;
      const { taskbarReserve, gap } = getWorkspaceMetrics();
      const maxW = Math.max(
        MIN_W,
        window.innerWidth - panel.x - gap,
      );
      const maxH = Math.max(
        MIN_H,
        window.innerHeight - panel.y - taskbarReserve,
      );
      const nw = Math.min(
        maxW,
        Math.max(MIN_W, resizeRef.current.origW + dx),
      );
      const nh = Math.min(
        maxH,
        Math.max(MIN_H, resizeRef.current.origH + dy),
      );
      setTransient((t) => ({ x: panel.x, y: panel.y, ...t, w: nw, h: nh }));
    },
    [panel.x, panel.y],
  );

  const endResize = useCallback(
    (e) => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setTransient((t) => {
        if (t) resizePanel(panel.id, t.w, t.h);
        return null;
      });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* já libertado */
      }
    },
    [panel.id, resizePanel],
  );

  if (panel.minimized || !meta) return null;

  const isActive = activeId === panel.id;
  const { systemBarHeight, taskbarReserve, gap } = getWorkspaceMetrics();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const renderedW = Math.min(
    transient?.w ?? panel.w,
    Math.max(MIN_W, viewportW - gap * 2),
  );
  const renderedH = Math.min(
    transient?.h ?? panel.h,
    Math.max(
      MIN_H,
      viewportH - systemBarHeight - taskbarReserve - gap,
    ),
  );
  const renderedX = Math.min(
    Math.max(gap, transient?.x ?? panel.x),
    Math.max(gap, viewportW - renderedW - gap),
  );
  const renderedY = Math.min(
    Math.max(systemBarHeight + gap, transient?.y ?? panel.y),
    Math.max(
      systemBarHeight + gap,
      viewportH - renderedH - taskbarReserve,
    ),
  );

  const style = panel.maximized
    ? {
        left: SIDEBAR_WIDTH + gap,
        top: systemBarHeight + gap,
        right: gap,
        bottom: taskbarReserve,
        zIndex,
      }
    : {
        left: renderedX,
        top: renderedY,
        width: renderedW,
        height: renderedH,
        zIndex,
      };

  return (
    <div
      data-testid={`window-${panel.type}`}
      onPointerDownCapture={() => focusPanel(panel.id)}
      className={`os-floating-window themed-surface pointer-events-auto absolute flex animate-window-in flex-col overflow-hidden rounded-[22px] border bg-white ${isActive ? "elev-window-active border-neutral-900/[0.14]" : "elev-window border-neutral-900/[0.08]"}`}
      style={style}
    >
      {/* Barra de título — a moldura grafite da máquina a segurar a folha
          de trabalho. O LED indica qual das janelas está viva. */}
      <div
        data-testid={`window-titlebar-${panel.type}`}
        onPointerDown={onTitleBarPointerDown}
        onPointerMove={onTitleBarPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => toggleMaximize(panel.id)}
        className={`os-primary-titlebar flex h-12 shrink-0 cursor-grab items-center gap-2 border-b border-neutral-900/[0.08] px-2.5 transition-opacity duration-200 active:cursor-grabbing ${isActive ? "" : "opacity-75"}`}
      >
        {Icon ? (
          <span className="os-window-app-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-900/10">
            <Icon
              className={`h-3.5 w-3.5 ${isActive ? "text-neutral-900" : "text-[color:var(--chrome-muted)]"}`}
            />
          </span>
        ) : null}
        <p
          className={`min-w-0 flex-1 truncate text-xs font-bold ${isActive ? "text-neutral-900" : "text-[color:var(--chrome-muted)]"}`}
        >
          {meta.title}
        </p>
        <button
          data-window-btn
          data-testid={`window-snap-left-${panel.type}`}
          onClick={() => snapTo("left")}
          title="Ancorar à esquerda — toca outra vez para 50% / 33% / 25%"
          aria-label="Ancorar janela à esquerda"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--chrome-muted)] transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <button
          data-window-btn
          data-testid={`window-snap-right-${panel.type}`}
          onClick={() => snapTo("right")}
          title="Ancorar à direita — toca outra vez para 50% / 33% / 25%"
          aria-label="Ancorar janela à direita"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--chrome-muted)] transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-neutral-900/10" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-0.5" aria-label="Controlos da janela">
          <button
            data-window-btn
            data-testid={`window-minimize-${panel.type}`}
            onClick={() => toggleMinimize(panel.id)}
            title="Minimizar"
            aria-label="Minimizar"
            className="os-window-control"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
          <button
            data-window-btn
            data-testid={`window-maximize-${panel.type}`}
            onClick={() => toggleMaximize(panel.id)}
            title={panel.maximized ? "Restaurar" : "Maximizar"}
            aria-label={panel.maximized ? "Restaurar" : "Maximizar"}
            className="os-window-control"
          >
            {panel.maximized ? (
              <Minimize2 className="h-3 w-3" strokeWidth={2.1} />
            ) : (
              <Maximize2 className="h-3 w-3" strokeWidth={2.1} />
            )}
          </button>
          <button
            data-window-btn
            data-testid={`window-close-${panel.type}`}
            onClick={() => closePanel(panel.id)}
            title="Fechar"
            aria-label="Fechar"
            className="os-window-control os-window-control-danger"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="os-work-surface min-h-0 flex-1 overflow-auto overscroll-contain p-4">
        <Content />
      </div>
      {!panel.maximized ? (
        <div
          data-testid={`window-resize-${panel.type}`}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize opacity-30 transition-opacity hover:opacity-70 [background:repeating-linear-gradient(135deg,transparent_0_3px,rgba(16,17,20,0.35)_3px,rgba(16,17,20,0.35)_4px)] [clip-path:polygon(100%_20%,100%_100%,20%_100%)]"
        />
      ) : null}
    </div>
  );
}
