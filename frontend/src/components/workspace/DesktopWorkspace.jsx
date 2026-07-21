import { useEffect } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import Window from "@/components/workspace/Window";
import Taskbar from "@/components/workspace/Taskbar";
import MissionControl from "@/components/workspace/MissionControl";

// Camada extra sobre a página encaminhada normalmente (react-router) —
// só desktop. A página atual continua a funcionar por baixo tal como
// sempre funcionou; painéis abertos aqui flutuam por cima, sem nunca a
// substituir. Área vazia é "click-through" (pointer-events-none), só as
// janelas em si capturam interação. O estado do Mission Control vive na
// sidebar (Layout.jsx), que é onde fica o botão para o abrir.
export default function DesktopWorkspace({
  missionControlOpen,
  onMissionControlOpenChange,
  onOpenLauncher,
  onShowDesktop,
  onOpenRoute,
  primaryWindow,
}) {
  const { panels, zOrder } = useWorkspace();

  // F3 (ou Ctrl/Cmd+Seta para cima, o atalho clássico do Mission Control no
  // Mac) abre/fecha de qualquer ponto da app — mas nunca a interromper
  // quem está a escrever num campo.
  useEffect(() => {
    const onKey = (e) => {
      const typing =
        ["INPUT", "TEXTAREA"].includes(e.target?.tagName) ||
        e.target?.isContentEditable;
      if (typing) return;
      if (e.key === "F3" || ((e.metaKey || e.ctrlKey) && e.key === "ArrowUp")) {
        e.preventDefault();
        onMissionControlOpenChange((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMissionControlOpenChange]);

  return (
    <>
      {/* Camada de janelas acima da aplicação principal e abaixo da barra
          global/dock. Diálogos, lançador e Mission Control ficam acima de
          toda a área de trabalho. */}
      <div className="pointer-events-none fixed inset-0 z-[45]">
        {panels.map((panel) => (
          <Window
            key={panel.id}
            panel={panel}
            zIndex={40 + Math.max(0, zOrder.indexOf(panel.id))}
          />
        ))}
      </div>
      <Taskbar
        onOpenLauncher={onOpenLauncher}
        onOpenMissionControl={() => onMissionControlOpenChange(true)}
        onShowDesktop={onShowDesktop}
        onOpenRoute={onOpenRoute}
      />
      <MissionControl
        open={missionControlOpen}
        onClose={() => onMissionControlOpenChange(false)}
        primaryWindow={primaryWindow}
      />
    </>
  );
}
