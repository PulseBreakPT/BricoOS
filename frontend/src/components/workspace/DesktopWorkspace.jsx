import { useWorkspace } from "@/context/WorkspaceContext";
import Window from "@/components/workspace/Window";
import Taskbar from "@/components/workspace/Taskbar";

// Camada extra sobre a página encaminhada normalmente (react-router) —
// só desktop. A página atual continua a funcionar por baixo tal como
// sempre funcionou; painéis abertos aqui flutuam por cima, sem nunca a
// substituir. Área vazia é "click-through" (pointer-events-none), só as
// janelas em si capturam interação.
export default function DesktopWorkspace() {
  const { panels, zOrder } = useWorkspace();
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-30">
        {panels.map((panel) => (
          <Window key={panel.id} panel={panel} zIndex={40 + Math.max(0, zOrder.indexOf(panel.id))} />
        ))}
      </div>
      <Taskbar />
    </>
  );
}
