import { Activity, Grid2X2, LayoutGrid, Search, Trash2 } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import StatusCluster from "@/components/workspace/StatusCluster";
import WorkspaceMenu from "@/components/workspace/WorkspaceMenu";

const systemButton =
  "flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90";

/**
 * Barra global do BRICO OS. Não pertence a nenhuma página: mantém pesquisa,
 * estado, janelas e utilitários acessíveis independentemente da aplicação que
 * estiver aberta, como a menubar de um sistema operativo.
 */
export default function SystemBar({
  activeApp,
  onOpenLauncher,
  onOpenSearch,
  onOpenActivity,
  onOpenTrash,
  onOpenMissionControl,
}) {
  const ActiveIcon = activeApp?.icon;

  return (
    <header
      data-testid="system-bar"
      className="os-system-bar fixed inset-x-0 top-0 z-[65] hidden h-12 items-center border-b border-white/[0.08] px-3 lg:grid lg:grid-cols-[minmax(240px,1fr)_minmax(280px,520px)_minmax(300px,1fr)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-testid="system-launcher"
          onClick={onOpenLauncher}
          className="group flex h-8 items-center gap-2 rounded-lg px-1.5 pr-2.5 text-left transition-colors hover:bg-white/10"
          aria-label="Abrir aplicações"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-gradient-to-br from-red-600 via-red-500 to-amber-400 text-[11px] font-black text-white shadow-[0_5px_16px_-5px_rgba(239,68,68,0.9)] ring-1 ring-white/20 transition-transform group-hover:scale-105">
            B
          </span>
          <span className="hidden text-[12px] font-extrabold tracking-tight text-white xl:inline">
            BRICO OS
          </span>
        </button>

        <span className="h-4 w-px bg-white/10" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-2 px-1.5 text-[12px] font-bold text-white/85">
          {ActiveIcon ? (
            <ActiveIcon className="h-3.5 w-3.5 shrink-0 text-white/55" />
          ) : null}
          <span className="truncate">
            {activeApp?.title || "Área de trabalho"}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMissionControl}
          className={`${systemButton} hidden xl:flex`}
          title="Ver todas as janelas (F3)"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <WorkspaceMenu variant="menubar" />
      </div>

      <button
        type="button"
        data-testid="system-search"
        onClick={onOpenSearch}
        className="group mx-auto flex h-8 w-full max-w-[520px] items-center gap-2 rounded-[10px] border border-white/[0.09] bg-black/35 px-3 text-left text-[12px] text-white/45 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white/70"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Pesquisar pedidos, clientes, emails e ficheiros
        </span>
        <span className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/35 group-hover:text-white/55">
          ⌘K
        </span>
      </button>

      <div className="flex min-w-0 items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={onOpenLauncher}
          className={`${systemButton} xl:hidden`}
          title="Aplicações"
        >
          <Grid2X2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="system-activity"
          onClick={onOpenActivity}
          className={systemButton}
          title="Centro de atividade"
        >
          <Activity className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="system-trash"
          onClick={onOpenTrash}
          className={`${systemButton} hidden xl:flex`}
          title="Lixeira"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <NotificationsBell variant="sidebar" />
        <span className="mx-1.5 h-4 w-px bg-white/10" aria-hidden="true" />
        <StatusCluster variant="menubar" />
        <button
          type="button"
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-[9px] font-black text-slate-800 shadow-inner ring-1 ring-white/20"
          title="Tiago Silva"
        >
          TS
        </button>
      </div>
    </header>
  );
}
