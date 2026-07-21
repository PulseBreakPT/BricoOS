import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  CheckCheck,
  ClipboardList,
  FileText,
  FolderDown,
  FolderTree,
  ListChecks,
  Mail,
  Maximize2,
  Menu,
  Minus,
  Search,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import NotificationsBell from "@/components/NotificationsBell";
import InstallPwaBanner from "@/components/InstallPwaBanner";
import ActivityCenter from "@/components/ActivityCenter";
import TrashPanel from "@/components/TrashPanel";
import api from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { WorkspaceProvider, useWorkspace } from "@/context/WorkspaceContext";
import {
  SystemStatusProvider,
  useSystemStatus,
} from "@/context/SystemStatusContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DesktopWorkspace from "@/components/workspace/DesktopWorkspace";
import CommandPalette from "@/components/workspace/CommandPalette";
import AppLauncher from "@/components/workspace/AppLauncher";
import StatusCluster from "@/components/workspace/StatusCluster";
import SystemBar from "@/components/workspace/SystemBar";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import { haptics } from "@/lib/haptics";

const ROUTE_APPS = [
  {
    path: "/",
    title: "Pedidos de Clientes",
    shortTitle: "Pedidos",
    icon: ClipboardList,
    testid: "nav-clientes",
    end: true,
  },
  {
    path: "/fornecedores",
    title: "Fornecedores",
    shortTitle: "Fornecedores",
    icon: Truck,
    testid: "nav-fornecedores",
  },
  {
    path: "/emails",
    title: "Correio",
    shortTitle: "Emails",
    icon: Mail,
    testid: "nav-emails",
  },
  {
    path: "/tarefas",
    title: "Tarefas",
    shortTitle: "Tarefas",
    icon: ListChecks,
    testid: "nav-tarefas",
  },
  {
    path: "/estatisticas",
    title: "Centro de Análise",
    shortTitle: "Estatísticas",
    icon: BarChart3,
    testid: "nav-estatisticas",
  },
  {
    path: "/catalogo-tecnico",
    title: "Catálogo Técnico",
    shortTitle: "Catálogo",
    icon: BookOpenCheck,
    testid: "nav-catalogo",
  },
];

const NAV_GROUPS = [
  { label: "Operação", items: ROUTE_APPS.slice(0, 3) },
  {
    label: "Organização",
    items: [ROUTE_APPS[3], ROUTE_APPS[5], ROUTE_APPS[4]],
  },
];

function getRouteApp(pathname) {
  if (pathname === "/") return ROUTE_APPS[0];
  return (
    ROUTE_APPS.find(
      (app) => app.path !== "/" && pathname.startsWith(app.path),
    ) || ROUTE_APPS[0]
  );
}

