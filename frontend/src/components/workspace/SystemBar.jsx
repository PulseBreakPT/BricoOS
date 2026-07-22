import { Activity, Grid2X2, LayoutGrid, Search, Trash2 } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import StatusCluster from "@/components/workspace/StatusCluster";
import ThemeToggle from "@/components/workspace/ThemeToggle";
import WorkspaceMenu from "@/components/workspace/WorkspaceMenu";

const systemButton =
  "flex h-9 w-9 items-center justify-center rounded-xl text-white/55 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90";

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
      className="os-system-bar fixed inset-x-3 top-2 z-[65] hidden h-12 items-center rounded-[18px] border border-white/[0.11] px-2.5 lg:grid lg:grid-cols-[minmax(190px,0.9fr)_minmax(220px,1.2fr)_minmax(210px,0.9fr)] 2xl:grid-cols-[minmax(250px,1fr)_minmax(300px,540px)_minmax(310px,1fr)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-testid="system-launcher"
          onClick={onOpenLauncher}
          className="group flex h-9 items-center gap-2 rounded-xl px-1.5 pr-2.5 text-left transition-colors hover:bg-white/10"
          aria-label="Abrir aplicações"
        >
          <span className="os-brand-beacon relative flex h-7 w-7 items-center justify-center rounded-[9px] text-[11px] font-black text-white transition-transform group-hover:scale-105">
            <span className="relative z-10">B</span>
          </span>
          <span className="hidden leading-none xl:block">
            <span className="block text-[11px] font-extrabold tracking-tight text-white">
              BRICO OS
            </span>
            <span className="mt-1 block text-[7px] font-black uppercase tracking-[0.2em] text-white/25">
              Operations
            </span>
          </span>
        </button>

        <span className="h-5 w-px bg-white/10" aria-hidden="true" />
        <div className="os-active-app-chip flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-white/80">
          {ActiveIcon ? (
            <ActiveIcon className="h-3.5 w-3.5 shrink-0 text-white/55" />
          ) : null}
          <span className="truncate">
            {activeApp?.shortTitle || activeApp?.title || "Área de trabalho"}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMissionControl}
          className={`${systemButton} hidden xl:flex`}
          title="Ver todas as janelas (F3)"
          aria-label="Ver todas as janelas"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <WorkspaceMenu variant="menubar" />
      </div>

      <button
        type="button"
        data-testid="system-search"
        onClick={onOpenSearch}
        className="os-command-island group mx-auto flex h-9 w-full max-w-[540px] items-center gap-2 rounded-[13px] border border-white/[0.1] bg-black/35 px-3.5 text-left text-[11px] font-semibold text-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white/70"
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
          aria-label="Aplicações"
        >
          <Grid2X2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="system-activity"
          onClick={onOpenActivity}
          className={systemButton}
          title="Centro de atividade"
          aria-label="Centro de atividade"
        >
          <Activity className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="system-trash"
          onClick={onOpenTrash}
          className={`${systemButton} hidden xl:flex`}
          title="Lixeira"
          aria-label="Lixeira"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <ThemeToggle />
        <NotificationsBell variant="sidebar" />
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
        <StatusCluster variant="menubar" />
        <button
          type="button"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-gradient-to-br from-slate-100 to-slate-300 text-[9px] font-black text-slate-800 shadow-inner"
          title="Tiago Silva"
          aria-label="Perfil de Tiago Silva"
        >
          TS
        </button>
      </div>
    </header>
  );
}
