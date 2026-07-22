import { LayoutGrid, MonitorUp, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import WorkspaceMenu from "@/components/workspace/WorkspaceMenu";
import { haptics } from "@/lib/haptics";

const ROUTE_APPS = [
  { type: "notes", route: "/", gradient: "from-slate-700 to-slate-950" },
  { type: "emails", route: "/emails", gradient: "from-sky-500 to-blue-700" },
  {
    type: "suppliers",
    route: "/fornecedores",
    gradient: "from-amber-400 to-orange-600",
  },
  {
    type: "tasks",
    route: "/tarefas",
    gradient: "from-emerald-500 to-teal-700",
  },
  {
    type: "dashboard",
    route: "/estatisticas",
    gradient: "from-violet-500 to-indigo-700",
  },
  {
    type: "catalog",
    route: "/catalogo-tecnico",
    gradient: "from-red-500 to-red-800",
  },
];

function routeIsActive(pathname, route) {
  return route === "/" ? pathname === "/" : pathname.startsWith(route);
}

function DockRouteApp({ app, active, onOpen }) {
  const meta = PANEL_TYPES[app.type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <button
      type="button"
      data-testid={`dock-route-${app.type}`}
      onClick={() => {
        haptics.tap();
        onOpen(app.route);
      }}
      className={`os-dock-route group relative flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 hover:-translate-y-1.5 active:scale-90 ${active ? "is-active" : ""}`}
      title={`Abrir ${meta.title}`}
      aria-label={`Abrir ${meta.title}`}
    >
      <span
        className={`os-dock-app-icon flex h-11 w-11 items-center justify-center rounded-[15px] border border-white/25 bg-gradient-to-br ${app.gradient} text-white shadow-[0_12px_22px_-10px_rgba(16,17,20,0.45),inset_0_1px_0_rgba(255,255,255,0.24)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_18px_28px_-12px_rgba(16,17,20,0.55)]`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span
        className={`absolute -bottom-0.5 left-1/2 h-1 -translate-x-1/2 rounded-full bg-neutral-900 transition-all ${active ? "w-4 opacity-100" : "w-1 opacity-0 group-hover:opacity-40"}`}
      />
      <span className="os-dock-tooltip">{meta.title}</span>
    </button>
  );
}

// Dock persistente do BRICO OS. É o ponto único para abrir aplicações,
// recuperar janelas e regressar ao ambiente de trabalho; deixa de ser uma
// simples lista que só aparecia depois de abrir uma janela.
export default function Taskbar({
  onOpenLauncher,
  onOpenMissionControl,
  onShowDesktop,
  onOpenRoute,
  homeVisible = false,
}) {
  const { panels, activeId, focusPanel, closePanel } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const openRoute = (route) => {
    onOpenRoute?.(route);
    if (location.pathname !== route) navigate(route);
  };

  return (
    <div
      data-testid="workspace-taskbar"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[64] hidden justify-center px-4 lg:flex"
    >
      <div className="os-dock pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto overflow-y-hidden rounded-[26px] border border-neutral-900/[0.08] px-2.5 py-2 shadow-[0_24px_65px_-20px_rgba(16,17,20,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl">
        <button
          type="button"
          data-testid="dock-launcher"
          onClick={() => {
            haptics.tap();
            onOpenLauncher?.();
          }}
          className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] text-neutral-500 transition-all hover:-translate-y-1 hover:bg-neutral-900/[0.05] hover:text-neutral-900 active:scale-90"
          title="Todas as aplicações"
        >
          <span className="grid grid-cols-2 gap-[3px] rounded-[11px] border border-neutral-900/10 bg-white/85 p-2 shadow-sm transition-transform group-hover:scale-105">
            {[0, 1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-2 w-2 rounded-[3px] ${n === 0 ? "bg-red-500" : n === 3 ? "bg-amber-400" : "bg-neutral-400"}`}
              />
            ))}
          </span>
          <span className="os-dock-tooltip">Aplicações</span>
        </button>

        <span
          className="mx-1 h-9 w-px shrink-0 bg-neutral-900/10"
          aria-hidden="true"
        />

        {ROUTE_APPS.map((app) => (
          <DockRouteApp
            key={app.type}
            app={app}
            active={!homeVisible && routeIsActive(location.pathname, app.route)}
            onOpen={openRoute}
          />
        ))}

        {panels.length > 0 ? (
          <span
            className="mx-1 h-9 w-px shrink-0 bg-neutral-900/10"
            aria-hidden="true"
          />
        ) : null}

        {/* O dock só mostra os primeiros 5 painéis — sem isto, janelas
            abertas para além do limite ficavam invisíveis e sem qualquer
            forma de saber que existem, exceto pelo Mission Control. */}
        {panels.length > 5 ? (
          <button
            type="button"
            data-testid="dock-overflow"
            onClick={() => {
              haptics.tap();
              onOpenMissionControl?.();
            }}
            className="os-dock-action flex h-9 shrink-0 items-center justify-center rounded-xl px-2 font-mono text-[10px] font-black text-neutral-500 transition-all hover:-translate-y-0.5 hover:bg-neutral-900/[0.05] hover:text-neutral-900"
            title={`+${panels.length - 5} janela(s) — abrir Mission Control`}
          >
            +{panels.length - 5}
          </button>
        ) : null}

        {panels.slice(0, 5).map((panel) => {
          const meta = PANEL_TYPES[panel.type];
          if (!meta) return null;
          const Icon = meta.icon;
          const active = activeId === panel.id && !panel.minimized;
          return (
            <button
              type="button"
              key={panel.id}
              data-testid={`taskbar-panel-${panel.id}`}
              onClick={() => {
                haptics.tap();
                focusPanel(panel.id);
              }}
              className="group relative flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl transition-all hover:-translate-y-1 hover:bg-neutral-900/[0.05] active:scale-90"
              title={`${meta.title}${panel.minimized ? " · minimizada" : " · janela aberta"}`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${active ? "border-neutral-900/20 bg-neutral-900 text-white" : "border-neutral-900/10 bg-white/75 text-neutral-500 group-hover:text-neutral-900"}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={`absolute -bottom-0.5 left-1/2 h-1 -translate-x-1/2 rounded-full ${panel.minimized ? "w-1 bg-neutral-400" : active ? "w-4 bg-emerald-500" : "w-1 bg-neutral-500"}`}
              />
              <span className="os-dock-tooltip">
                {meta.title}
                {panel.minimized ? " · minimizada" : ""}
              </span>
              <span
                role="button"
                tabIndex={-1}
                data-testid={`taskbar-close-${panel.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.tap();
                  closePanel(panel.id);
                }}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md group-hover:flex"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </button>
          );
        })}

        <span
          className="mx-1 h-9 w-px shrink-0 bg-neutral-900/10"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => {
            haptics.tap();
            onOpenMissionControl?.();
          }}
          className="os-dock-action flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition-all hover:-translate-y-0.5 hover:bg-neutral-900/[0.05] hover:text-neutral-900"
          title="Mission Control (F3)"
        >
          <LayoutGrid className="h-[18px] w-[18px]" />
        </button>
        <WorkspaceMenu variant="dock" />
        <button
          type="button"
          data-testid="dock-show-desktop"
          onClick={() => {
            haptics.tap();
            onShowDesktop?.();
          }}
          className={`os-dock-action flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 hover:bg-neutral-900/[0.05] hover:text-neutral-900 ${homeVisible ? "bg-neutral-900 text-white shadow-[0_8px_20px_-10px_rgba(16,17,20,0.6)] hover:bg-neutral-900 hover:text-white" : "text-neutral-500"}`}
          title="Mostrar ambiente de trabalho"
          aria-current={homeVisible ? "page" : undefined}
        >
          <MonitorUp className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
