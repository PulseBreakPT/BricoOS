import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Check,
  CheckCheck,
  ClipboardList,
  Download,
  FileText,
  FolderDown,
  FolderTree,
  LayoutGrid,
  ListChecks,
  Lock,
  Mail,
  Maximize2,
  Minus,
  MonitorUp,
  Palette,
  Plus,
  Search,
  Share,
  SquarePlus,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import BrandMark from "@/components/BrandMark";
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
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DesktopWorkspace from "@/components/workspace/DesktopWorkspace";
import CommandPalette from "@/components/workspace/CommandPalette";
import ControlDeck from "@/components/workspace/ControlDeck";
import DesktopOperationsRail from "@/components/workspace/DesktopOperationsRail";
import MobileHomeSurface from "@/components/workspace/MobileHomeSurface";
import MobileSystemDock from "@/components/workspace/MobileSystemDock";
import OperationalRibbon from "@/components/workspace/OperationalRibbon";
import SystemBar from "@/components/workspace/SystemBar";
import BootSplash from "@/components/workspace/BootSplash";
import DesktopWidgets from "@/components/workspace/DesktopWidgets";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  WALLPAPERS,
  getWallpaperId,
  persistWallpaperId,
  wallpaperStyle,
  lockScreen,
} from "@/lib/osShell";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import { haptics } from "@/lib/haptics";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { toast } from "sonner";

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
    path: "/grupos-tarefas",
    title: "Grupos de Tarefas",
    shortTitle: "Grupos",
    icon: FolderTree,
    testid: "nav-grupos-tarefas",
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
    items: [ROUTE_APPS[3], ROUTE_APPS[4], ROUTE_APPS[6], ROUTE_APPS[5]],
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
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    // O intervalo de 45s, o foco da janela e as chamadas explícitas de
    // openItem/markAll podem sobrepor-se — sem sequência, uma resposta mais
    // lenta e antiga podia repor a contagem para um valor já ultrapassado.
    const seq = ++loadSeq.current;
    try {
      const { data: response } = await api.get("/emails/unseen");
      if (seq === loadSeq.current) setData(response);
    } catch {
      /* o sistema volta a tentar na próxima verificação */
    }
  }, []);

  useEffect(() => {
    load();
    // Só vale a pena verificar com a aba visível — poupa pedidos quando a
    // app fica horas ao fundo numa aba esquecida.
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 45000);
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

function MobileBrand({ activeApp }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark className="h-9 w-9 rounded-xl" />
      <div className="mobile-brand-copy min-w-0 leading-tight">
        <p className="truncate font-heading text-sm font-extrabold text-foreground">
          BRICO OS
        </p>
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {activeApp?.shortTitle || "Sistema da loja"}
        </p>
      </div>
    </div>
  );
}

