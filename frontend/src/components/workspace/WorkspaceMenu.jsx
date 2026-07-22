import { LayoutTemplate, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Áreas de trabalho guardadas — uma fotografia da disposição atual (que
// painéis, onde, que tamanho) para voltar a ela com um clique. Ex.: uma
// para "Orçamentos" (Pedidos + PDF lado a lado), outra só com a caixa de
// entrada maximizada.
export default function WorkspaceMenu({ variant = "sidebar" }) {
  const { panels, workspaces, saveWorkspace, loadWorkspace, deleteWorkspace } =
    useWorkspace();

  const handleSave = () => {
    const name = window.prompt("Nome para esta área de trabalho:");
    if (!name || !name.trim()) return;
    saveWorkspace(name.trim());
    toast.success(`Área de trabalho "${name.trim()}" guardada`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="sidebar-workspaces"
          title="Áreas de trabalho guardadas"
          aria-label="Áreas de trabalho guardadas"
          className={
            variant === "menubar"
              ? "hidden h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-white/50 transition-colors hover:bg-white/10 hover:text-white 2xl:flex"
              : variant === "dock"
                ? "os-dock-action flex h-11 w-11 items-center justify-center rounded-xl text-white/55 transition-all hover:bg-white/10 hover:text-white"
                : "flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-[color:var(--chrome-muted)] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          }
        >
          <LayoutTemplate
            className={
              variant === "dock" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5 shrink-0"
            }
          />
          {variant === "dock"
            ? null
            : variant === "menubar"
              ? "Espaços"
              : "Áreas de trabalho"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          data-testid="workspace-save"
          onClick={handleSave}
          disabled={panels.length === 0}
        >
          <Save className="mr-2 h-4 w-4" /> Guardar disposição atual…
        </DropdownMenuItem>
        {workspaces.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {workspaces.map((w) => (
              <div
                key={w.id}
                data-testid={`workspace-item-${w.id}`}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <button
                  data-testid={`workspace-load-${w.id}`}
                  onClick={() => loadWorkspace(w.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-700"
                >
                  {w.name}{" "}
                  <span className="font-normal text-slate-400">
                    ({w.panels.length})
                  </span>
                </button>
                <button
                  data-testid={`workspace-delete-${w.id}`}
                  title="Eliminar"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWorkspace(w.id);
                  }}
                  className="shrink-0 rounded p-1 text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </>
        ) : (
          <p className="px-2 py-2 text-xs text-slate-400">
            Sem áreas de trabalho guardadas.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