function SupplierEmailAlert() {
  const [data, setData] = useState({ count: 0, items: [] });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get("/emails/unseen");
      setData(response);
    } catch {
      /* o sistema volta a tentar na próxima verificação */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 45000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  if (!data.count) return null;

  const openItem = async (message) => {
    try {
      await api.post(`/emails/${message.id}/seen`);
    } catch {
      /* mantém a navegação disponível */
    }
    await load();
    if (message.note_id)
      navigate(
        `/?open=${message.note_id}&tab=${message.reply_kind === "client" ? "cronologia" : "orcamentos"}`,
      );
    else navigate("/fornecedores");
  };

  const allClient =
    data.items.length > 0 &&
    data.items.every((message) => message.reply_kind === "client");
  const markAll = async () => {
    try {
      await api.post("/emails/seen-all");
    } catch {
      /* volta a sincronizar mais tarde */
    }
    await load();
  };

  return (
    <div
      data-testid="supplier-email-alert"
      className="os-system-alert relative mb-5 animate-scale-in overflow-hidden rounded-2xl border border-red-200 bg-white p-4 shadow-[0_18px_50px_-25px_rgba(127,29,29,0.45)] sm:p-5"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-700"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-[0_10px_24px_-9px_rgba(217,38,38,0.75)]">
            <Mail className="h-5 w-5" />
            <span className="led led-alert absolute -right-1 -top-1 ring-2 ring-white" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg font-extrabold leading-tight text-slate-950 sm:text-xl">
              {data.count === 1
                ? allClient
                  ? "O cliente respondeu"
                  : "Recebeu um novo email"
                : allClient
                  ? `${data.count} clientes responderam`
                  : `Recebeu ${data.count} novos emails`}
            </p>
            <div className="mt-2.5 space-y-1.5">
              {data.items.slice(0, 3).map((message) => (
                <button
                  key={message.id}
                  data-testid={`email-alert-${message.id}`}
                  onClick={() => openItem(message)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-[0.98]"
                >
                  {message.reply_kind === "client" ? (
                    <User
                      className="h-4 w-4 shrink-0 text-red-600"
                      title="Cliente"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                    {message.supplier_name ||
                      message.from_name ||
                      message.from_email}
                    <span className="ml-1.5 font-semibold text-slate-500">
                      {message.subject || "(sem assunto)"}
                    </span>
                  </span>
                  {message.has_pdf ? (
                    <FileText
                      className="h-4 w-4 shrink-0 text-slate-400"
                      title="Com PDF"
                    />
                  ) : null}
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-slate-400">
                    {timeAgo(message.received_at)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          data-testid="email-alert-seen-all"
          onClick={markAll}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <CheckCheck className="h-4 w-4" /> Marcar como visto
        </button>
      </div>
    </div>
  );
}

function MobileBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 via-red-500 to-amber-400 text-sm font-black text-white shadow-[0_8px_20px_-8px_rgba(239,68,68,0.85)] ring-1 ring-white/20">
        B
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-heading text-sm font-extrabold text-white">
          BRICO OS
        </p>
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
          Sistema da loja
        </p>
      </div>
    </div>
  );
}

function MobileNavigation({
  onNavigate,
  onOpenSearch,
  onOpenActivity,
  onOpenTrash,
}) {
  const { status } = useSystemStatus();

  const badgeFor = (path) => {
    if (!status) return 0;
    if (path === "/") return status.pedidos_ativos || 0;
    if (path === "/emails") return status.emails_nao_vistos || 0;
    if (path === "/tarefas") return status.tarefas_pendentes || 0;
    return 0;
  };

  return (
    <>
      <MobileBrand />
      <button
        type="button"
        onClick={onOpenSearch}
        className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-left text-sm text-white/50"
      >
        <Search className="h-4 w-4" />{" "}
        <span className="flex-1">Pesquisar tudo</span>
        <Kbd className="border-white/10 bg-white/10 text-[9px] text-white/40">
          ⌘K
        </Kbd>
      </button>
      <nav className="scroll-chrome mt-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="engraved px-3 pb-2">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = badgeFor(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    data-testid={item.testid}
                    onClick={() => {
                      haptics.tap();
                      onNavigate?.();
                    }}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all ${isActive ? "bg-white text-black shadow-lg" : "text-white/55 hover:bg-white/[0.07] hover:text-white"}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`h-[18px] w-[18px] ${isActive ? "text-red-600" : ""}`}
                        />
                        <span className="flex-1">{item.shortTitle}</span>
                        {count ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-black ${isActive ? "bg-red-600 text-white" : "bg-white/10 text-white/60"}`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenActivity}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-bold text-white/55"
        >
          <Activity className="h-4 w-4" /> Atividade
        </button>
        <button
          type="button"
          onClick={onOpenTrash}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-bold text-white/55"
        >
          <Trash2 className="h-4 w-4" /> Lixeira
        </button>
      </div>
    </>
  );
}

const SHORTCUTS = [
  {
    kind: "route",
    target: "/",
    label: "Pedidos",
    icon: ClipboardList,
    color: "from-slate-700 to-black",
  },
  {
    kind: "route",
    target: "/emails",
    label: "Correio",
    icon: Mail,
    color: "from-sky-500 to-blue-700",
  },
  {
    kind: "panel",
    target: "explorer",
    label: "Explorador",
    icon: FolderTree,
    color: "from-amber-400 to-orange-600",
  },
  {
    kind: "panel",
    target: "downloads",
    label: "Downloads",
    icon: FolderDown,
    color: "from-emerald-500 to-teal-700",
  },
];

function DesktopSurface({ visible, onOpenRoute, onOpenPanel, onOpenLauncher }) {
  return (
    <div
      className="os-desktop-surface fixed inset-0 z-0 hidden overflow-hidden lg:block"
      aria-hidden={!visible}
    >
      <div
        aria-hidden="true"
        className="os-wallpaper-mark absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 select-none text-center"
      >
        <p className="font-heading text-[clamp(4rem,10vw,10rem)] font-black tracking-[-0.08em] text-white/[0.035]">
          BRICO
        </p>
        <p className="-mt-5 text-[10px] font-black uppercase tracking-[0.7em] text-white/[0.10]">
          store operating system
        </p>
      </div>

      {visible ? (
        <>
          <div className="absolute left-5 top-20 grid grid-cols-1 gap-2.5">
            {SHORTCUTS.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <button
                  type="button"
                  key={`${shortcut.kind}-${shortcut.target}`}
                  onClick={() =>
                    shortcut.kind === "route"
                      ? onOpenRoute(shortcut.target)
                      : onOpenPanel(shortcut.target)
                  }
                  className="group flex w-24 flex-col items-center gap-1.5 rounded-2xl p-2 text-center text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:bg-white/10"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/20 bg-gradient-to-br ${shortcut.color} text-white shadow-[0_16px_28px_-13px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.22)] transition-transform group-hover:scale-105`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate text-[11px] font-bold drop-shadow-md">
                    {shortcut.label}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onOpenLauncher}
              className="group flex w-24 flex-col items-center gap-1.5 rounded-2xl p-2 text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <span className="grid h-12 w-12 grid-cols-2 place-content-center gap-1 rounded-[16px] border border-white/15 bg-white/[0.08] p-3 shadow-xl backdrop-blur-xl">
                {[0, 1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`h-2.5 w-2.5 rounded-[4px] ${n === 0 ? "bg-red-500" : n === 3 ? "bg-amber-400" : "bg-white/70"}`}
                  />
                ))}
              </span>
              <span className="text-[11px] font-bold">Aplicações</span>
            </button>
          </div>

          <div
            className="absolute right-5 top-20 w-72 animate-fade-up"
            style={{ "--stagger-i": 1 }}
          >
            <StatusCluster variant="desktop" />
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-white shadow-2xl backdrop-blur-xl">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">
                Área de trabalho
              </p>
              <p className="mt-2 text-sm font-bold">Tudo pronto, Tiago.</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                Abre uma aplicação no dock ou usa ⌘K para encontrar qualquer
                elemento da loja.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PrimaryRouteWindow({
  app,
  minimized,
  maximized,
  onClose,
  onMinimize,
  onToggleMaximize,
  onOpenSearch,
  children,
}) {
  const Icon = app.icon;
  if (minimized) return null;

  return (
    <main
      data-testid="primary-app-window"
      className={`os-primary-window fixed z-20 hidden flex-col overflow-hidden border bg-white shadow-[0_35px_90px_-28px_rgba(0,0,0,0.72)] lg:flex ${maximized ? "inset-x-0 bottom-[88px] top-12 rounded-none border-x-0 border-t-0" : "bottom-[98px] left-4 right-4 top-16 rounded-[22px] border-black/20"}`}
    >
      <div
        data-testid="primary-window-titlebar"
        className="os-primary-titlebar flex h-11 shrink-0 items-center border-b border-black/35 px-3"
      >
        <div
          className="group mr-3 flex items-center gap-2"
          aria-label="Controlos da janela"
        >
          <button
            type="button"
            onClick={onClose}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/25"
            title="Fechar e mostrar o ambiente de trabalho"
          >
            <X
              className="h-2.5 w-2.5 text-black/0 group-hover:text-black/60"
              strokeWidth={3}
            />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#febc2e] ring-1 ring-black/25"
            title="Minimizar"
          >
            <Minus
              className="h-2.5 w-2.5 text-black/0 group-hover:text-black/60"
              strokeWidth={3}
            />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#28c840] ring-1 ring-black/25"
            title={maximized ? "Restaurar" : "Maximizar"}
          >
            <Maximize2
              className="h-2 w-2 text-black/0 group-hover:text-black/55"
              strokeWidth={3}
            />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08] text-white/75">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 leading-none">
            <p className="truncate text-[11px] font-extrabold text-white/90">
              {app.title}
            </p>
            <p className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/25">
              BRICO OS
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[9px] font-bold text-white/40 2xl:flex">
            <span className="led led-ok" /> Sincronizado
          </span>
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-7 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 text-[10px] font-bold text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <Search className="h-3 w-3" /> Pesquisar{" "}
            <span className="font-mono text-[8px]">⌘K</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[hsl(var(--background))]">
        <div className="mx-auto w-full max-w-[1760px] p-5 sm:p-7 xl:p-9">
          {children}
        </div>
      </div>
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-3 text-[9px] font-bold text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="led led-ok" /> Aplicação pronta
        </span>
        <span className="font-mono">BRICO OS · {app.shortTitle}</span>
      </div>
    </main>
  );
}

function AppLauncherOverlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      data-testid="app-launcher-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Aplicações"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] hidden items-center justify-center bg-black/55 p-8 backdrop-blur-xl animate-scale-in lg:flex"
    >
      <div className="os-launcher-panel w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/15 bg-[#111]/90 shadow-[0_45px_120px_-30px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="font-heading text-xl font-extrabold text-white">
              Aplicações
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/35">
              Ferramentas da loja e janelas de trabalho
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-6 sm:p-8">
          <AppLauncher variant="launcher" onLaunch={onClose} />
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25">
          <span>Arrasta para reordenar</span>
          <span>Esc para fechar</span>
        </div>
      </div>
    </div>
  );
}

function LayoutInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { panels, activeId, openPanel, showDesktop } = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [missionControlOpen, setMissionControlOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [primaryMinimized, setPrimaryMinimized] = useState(false);
  const [primaryMaximized, setPrimaryMaximized] = useState(false);

  const activeRouteApp = useMemo(
    () => getRouteApp(location.pathname),
    [location.pathname],
  );
  const activeFloatingPanel = panels.find(
    (panel) => panel.id === activeId && !panel.minimized,
  );
  const activeSystemApp = activeFloatingPanel
    ? PANEL_TYPES[activeFloatingPanel.type]
    : primaryMinimized
      ? null
      : activeRouteApp;

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "h" &&
        isDesktop
      ) {
        event.preventDefault();
        setPrimaryMinimized(true);
        showDesktop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, showDesktop]);

  useEffect(() => {
    if (isDesktop) setMobileNavOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    setPrimaryMinimized(false);
  }, [location.pathname]);

  const openRoute = useCallback(
    (path) => {
      setPrimaryMinimized(false);
      if (location.pathname !== path) navigate(path);
    },
    [location.pathname, navigate],
  );

  const showDesktopNow = useCallback(() => {
    setPrimaryMinimized(true);
    showDesktop();
  }, [showDesktop]);

  return (
    <div
      className={
        isDesktop
          ? "os-shell h-screen overflow-hidden text-foreground"
          : "min-h-screen bg-background text-foreground"
      }
    >
      {isDesktop ? (
        <>
          <SystemBar
            activeApp={activeSystemApp}
            onOpenLauncher={() => setLauncherOpen(true)}
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenActivity={() => setActivityOpen(true)}
            onOpenTrash={() => setTrashOpen(true)}
            onOpenMissionControl={() => setMissionControlOpen(true)}
          />
          <DesktopSurface
            visible={
              primaryMinimized && !panels.some((panel) => !panel.minimized)
            }
            onOpenRoute={openRoute}
            onOpenPanel={openPanel}
            onOpenLauncher={() => setLauncherOpen(true)}
          />
          <PrimaryRouteWindow
            app={activeRouteApp}
            minimized={primaryMinimized}
            maximized={primaryMaximized}
            onClose={showDesktopNow}
            onMinimize={() => setPrimaryMinimized(true)}
            onToggleMaximize={() => setPrimaryMaximized((value) => !value)}
            onOpenSearch={() => setPaletteOpen(true)}
          >
            <SupplierEmailAlert />
            <div key={location.pathname} className="animate-page-enter">
              <Outlet />
            </div>
          </PrimaryRouteWindow>
          <DesktopWorkspace
            missionControlOpen={missionControlOpen}
            onMissionControlOpenChange={setMissionControlOpen}
            onOpenLauncher={() => setLauncherOpen(true)}
            onShowDesktop={showDesktopNow}
            onOpenRoute={openRoute}
            primaryWindow={{
              title: activeRouteApp.title,
              icon: activeRouteApp.icon,
              minimized: primaryMinimized,
              onFocus: () => setPrimaryMinimized(false),
            }}
          />
        </>
      ) : (
        <>
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent
              side="left"
              className="os-chrome flex w-[86vw] max-w-sm flex-col gap-0 border-r border-white/[0.08] p-5 pr-10 pt-6 text-white"
            >
              <MobileNavigation
                onNavigate={() => setMobileNavOpen(false)}
                onOpenSearch={() => {
                  setMobileNavOpen(false);
                  setPaletteOpen(true);
                }}
                onOpenActivity={() => {
                  setMobileNavOpen(false);
                  setActivityOpen(true);
                }}
                onOpenTrash={() => {
                  setMobileNavOpen(false);
                  setTrashOpen(true);
                }}
              />
            </SheetContent>
          </Sheet>
          <header className="os-chrome-flat sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                data-testid="mobile-nav-btn"
                onClick={() => setMobileNavOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/65 hover:bg-white/10 hover:text-white"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <MobileBrand />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-testid="mobile-search-btn"
                onClick={() => setPaletteOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Pesquisar"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <NotificationsBell variant="mobile" />
            </div>
          </header>
          <main className="px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-7">
            <div
              key={location.pathname}
              className="mx-auto w-full max-w-6xl animate-page-enter"
            >
              <SupplierEmailAlert />
              <Outlet />
            </div>
          </main>
        </>
      )}

      <AppLauncherOverlay
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
      />
      <InstallPwaBanner />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ActivityCenter open={activityOpen} onOpenChange={setActivityOpen} />
      <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} />
    </div>
  );
}

export default function Layout() {
  return (
    <FavoritesProvider>
      <WorkspaceProvider>
        <SystemStatusProvider>
          <LayoutInner />
        </SystemStatusProvider>
      </WorkspaceProvider>
    </FavoritesProvider>
  );
}