function MobileNavigation({
  onNavigate,
  onShowHome,
  homeVisible,
  onOpenSearch,
  onOpenActivity,
  onOpenTrash,
}) {
  const { status } = useSystemStatus();
  const { showInstallOption, install } = usePwaInstall();
  const [iosStepsOpen, setIosStepsOpen] = useState(false);

  const badgeFor = (path) => {
    if (!status) return 0;
    if (path === "/") return status.pedidos_ativos || 0;
    if (path === "/emails") return status.emails_nao_vistos || 0;
    if (path === "/tarefas") return status.tarefas_pendentes || 0;
    return 0;
  };

  const handleInstall = async () => {
    haptics.tap();
    const outcome = await install();
    if (outcome === "ios-instructions") {
      setIosStepsOpen((v) => !v);
    } else if (outcome === "unavailable") {
      toast.info("Ainda não é possível instalar automaticamente. Recarrega a página ou usa o menu do navegador (⋮) e escolhe \"Instalar aplicação\".");
    } else if (outcome === "accepted") {
      setIosStepsOpen(false);
      toast.success("BRICO OS instalado!");
    }
  };

  return (
    <>
      <MobileBrand />
      <button
        type="button"
        onClick={onOpenSearch}
        className="mt-5 flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-muted px-3.5 text-left text-sm text-muted-foreground transition-colors hover:border-input hover:bg-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" />{" "}
        <span className="flex-1">Pesquisar tudo</span>
        <Kbd className="border-border bg-muted text-[9px] text-muted-foreground">
          ⌘K
        </Kbd>
      </button>
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          onShowHome?.();
        }}
        className={`mt-3 flex min-h-12 items-center gap-3 rounded-2xl border px-3.5 text-left text-sm font-bold transition-colors ${homeVisible ? "border-foreground bg-foreground text-background shadow-[0_12px_28px_-14px_rgba(0,0,0,0.35)]" : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"}`}
      >
        <MonitorUp
          className={`h-[18px] w-[18px] ${homeVisible ? "text-red-600" : ""}`}
        />
        <span className="flex-1">Ambiente de trabalho</span>
        <span className="led led-ok" />
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
                      onNavigate?.(item.path);
                    }}
                    className={({ isActive }) =>
                      `relative flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition-all ${isActive && !homeVisible ? "bg-foreground text-background shadow-[0_12px_28px_-14px_rgba(0,0,0,0.35)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`h-[18px] w-[18px] ${isActive && !homeVisible ? "text-red-600" : ""}`}
                        />
                        <span className="flex-1">{item.shortTitle}</span>
                        {count ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-black ${isActive && !homeVisible ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}
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
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Activity className="h-4 w-4" /> Atividade
        </button>
        <button
          type="button"
          onClick={onOpenTrash}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" /> Lixeira
        </button>
      </div>
      {showInstallOption ? (
        <div className="mt-2">
          <button
            type="button"
            data-testid="mobile-nav-install"
            onClick={handleInstall}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Download className="h-4 w-4" /> Instalar aplicação
          </button>
          {iosStepsOpen ? (
            <div className="mt-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toca em "Partilhar" na barra do Safari
              </p>
              <p className="mt-1.5 flex items-center gap-1.5">
                <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolhe "Adicionar ao Ecrã Principal"
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* Atalhos do ambiente de trabalho — apenas ferramentas que NÃO existem no
   dock (painéis de sistema). As aplicações de rota (Pedidos, Correio, etc.)
   e o lançador vivem exclusivamente no dock, sem ícones duplicados. */
const SHORTCUTS = [
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

function DesktopSurface({
  visible,
  onOpenPanel,
  onOpenRoute,
  onMissionControl,
  wallpaperId,
  onWallpaperChange,
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="os-desktop-surface fixed inset-0 z-0 hidden overflow-hidden lg:block"
          aria-hidden={!visible}
          style={wallpaperStyle(wallpaperId)}
        >
      <div
        aria-hidden="true"
        className="os-wallpaper-mark absolute left-[44%] top-[46%] -translate-x-1/2 -translate-y-1/2 select-none text-center"
      >
        <p className="font-heading text-[clamp(4rem,9vw,9rem)] font-black tracking-[-0.08em] text-neutral-900/[0.05]">
          BRICO/OS
        </p>
        <p className="-mt-5 text-[9px] font-black uppercase tracking-[0.72em] text-neutral-900/[0.16]">
          operations workstation
        </p>
      </div>

      <div
        aria-hidden="true"
        className="absolute bottom-28 left-6 font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-neutral-900/25"
      >
        Workspace 01 · Grid 48 · PT
      </div>
      <div
        aria-hidden="true"
        className="absolute right-7 top-20 font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-neutral-900/25"
      >
        Live surface · 2026
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
                  onClick={() => onOpenPanel(shortcut.target)}
                  className="group flex w-24 flex-col items-center gap-1.5 rounded-2xl p-2 text-center text-neutral-700 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900 focus-visible:bg-neutral-900/[0.06]"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/25 bg-gradient-to-br ${shortcut.color} text-white shadow-[0_16px_28px_-13px_rgba(16,17,20,0.4),inset_0_1px_0_rgba(255,255,255,0.22)] transition-transform group-hover:scale-105`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate text-[11px] font-bold">
                    {shortcut.label}
                  </span>
                </button>
              );
            })}
          </div>

          <DesktopWidgets onOpenRoute={onOpenRoute} />
        </>
      ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60" data-testid="desktop-context-menu">
        <ContextMenuItem
          data-testid="ctx-new-pedido"
          onClick={() => onOpenRoute?.("/?new=1")}
        >
          <Plus className="mr-2 h-4 w-4" /> Novo pedido
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenRoute?.("/tarefas")}>
          <ListChecks className="mr-2 h-4 w-4" /> Nova tarefa
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onOpenPanel("explorer")}>
          <FolderTree className="mr-2 h-4 w-4" /> Abrir Explorador
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onOpenPanel("downloads")}>
          <FolderDown className="mr-2 h-4 w-4" /> Abrir Downloads
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onMissionControl}>
          <LayoutGrid className="mr-2 h-4 w-4" /> Ver todas as janelas
          <span className="ml-auto font-mono text-[9px] font-bold text-muted-foreground">
            F3
          </span>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" /> Fundo do ambiente
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            {WALLPAPERS.map((wp) => (
              <ContextMenuItem
                key={wp.id}
                data-testid={`ctx-wallpaper-${wp.id}`}
                onClick={() => onWallpaperChange?.(wp.id)}
              >
                <span
                  className="mr-2 h-4 w-6 shrink-0 rounded border border-neutral-900/10"
                  style={{ background: wp.swatch }}
                />
                <span className="flex-1">{wp.name}</span>
                {wallpaperId === wp.id ? (
                  <Check className="h-3.5 w-3.5 text-red-600" />
                ) : null}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          data-testid="ctx-lock"
          onClick={lockScreen}
          className="text-red-600 focus:text-red-600"
        >
          <Lock className="mr-2 h-4 w-4" /> Bloquear ecrã
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function PrimaryRouteWindow({
  app,
  minimized,
  maximized,
  onClose,
  onMinimize,
  onToggleMaximize,
  onOpenRoute,
  children,
}) {
  const Icon = app.icon;
  if (minimized) return null;

  return (
    <main
      data-testid="primary-app-window"
      className={`os-primary-window themed-surface fixed z-20 hidden flex-col overflow-hidden border border-neutral-900/[0.1] bg-white shadow-[0_38px_100px_-30px_rgba(16,17,20,0.4)] lg:flex ${maximized ? "os-primary-window-maximized rounded-[18px]" : "os-primary-window-windowed rounded-[26px]"}`}
    >
      <div
        data-testid="primary-window-titlebar"
        className="os-primary-titlebar flex h-[52px] shrink-0 items-center border-b border-neutral-900/[0.08] px-3.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="os-window-app-icon flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-900/10 text-neutral-700">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-extrabold text-neutral-900">
              {app.title}
            </p>
            <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-neutral-400">
              BRICO OS / {app.shortTitle}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden h-7 items-center gap-1.5 rounded-full border border-neutral-900/10 bg-neutral-900/[0.03] px-2.5 text-[9px] font-bold text-neutral-500 xl:flex">
            <span className="led led-ok" /> Sincronizado
          </span>
          <span className="mx-0.5 h-5 w-px bg-neutral-900/10" aria-hidden="true" />
          <div className="flex items-center gap-0.5" aria-label="Controlos da janela">
            <button
              type="button"
              onClick={onMinimize}
              className="os-window-control"
              title="Minimizar"
              aria-label="Minimizar"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={onToggleMaximize}
              className="os-window-control"
              title={maximized ? "Restaurar" : "Maximizar"}
              aria-label={maximized ? "Restaurar" : "Maximizar"}
            >
              <Maximize2 className="h-3 w-3" strokeWidth={2.1} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="os-window-control os-window-control-danger"
              title="Fechar e mostrar o ambiente de trabalho"
              aria-label="Fechar e mostrar o ambiente de trabalho"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
      <OperationalRibbon app={app} onOpenRoute={onOpenRoute} />
      <div className="os-work-surface min-h-0 flex-1 overflow-auto overscroll-contain bg-[hsl(var(--background))]">
        <div className="os-app-content mx-auto w-full p-5 sm:p-7 xl:p-8">
          {children}
        </div>
      </div>
      <div className="os-window-status flex h-7 shrink-0 items-center justify-between border-t border-slate-200/80 bg-white px-3.5 text-[9px] font-bold text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="led led-ok" /> Aplicação pronta
        </span>
        <span className="hidden items-center gap-3 font-mono sm:flex">
          <span>⌘K pesquisar</span>
          <span className="text-slate-300">/</span>
          <span>BRICO OS · {app.shortTitle}</span>
        </span>
      </div>
    </main>
  );
}

function AppLauncherOverlay({
  open,
  onClose,
  onOpenRoute,
  onOpenSearch,
  onOpenActivity,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
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
      className="control-deck-overlay fixed inset-0 z-[80] hidden items-center justify-center p-3 backdrop-blur-2xl animate-scale-in sm:p-6 lg:flex"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="os-launcher-panel w-full max-w-[min(1120px,calc(100vw-1.5rem))] overflow-hidden rounded-[24px] border border-neutral-900/10 shadow-[0_50px_140px_-32px_rgba(16,17,20,0.5)] outline-none sm:rounded-[30px]"
      >
        <div className="control-deck-header flex items-center justify-between border-b border-neutral-900/[0.08] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-9 w-9 rounded-xl" />
            <span className="min-w-0">
              <span className="block font-heading text-lg font-extrabold tracking-tight text-neutral-900">
                Control Deck
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-black uppercase tracking-[0.18em] text-neutral-400">
                Aplicações · ferramentas · turno
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-neutral-900/10 bg-neutral-900/[0.03] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-400 sm:block">
              Esc para fechar
            </span>
          <button
            type="button"
            onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-900/10 text-neutral-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
        <div className="scroll-chrome max-h-[min(78vh,760px)] overflow-auto">
          <ControlDeck
            onClose={onClose}
            onOpenRoute={onOpenRoute}
            onOpenSearch={onOpenSearch}
            onOpenActivity={onOpenActivity}
          />
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
  const [wallpaperId, setWallpaperId] = useState(() => getWallpaperId());
  const [homeVisible, setHomeVisible] = useState(true);
  const [primaryMinimized, setPrimaryMinimized] = useState(true);
  const [primaryMaximized, setPrimaryMaximized] = useState(false);
  const lastLocation = useRef(`${location.pathname}${location.search}`);

  const activeRouteApp = useMemo(
    () => getRouteApp(location.pathname),
    [location.pathname],
  );
  const activeFloatingPanel = panels.find(
    (panel) => panel.id === activeId && !panel.minimized,
  );
  const activeSystemApp = activeFloatingPanel
    ? PANEL_TYPES[activeFloatingPanel.type]
    : homeVisible || primaryMinimized
      ? null
      : activeRouteApp;

  useEffect(() => {
    // Cada nova sessão começa numa secretária limpa, mesmo que existam
    // janelas persistidas de um turno anterior.
    showDesktop();
  }, [showDesktop]);

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
        setHomeVisible(true);
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

  // Sinaliza ao CSS quando a janela principal está maximizada (o rail
  // LiveOps esconde-se) para o botão + e a faixa de sinais se reposicionarem
  // corretamente em ecrãs largos.
  useEffect(() => {
    const maxed = isDesktop && primaryMaximized;
    document.body.classList.toggle("os-window-max", maxed);
    return () => document.body.classList.remove("os-window-max");
  }, [isDesktop, primaryMaximized]);

  useEffect(() => {
    const currentLocation = `${location.pathname}${location.search}`;
    if (lastLocation.current === currentLocation) return;
    lastLocation.current = currentLocation;
    setHomeVisible(false);
    setPrimaryMinimized(false);
  }, [location.pathname, location.search]);

  const openRoute = useCallback(
    (path) => {
      setHomeVisible(false);
      setPrimaryMinimized(false);
      if (location.pathname !== path) navigate(path);
    },
    [location.pathname, navigate],
  );

  const showDesktopNow = useCallback(() => {
    setHomeVisible(true);
    setPrimaryMinimized(true);
    showDesktop();
  }, [showDesktop]);

  const changeWallpaper = useCallback((id) => {
    setWallpaperId(id);
    persistWallpaperId(id);
  }, []);

  return (
    <div
      className={
        isDesktop
          ? "os-shell h-screen overflow-hidden text-foreground"
          : "min-h-screen bg-background text-foreground"
      }
    >
      <BootSplash />
      {isDesktop ? (
        <>
          <SystemBar
            activeApp={activeSystemApp}
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenActivity={() => setActivityOpen(true)}
            onOpenTrash={() => setTrashOpen(true)}
            wallpaperId={wallpaperId}
            onWallpaperChange={changeWallpaper}
          />
          <DesktopSurface
            visible={homeVisible}
            onOpenPanel={openPanel}
            onOpenRoute={openRoute}
            onMissionControl={() => setMissionControlOpen(true)}
            wallpaperId={wallpaperId}
            onWallpaperChange={changeWallpaper}
          />
          <PrimaryRouteWindow
            app={activeRouteApp}
            minimized={homeVisible || primaryMinimized}
            maximized={primaryMaximized}
            onClose={showDesktopNow}
            onMinimize={showDesktopNow}
            onToggleMaximize={() => setPrimaryMaximized((value) => !value)}
            onOpenRoute={openRoute}
          >
            <SupplierEmailAlert />
            <div key={location.pathname} className="animate-page-enter">
              <Outlet />
            </div>
          </PrimaryRouteWindow>
          <DesktopOperationsRail
            app={homeVisible ? null : activeRouteApp}
            visible={!primaryMaximized}
            onOpenRoute={openRoute}
          />
          <DesktopWorkspace
            missionControlOpen={missionControlOpen}
            onMissionControlOpenChange={setMissionControlOpen}
            onOpenLauncher={() => setLauncherOpen(true)}
            onShowDesktop={showDesktopNow}
            onOpenRoute={openRoute}
            homeVisible={homeVisible}
            primaryWindow={{
              title: activeRouteApp.title,
              icon: activeRouteApp.icon,
              minimized: homeVisible || primaryMinimized,
              onFocus: () => {
                setHomeVisible(false);
                setPrimaryMinimized(false);
              },
            }}
          />
        </>
      ) : (
        <div className="mobile-os-shell min-h-dvh text-foreground">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent
              side="left"
              className="os-mobile-drawer os-chrome flex w-[86vw] max-w-sm flex-col gap-0 border-r border-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pr-10 pt-[calc(1.5rem+env(safe-area-inset-top))]"
            >
              <SheetTitle className="sr-only">
                Aplicações e ferramentas
              </SheetTitle>
              <SheetDescription className="sr-only">
                Navega pelas aplicações principais ou abre as ferramentas do
                sistema.
              </SheetDescription>
              <MobileNavigation
                homeVisible={homeVisible}
                onNavigate={(path) => {
                  setMobileNavOpen(false);
                  openRoute(path);
                }}
                onShowHome={() => {
                  setMobileNavOpen(false);
                  showDesktopNow();
                }}
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
          <header className="mobile-os-header sticky top-0 z-30 p-2 pb-0 pt-[calc(0.5rem+env(safe-area-inset-top))]">
            <div className="mobile-os-island flex items-center justify-between gap-2 rounded-[22px] border border-border px-3 py-2 shadow-[0_16px_38px_-18px_rgba(16,17,20,0.3)]">
              <MobileBrand activeApp={homeVisible ? null : activeRouteApp} />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-testid="mobile-search-btn"
                  onClick={() => setPaletteOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Pesquisar"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
                <NotificationsBell variant="mobile" />
              </div>
            </div>
            {!homeVisible ? (
              <OperationalRibbon
                app={activeRouteApp}
                variant="mobile"
                onOpenRoute={openRoute}
              />
            ) : null}
          </header>
          <main className="mobile-workspace px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-6">
            {homeVisible ? (
              <MobileHomeSurface
                onOpenRoute={openRoute}
                onOpenActivity={() => setActivityOpen(true)}
              />
            ) : (
              <div
                key={`${location.pathname}${location.search}`}
                className="mx-auto w-full max-w-7xl animate-page-enter"
              >
                <SupplierEmailAlert />
                <Outlet />
              </div>
            )}
          </main>
          <MobileSystemDock
            homeVisible={homeVisible}
            onShowHome={showDesktopNow}
            onOpenRoute={openRoute}
            moreOpen={mobileNavOpen}
            onOpenMore={() => setMobileNavOpen(true)}
          />
        </div>
      )}

      <AppLauncherOverlay
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        onOpenRoute={openRoute}
        onOpenSearch={() => setPaletteOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
      />
      <InstallPwaBanner />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onLaunch={() => {
          setHomeVisible(false);
          setPrimaryMinimized(false);
        }}
      />
      <ActivityCenter open={activityOpen} onOpenChange={setActivityOpen} />
      <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} />
    </div>
  );
}

export default function Layout() {
  return (
    <WorkspaceProvider>
      <SystemStatusProvider>
        <LayoutInner />
      </SystemStatusProvider>
    </WorkspaceProvider>
  );
}
