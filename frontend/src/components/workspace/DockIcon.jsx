import { useRef, useState } from "react";
import { Focus, SquarePlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { haptics } from "@/lib/haptics";

const LONGPRESS_DELAY = 500;

// Ícone do Dock — clique curto abre/foca a App (comportamento de sempre);
// clique longo (rato ou toque, já que "hover" não é um gesto em ecrã
// tátil) ou botão direito abrem um pequeno menu com "Nova janela", para
// abrir uma segunda instância da mesma App em paralelo. Arrastar reordena
// os ícones (onDragStartType/onDropOnType, geridos pelo Taskbar).
export default function DockIcon({
  type,
  meta,
  isOpen,
  isCurrentRoute,
  count,
  onOpen,
  onOpenNew,
  onDragStartType,
  onDropOnType,
  variant = "compact",
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);
  const Icon = meta.icon;
  const isLauncher = variant === "launcher";

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const startLongPress = () => {
    clearTimer();
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      haptics.tap();
      setMenuOpen(true);
    }, LONGPRESS_DELAY);
  };

  const onClick = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    haptics.tap();
    onOpen();
  };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={`taskbar-launch-${type}`}
          draggable
          onDragStart={() => onDragStartType(type)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDropOnType(type)}
          disabled={isCurrentRoute}
          title={
            isCurrentRoute
              ? `${meta.title} já é a página atual`
              : `Abrir ${meta.title} (clique longo: nova janela)`
          }
          onPointerDown={startLongPress}
          onPointerUp={clearTimer}
          onPointerLeave={clearTimer}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(true);
          }}
          onClick={onClick}
          className={
            isLauncher
              ? `group relative flex min-w-0 flex-col items-center gap-2 rounded-2xl p-2 text-center transition-all duration-200 hover:-translate-y-1 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 ${isOpen ? "text-white" : "text-white/70 hover:text-white"}`
              : `relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 ${isOpen ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-[color:var(--chrome-muted)] hover:bg-white/10 hover:text-white"}`
          }
        >
          {isLauncher ? (
            <>
              <span className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/15 bg-gradient-to-br from-white/[0.20] to-white/[0.06] text-white shadow-[0_16px_30px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.20)] transition-transform group-hover:scale-105">
                <Icon className="h-6 w-6" strokeWidth={1.9} />
                {isOpen ? (
                  <span className="led led-ok absolute -right-0.5 -top-0.5 ring-2 ring-[#151515]" />
                ) : null}
              </span>
              <span className="w-full truncate text-[11px] font-bold">
                {meta.title}
              </span>
            </>
          ) : (
            <Icon className="h-4 w-4" />
          )}
          {/* LED de execução — a App está "ligada", como no dock do macOS. */}
          {isOpen && !isLauncher ? (
            <span className="led led-ok absolute -bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2" />
          ) : null}
          {count > 1 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-black text-white ring-2 ring-[color:var(--chrome)] shadow-[0_0_8px_rgba(217,38,38,0.5)]">
              {count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          data-testid={`taskbar-launch-open-${type}`}
          onClick={() => {
            setMenuOpen(false);
            onOpen();
          }}
        >
          <Focus className="mr-2 h-4 w-4" /> Abrir / focar
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`taskbar-launch-new-${type}`}
          onClick={() => {
            setMenuOpen(false);
            onOpenNew();
          }}
        >
          <SquarePlus className="mr-2 h-4 w-4" /> Nova janela
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
