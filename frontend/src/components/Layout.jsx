import { useEffect, useState, useCallback } from "react";
import { Link, NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { ClipboardList, Truck, ListChecks, BarChart3, BookOpenCheck, Hammer, Mail, CheckCheck, FileText, User, Search, Sparkles } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import InstallPwaBanner from "@/components/InstallPwaBanner";
import api from "@/lib/api";
import { timeAgo } from "@/lib/pedido";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DesktopWorkspace from "@/components/workspace/DesktopWorkspace";
import CommandPalette from "@/components/workspace/CommandPalette";
import AiAssistantPanel from "@/components/workspace/AiAssistantPanel";

// Aviso global, impossível de ignorar mas elegante: aparece em TODAS as
// páginas sempre que chega um email associado a um pedido — de um fornecedor
// OU de um cliente que respondeu — até ser marcado como visto. Verificado a
// cada 45s e ao voltar à janela.
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
      className="relative mb-5 animate-scale-in overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-red-700 p-4 shadow-[0_18px_45px_-12px_rgba(220,38,38,0.55)] ring-1 ring-red-500/60 sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 animate-bounce items-center justify-center rounded-2xl bg-black/85 text-white shadow-lg sm:h-12 sm:w-12">
            <Mail className="h-6 w-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg font-extrabold leading-tight text-white sm:text-2xl">
              {data.count === 1
                ? (allClient ? "O cliente respondeu!" : "Recebeu 1 novo email!")
                : (allClient ? `${data.count} clientes responderam!` : `Recebeu ${data.count} novos emails!`)}
            </p>
            <div className="mt-2 space-y-1.5">
              {data.items.slice(0, 3).map((m) => (
                <button
                  key={m.id}
                  data-testid={`email-alert-${m.id}`}
                  onClick={() => openItem(m)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-left text-white backdrop-blur-sm transition-all duration-150 hover:translate-x-1 hover:bg-white/25 active:scale-[0.98]"
                >
                  {m.reply_kind === "client" ? <User className="h-4 w-4 shrink-0" title="Cliente" /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {m.supplier_name || m.from_name || m.from_email}
                    <span className="ml-1.5 font-semibold opacity-80">{m.subject || "(sem assunto)"}</span>
                  </span>
                  {m.has_pdf ? <FileText className="h-4 w-4 shrink-0" title="Com PDF em anexo" /> : null}
                  <span className="shrink-0 font-mono text-[11px] font-semibold opacity-70">{timeAgo(m.received_at)}</span>
                </button>
              ))}
              {data.count > 3 ? (
                <p className="text-xs font-bold text-white/80">… e mais {data.count - 3}.</p>
              ) : null}
            </div>
          </div>
        </div>
        <button
          data-testid="email-alert-seen-all"
          onClick={markAll}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-black/85 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <CheckCheck className="h-4 w-4" /> Marcar tudo como visto
        </button>
      </div>
    </div>
  );
}

// Navegação agrupada por intenção: primeiro o trabalho do dia-a-dia,
// depois a organização e análise. Menos procura, mais fluxo.
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
      { to: "/catalogo-tecnico", label: "Catálogo técnico", icon: BookOpenCheck, testid: "nav-catalogo", mobile: false },
      { to: "/tarefas", label: "Tarefas", icon: ListChecks, testid: "nav-tarefas" },
      { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, testid: "nav-estatisticas" },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

const TIPS = [
  { k: "N", t: "novo pedido" },
  { k: "/", t: "procurar na lista" },
  { k: "F", t: "modo de foco" },
  { k: "⌘K", t: "pesquisa global" },
];

const Brand = () => (
  <div className="group flex items-center gap-3">
    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-black text-white shadow-lg shadow-slate-400/30 ring-1 ring-black/5 transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110">
      <Hammer className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12" strokeWidth={2.4} />
      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" />
    </div>
    <div className="leading-tight">
      <p className="whitespace-nowrap font-heading text-lg font-extrabold tracking-tight text-slate-900">Brico Assistente</p>
      <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Gestão de pedidos</p>
    </div>
  </div>
);

export default function Layout() {
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  return (
    <WorkspaceProvider>
    <div className="min-h-screen bg-slate-50/80 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/80 bg-white/85 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="flex items-center justify-between px-1">
          <Brand />
          <NotificationsBell variant="sidebar" />
        </div>
        <button
          data-testid="sidebar-search-btn"
          onClick={() => setPaletteOpen(true)}
          className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-400 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1">Pesquisar tudo…</span>
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-400">⌘K</span>
        </button>
        <nav className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300">{group.label}</p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      data-testid={item.testid}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
                          isActive
                            ? "bg-slate-900 text-white shadow-md shadow-slate-400/40"
                            : "text-slate-600 hover:translate-x-1 hover:bg-slate-100 hover:text-slate-900"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-red-600 transition-all duration-200 ${isActive ? "opacity-100" : "opacity-0"}`} />
                          <Icon className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-red-400" : ""}`} strokeWidth={2.2} />
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
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-black p-4 text-white shadow-lg shadow-slate-400/30">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-red-600/25 blur-2xl" />
          <p className="relative flex items-center gap-1.5 text-xs font-extrabold">
            <Sparkles className="h-3.5 w-3.5 text-red-400" /> Nunca esquecer
          </p>
          <p className="relative mt-1.5 text-[11px] leading-relaxed text-white/60">
            Pedidos sem ação regressam ao topo até serem tratados.
          </p>
          <div className="relative mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {TIPS.map((tip) => (
              <span key={tip.k} className="flex items-center gap-1 text-[10px] text-white/50">
                <kbd className="rounded border border-white/15 bg-white/10 px-1 font-mono text-[9px] font-bold text-white/80">{tip.k}</kbd>
                {tip.t}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200/80 bg-white/85 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3 lg:hidden">
        <Brand />
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            data-testid="mobile-search-btn"
            onClick={() => setPaletteOpen(true)}
            aria-label="Pesquisar tudo"
            title="Pesquisar tudo"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all duration-200 active:scale-90 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <Link
            to="/catalogo-tecnico"
            aria-label="Abrir catálogo técnico"
            title="Catálogo técnico"
            className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition-all duration-200 active:scale-90 ${location.pathname.startsWith("/catalogo-tecnico") ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"}`}
          >
            <BookOpenCheck className="h-[18px] w-[18px]" />
          </Link>
          <NotificationsBell variant="mobile" />
        </div>
      </header>

      <main className="px-4 pb-32 pt-5 sm:px-8 sm:pt-6 lg:ml-64 lg:px-10 lg:pb-20 lg:pt-10">
        <div key={location.pathname} className="mx-auto w-full max-w-6xl animate-page-enter 2xl:max-w-[1600px]">
          <SupplierEmailAlert />
          <Outlet />
        </div>
      </main>

      {isDesktop ? <DesktopWorkspace /> : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.15)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 py-1.5">
          {NAV.filter((item) => item.mobile !== false).map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`${item.testid}-mobile`}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 active:scale-90 transition-transform duration-150"
              >
                <span className={`relative flex h-8 w-full max-w-[60px] items-center justify-center rounded-lg transition-all duration-200 ${isActive ? "bg-slate-900 text-white scale-110 shadow-md shadow-slate-400/40" : "text-slate-500"}`}>
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
                  {isActive ? <span className="absolute -top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
                </span>
                <span className={`w-full truncate text-center text-[9px] font-semibold leading-tight tracking-tight ${isActive ? "text-slate-900" : "text-slate-500"}`}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <InstallPwaBanner />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AiAssistantPanel />
    </div>
    </WorkspaceProvider>
  );
}
