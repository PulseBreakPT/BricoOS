import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptics } from "@/lib/haptics";

const HOVER_DELAY = 450;
const LONGPRESS_DELAY = 450;
const MOVE_TOLERANCE = 10;
const PEEK_WIDTH = 288; // w-72

// Pré-visualização rápida sem abrir nada — ao pousar o rato (rato/trackpad)
// ou premir e segurar (ecrã tátil, onde "hover" não existe) mostra um cartão
// junto do elemento, sem navegar nem abrir uma janela. Largar/soltar fecha.
// O toque longo também suprime o clique normal que se seguiria ao soltar o
// dedo, para não disparar a ação do elemento por engano.
export default function QuickPeekTrigger({ children, renderPeek, as: Comp = "div", className, ...rest }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const startPointRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const openPeek = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos(rect);
    setOpen(true);
  }, []);

  const closePeek = useCallback(() => {
    setOpen(false);
    clearTimer();
  }, []);

  const onPointerEnter = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    timerRef.current = setTimeout(openPeek, HOVER_DELAY);
  };
  const onPointerLeaveWrap = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimer();
    setOpen(false);
  };
  const onPointerDown = (e) => {
    if (e.pointerType !== "touch") return;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      openPeek();
      // Usa a mesma abstração de haptics do resto da app, em vez de chamar
      // navigator.vibrate diretamente — mantém uma única fonte de verdade
      // para o feedback tátil (e qualquer preferência futura de o desligar).
      haptics.tap();
    }, LONGPRESS_DELAY);
  };
  const onPointerMove = (e) => {
    if (e.pointerType !== "touch" || !startPointRef.current) return;
    const dx = e.clientX - startPointRef.current.x;
    const dy = e.clientY - startPointRef.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clearTimer();
  };
  const onPointerUp = () => {
    clearTimer();
    if (open) closePeek();
  };
  const onClickCapture = (e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onScroll = () => closePeek();
    const onKey = (e) => { if (e.key === "Escape") closePeek(); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closePeek]);

  useEffect(() => () => clearTimer(), []);

  const top = pos ? Math.min(pos.bottom + 8, window.innerHeight - 24) : 0;
  const left = pos ? Math.min(Math.max(8, pos.left), window.innerWidth - PEEK_WIDTH - 8) : 0;

  return (
    <Comp
      ref={wrapRef}
      className={className}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeaveWrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      {...rest}
    >
      {children}
      {open && pos ? createPortal(
        <div
          data-testid="quick-peek"
          className="pointer-events-none fixed z-[80] w-72 animate-in fade-in zoom-in-95 duration-100"
          style={{ top, left }}
        >
          <div className="pointer-events-none rounded-xl border border-border bg-card p-3 shadow-2xl">
            {renderPeek()}
          </div>
        </div>,
        document.body,
      ) : null}
    </Comp>
  );
}
