import { useRef, useState } from "react";
import { Focus, SquarePlus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { haptics } from "@/lib/haptics";

const LONGPRESS_DELAY = 500;

// Ícone do Dock — clique curto abre/foca a App (comportamento de sempre);
// clique longo (rato ou toque, já que "hover" não é um gesto em ecrã
// tátil) ou botão direito abrem um pequeno menu com "Nova janela", para
// abrir uma segunda instância da mesma App em paralelo. Arrastar reordena
// os ícones (onDragStartType/onDropOnType, geridos pelo Taskbar).
export default function DockIcon({
  type, meta, isOpen, isCurrentRoute, count,
  onOpen, onOpenNew, onDragStartType, onDropOnType,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);
  const Icon = meta.icon;

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
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
    if (longPressedRef.current) { longPressedRef.current = false; return; }
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
          title={isCurrentRoute ? `${meta.title} já é a página atual` : `Abrir ${meta.title} (clique longo: nova janela)`}
          onPointerDown={startLongPress}
          onPointerUp={clearTimer}
          onPointerLeave={clearTimer}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
          onClick={onClick}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 ${isOpen ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-[color:var(--chrome-muted)] hover:bg-white/10 hover:text-white"}`}
        >
          <Icon className="h-4 w-4" />
          {/* LED de execução — a App está "ligada", como no dock do macOS. */}
          {isOpen ? <span className="led led-ok absolute -bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2" /> : null}
          {count > 1 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-black text-white ring-2 ring-[color:var(--chrome)] shadow-[0_0_8px_rgba(217,38,38,0.5)]">
              {count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem data-testid={`taskbar-launch-open-${type}`} onClick={() => { setMenuOpen(false); onOpen(); }}>
          <Focus className="mr-2 h-4 w-4" /> Abrir / focar
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`taskbar-launch-new-${type}`} onClick={() => { setMenuOpen(false); onOpenNew(); }}>
          <SquarePlus className="mr-2 h-4 w-4" /> Nova janela
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
