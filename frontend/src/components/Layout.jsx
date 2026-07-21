import { useEffect, useState, useCallback } from "react";
import { NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { ClipboardList, Truck, ListChecks, BarChart3, BookOpenCheck, Hammer, Mail, CheckCheck, FileText, User, Search, Sparkles, Activity, Trash2, Menu, Grid2x2 } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import NotificationsBell from "@/components/NotificationsBell";
import InstallPwaBanner from "@/components/InstallPwaBanner";
import ActivityCenter from "@/components/ActivityCenter";
import TrashPanel from "@/components/TrashPanel";
import api from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { SystemStatusProvider, useSystemStatus } from "@/context/SystemStatusContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DesktopWorkspace from "@/components/workspace/DesktopWorkspace";
import CommandPalette from "@/components/workspace/CommandPalette";
import AppLauncher from "@/components/workspace/AppLauncher";
import WorkspaceMenu from "@/components/workspace/WorkspaceMenu";
import StatusCluster from "@/components/workspace/StatusCluster";

// Aviso global, impossível de ignorar mas elegante: aparece em TODAS as
// páginas sempre que chega um email associado a um pedido — de um fornecedor
// OU de um cliente que respondeu — até ser marcado como visto. Verificado a
// cada 45s e ao voltar à janela. Visual: é o próprio sistema a falar, por
// isso veste o chrome grafite da máquina com o vermelho reservado ao sinal.
function SupplierEmailAlert() {
  const [data, setData] = useState({ count: 0, items: [] });
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/emails/unseen");
      setData(d);
    } catch { /* sem rede/backend — o aviso volta na próxima verificação */ }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 45000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);

  if (!data.count) return null;

  const openItem = async (m) => {
    try { await api.post(`/emails/${m.id}/seen`); } catch { /* segue na mesma */ }
    await load();
    if (m.note_id) navigate(`/?open=${m.note_id}&tab=${m.reply_kind === "client" ? "cronologia" : "orcamentos"}`);
    else navigate("/fornecedores");
  };
  const allClient = data.items.length > 0 && data.items.every((m) => m.reply_kind === "client");
  const markAll = async () => {
    try { await api.post("/emails/seen-all"); } catch { /* noop */ }
    await load();
  };

  return (
    <div
      data-testid="supplier-email-alert"
      className="os-chrome relative mb-5 animate-scale-in overflow-hidden rounded-2xl border border-white/10 p-4 shadow-[0_24px_60px_-18px_rgba(16,17,20,0.5)] sm:p-5"
    >
      {/* Barra de sinal — o vermelho marca a margem, como uma luz de aviso. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-700" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-red-600/15 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-[0_8px_20px_-6px_rgba(217,38,38,0.6)] sm:h-12 sm:w-12">
            <Mail className="h-6 w-6" strokeWidth={2.4} />
            <span className="led led-alert absolute -right-1 -top-1 ring-2 ring-[color:var(--chrome)]" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg font-extrabold leading-tight text-white sm:text-2xl">
              {data.count === 1
                ? (allClient ? "O cliente respondeu!" : "Recebeu 1 novo email!")
                : (allClient ? `${data.count} clientes responderam!` : `Recebeu ${data.count} novos emails!`)}
            </p>
            <div className="mt-2.5 space-y-1.5">
              {data.items.slice(0, 3).map((m) => (
                <button
                  key={m.id}
                  data-testid={`email-alert-${m.id}`}
                  onClick={() => openItem(m)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-white transition-all duration-150 hover:translate-x-1 hover:border-white/20 hover:bg-white/[0.12] active:scale-[0.98]"
                >
                  {m.reply_kind === "client" ? <User className="h-4 w-4 shrink-0 text-red-400" title="Cliente" /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {m.supplier_name || m.from_name || m.from_email}
                    <span className="ml-1.5 font-semibold text-white/60">{m.subject || "(sem assunto)"}</span>
                  </span>
                  {m.has_pdf ? <FileText className="h-4 w-4 shrink-0 text-white/50" title="Com PDF em anexo" /> : null}
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-white/45">{timeAgo(m.received_at)}</span>
                </button>
              ))}
              {data.count > 3 ? (
                <p className="text-xs font-bold text-white/50">… e mais {data.count - 3}.</p>
              ) : null}
            </div>
          </div>
        </div>
        <button
          data-testid="email-alert-seen-all"
          onClick={markAll}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-[color:var(--chrome-deep)] shadow-lg transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <CheckCheck className="h-4 w-4" /> Marcar tudo como visto
        </button>
      </div>
    </div>
  );
}

// Navegação agrupada por intenção: primeiro o trabalho do dia-a-dia,
// depois a organização e análise. Menos procura, mais fluxo. Idêntica no
// desktop (sidebar fixa) e no telemóvel (gaveta lateral) — um só menu, só
// que apresentado de duas formas.
const NAV_GROUPS = [
  {
    label: "Operação",
    items: [
      { to: "/", label: "Pedidos", icon: ClipboardList, testid: "nav-clientes", end: true },
      { to: "/fornecedores", label: "Fornecedores", icon: Truck, testid: "nav-fornecedores" },
      { to: "/emails", label: "Emails", icon: Mail, testid: "nav-emails" },
    ],
  },
  {
    label: "Organização",
    items: [
      { to: "/catalogo-tecnico", label: "Catálogo técnico", icon: BookOpenCheck, testid: "nav-catalogo" },
      { to: "/tarefas", label: "Tarefas", icon: ListChecks, testid: "nav-tarefas" },
      { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, testid: "nav-estatisticas" },
    ],
  },
];

const TIPS = [
  { k: "N", t: "novo pedido" },
  { k: "/", t: "procurar na lista" },
  { k: "F", t: "modo de foco" },
  { k: "⌘K", t: "pesquisa global" },
];

// Badge de atividade em tempo real por rota — o dock mostra o que está à
// espera sem ser preciso abrir nada: pedidos ativos, emails por ver,
// tarefas por fazer. Contagens vêm do polling único do SystemStatusContext.
function navBadge(status, to) {
  if (!status) return 0;
  if (to === "/") return status.pedidos_ativos || 0;
  if (to === "/emails") return status.emails_nao_vistos || 0;
  if (to === "/tarefas") return status.tarefas_pendentes || 0;
  return 0;
}

function NavBadge({ count, active }) {
  if (!count) return null;
  return (
    <span className={`pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-black ring-2 ring-[color:var(--chrome)] ${active ? "bg-red-600 text-white shadow-[0_0_8px_rgba(217,38,38,0.55)]" : "bg-white text-[color:var(--chrome-deep)]"}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Marca do sistema sobre o chrome grafite — bloco de sinal vermelho com o
// martelo (o "botão de ignição" da máquina) e LED de alimentação aceso.
const Brand = () => (
  <div className="group flex items-center gap-3">
    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-[0_10px_24px_-8px_rgba(217,38,38,0.55)] ring-1 ring-white/15 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110">
      <Hammer className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12" strokeWidth={2.4} />
      <span className="led led-ok absolute -right-1 -top-1 ring-2 ring-[color:var(--chrome)]" />
    </div>
    <div className="leading-tight">
      <p className="whitespace-nowrap font-heading text-lg font-extrabold tracking-tight text-white">Brico Assistente</p>
      <p className="engraved whitespace-nowrap">Sistema da loja</p>
    </div>
  </div>
);

// Botão utilitário do chrome — ícones do topo da sidebar e do header móvel.
const chromeIconBtn = "flex items-center justify-center rounded-xl text-[color:var(--chrome-muted)] transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-90";

// Corpo único do menu lateral — usado tal e qual na sidebar fixa do
// desktop e dentro da gaveta deslizante do telemóvel/tablet. `desktop`
// liga as secções que só fazem sentido quando a Área de Trabalho (janelas
// flutuantes) está disponível: lançador de apps, Mission Control e áreas
// de trabalho guardadas — nada disto existe fora do "lg".
function SidebarContent({
  desktop = false, onNavigate,
  onOpenActivity, onOpenTrash, onOpenSearch, onOpenMissionControl,
}) {
  const { status } = useSystemStatus();

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-1">
        <Brand />
        <div className="flex items-center gap-0.5">
          <button
            data-testid="sidebar-activity-btn"
            onClick={onOpenActivity}
            aria-label="Centro de Atividade"
            title="Centro de Atividade"
            className={`h-9 w-9 ${chromeIconBtn}`}
          >
            <Activity className="h-[18px] w-[18px]" />
          </button>
          <button
            data-testid="sidebar-trash-btn"
            onClick={onOpenTrash}
            aria-label="Lixeira"
            title="Lixeira"
            className={`h-9 w-9 ${chromeIconBtn}`}
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Campo de pesquisa — rebaixado no chrome, como um visor embutido. */}
      <button
        data-testid="sidebar-search-btn"
        onClick={onOpenSearch}
        className="mt-4 flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-left text-sm text-[color:var(--chrome-muted)] shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-white/25 hover:text-white"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1">Pesquisar tudo…</span>
        <Kbd className="h-auto shrink-0 rounded-md border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[color:var(--chrome-muted)]">⌘K</Kbd>
      </button>

      {/* Máscara de desvanecimento no fundo — sinaliza que há mais para ver
          por baixo (Mission Control, áreas de trabalho) sem cortar a meio
          de forma abrupta quando o conteúdo não cabe todo de uma vez. */}
      <div
        className="scroll-chrome mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        style={{ maskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)" }}
      >
        <nav className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="engraved px-3 pb-2">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      data-testid={item.testid}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
                          isActive
                            ? "bg-white text-[color:var(--chrome-deep)] shadow-[0_10px_28px_-10px_rgba(0,0,0,0.7)]"
                            : "text-[color:var(--chrome-muted)] hover:translate-x-1 hover:bg-white/[0.07] hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Traço de sinal — a folha carregada na máquina. */}
                          <span className={`absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-red-600 shadow-[0_0_10px_rgba(217,38,38,0.6)] transition-all duration-200 ${isActive ? "opacity-100" : "opacity-0"}`} />
                          <span className="relative">
                            <Icon className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-red-600" : ""}`} strokeWidth={2.2} />
                            <NavBadge count={navBadge(status, item.to)} active={!isActive} />
                          </span>
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {desktop ? (
          <div>
            <p className="engraved px-3 pb-2">Aplicações</p>
            <AppLauncher />
          </div>
        ) : null}

        {desktop ? (
          <div className="flex flex-col gap-2">
            <button
              data-testid="sidebar-mission-control"
              onClick={onOpenMissionControl}
              title="Mission Control — ver todas as janelas (F3)"
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-[color:var(--chrome-muted)] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <Grid2x2 className="h-3.5 w-3.5 shrink-0" /> Mission Control
              <Kbd className="ml-auto h-auto shrink-0 rounded border-white/10 bg-white/10 px-1 py-0 font-mono text-[9px] font-bold text-[color:var(--chrome-muted)]">F3</Kbd>
            </button>
            <WorkspaceMenu />
          </div>
        ) : null}
      </div>

      {desktop ? (
        <div className="relative mt-3 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-red-600/15 blur-2xl" />
          <StatusCluster />
          <div className="relative my-3 h-px bg-white/[0.08]" />
          <p className="relative flex items-center gap-1.5 text-xs font-extrabold text-white">
            <Sparkles className="h-3.5 w-3.5 text-red-500" /> Nunca esquecer
          </p>
          <p className="relative mt-1.5 text-[11px] leading-relaxed text-[color:var(--chrome-muted)]">
            Pedidos sem ação regressam ao topo até serem tratados.
          </p>
          <div className="relative mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {TIPS.map((tip) => (
              <span key={tip.k} className="flex items-center gap-1 text-[10px] text-[color:var(--chrome-faint)]">
                <Kbd className="h-auto rounded border-white/10 bg-white/10 px-1 py-0 font-mono text-[9px] font-bold text-[color:var(--chrome-muted)]">{tip.k}</Kbd>
                {tip.t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function LayoutInner() {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [missionControlOpen, setMissionControlOpen] = useState(false);

  // Pesquisa universal — Ctrl/Cmd+K em qualquer ponto da app (exceto a
  // escrever texto, para não interromper o utilizador).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fecha a gaveta de navegação automaticamente ao passar para desktop —
  // evita ficar "presa" aberta se a janela for redimensionada com ela ativa.
  useEffect(() => {
    if (isDesktop) setMobileNavOpen(false);
  }, [isDesktop]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Painel de instrumento — o corpo grafite da máquina, sempre presente
          à esquerda no desktop. As superfícies de trabalho (papel) vivem ao
          lado; a sidebar nunca compete com o conteúdo, enquadra-o. Único
          menu da app: em ecrãs pequenos vive na gaveta lateral abaixo, nunca
          numa barra ao fundo. */}
      <aside className="os-chrome fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] px-4 py-5 lg:flex">
        <SidebarContent
          desktop
          onOpenActivity={() => setActivityOpen(true)}
          onOpenTrash={() => setTrashOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenMissionControl={() => setMissionControlOpen(true)}
        />
      </aside>

      {/* Gaveta lateral do telemóvel/tablet — o mesmo menu do desktop, só
          que deslizante e por cima de tudo. Substitui por completo a antiga
          barra fixa ao fundo do ecrã. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="os-chrome flex w-[85vw] max-w-xs flex-col gap-0 border-r border-white/[0.06] p-4 pr-9 pt-6 text-[color:var(--chrome-text)] sm:max-w-sm lg:hidden"
        >
          <SidebarContent
            onNavigate={() => setMobileNavOpen(false)}
            onOpenActivity={() => { setMobileNavOpen(false); setActivityOpen(true); }}
            onOpenTrash={() => { setMobileNavOpen(false); setTrashOpen(true); }}
            onOpenSearch={() => { setMobileNavOpen(false); setPaletteOpen(true); }}
          />
        </SheetContent>
      </Sheet>

      {/* Header móvel — a mesma máquina, em formato de barra. Só abre o
          menu; navegação em si vive na gaveta. */}
      <header className="os-chrome-flat sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4 sm:py-3 lg:hidden">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            data-testid="mobile-nav-btn"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menu"
            title="Menu"
            className={`h-10 w-10 shrink-0 ${chromeIconBtn}`}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Brand />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            data-testid="mobile-search-btn"
            onClick={() => setPaletteOpen(true)}
            aria-label="Pesquisar tudo"
            title="Pesquisar tudo"
            className={`h-10 w-10 ${chromeIconBtn}`}
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <NotificationsBell variant="mobile" />
        </div>
      </header>

      <main className="px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-6 lg:ml-64 lg:px-10 lg:pb-16 lg:pt-10">
        <div key={location.pathname} className="mx-auto w-full max-w-6xl animate-page-enter 2xl:max-w-[1600px] 3xl:max-w-[1900px]">
          <SupplierEmailAlert />
          <Outlet />
        </div>
      </main>

      {isDesktop ? (
        <DesktopWorkspace
          missionControlOpen={missionControlOpen}
          onMissionControlOpenChange={setMissionControlOpen}
        />
      ) : null}

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
