import { useEffect, useState, useCallback } from "react";
import { Link, NavLink, useLocation, useNavigate, Outlet } from "react-router-dom";
import { ClipboardList, Truck, ListChecks, BarChart3, BookOpenCheck, Hammer, Mail, CheckCheck, FileText, User } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";
import api from "@/lib/api";
import { timeAgo } from "@/lib/pedido";

// Aviso global, grande e amarelo: aparece em TODAS as páginas sempre que chega
// um email associado a um pedido — de um fornecedor OU de um cliente que
// respondeu — até ser marcado como visto. Verificado a cada 45s e ao voltar
// à janela.
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
      className="mb-5 rounded-2xl border-4 border-yellow-400 bg-yellow-300 p-4 shadow-xl shadow-yellow-300/50 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 animate-bounce items-center justify-center rounded-2xl bg-yellow-400 text-yellow-900 sm:h-12 sm:w-12">
            <Mail className="h-6 w-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-lg font-extrabold leading-tight text-yellow-900 sm:text-2xl">
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
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-yellow-200/80 px-3 py-2 text-left text-yellow-900 transition-colors hover:bg-yellow-100"
                >
                  {m.reply_kind === "client" ? <User className="h-4 w-4 shrink-0" title="Cliente" /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {m.supplier_name || m.from_name || m.from_email}
                    <span className="ml-1.5 font-semibold opacity-80">{m.subject || "(sem assunto)"}</span>
                  </span>
                  {m.has_pdf ? <FileText className="h-4 w-4 shrink-0" title="Com PDF em anexo" /> : null}
                  <span className="shrink-0 text-[11px] font-semibold opacity-70">{timeAgo(m.received_at)}</span>
                </button>
              ))}
              {data.count > 3 ? (
                <p className="text-xs font-bold text-yellow-900/80">… e mais {data.count - 3}.</p>
              ) : null}
            </div>
          </div>
        </div>
        <button
          data-testid="email-alert-seen-all"
          onClick={markAll}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-yellow-900 px-3.5 py-2.5 text-xs font-extrabold text-yellow-100 transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <CheckCheck className="h-4 w-4" /> Marcar tudo como visto
        </button>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Pedidos", icon: ClipboardList, testid: "nav-clientes", end: true },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, testid: "nav-fornecedores" },
  { to: "/emails", label: "Emails", icon: Mail, testid: "nav-emails" },
  { to: "/catalogo-tecnico", label: "Catálogo técnico", icon: BookOpenCheck, testid: "nav-catalogo", mobile: false },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, testid: "nav-tarefas" },
  { to: "/estatisticas", label: "Estatísticas", icon: BarChart3, testid: "nav-estatisticas" },
];

const Brand = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-slate-300/40">
      <Hammer className="h-5 w-5" strokeWidth={2.4} />
    </div>
    <div className="leading-tight">
      <p className="font-heading text-lg font-extrabold tracking-tight text-slate-900">Bricomarché</p>
      <p className="text-xs font-medium text-slate-500">Faro · Assistente</p>
    </div>
  </div>
);

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white/80 px-5 py-7 backdrop-blur-xl lg:flex">
        <div className="flex items-center justify-between">
          <Brand />
          <NotificationsBell variant="sidebar" />
        </div>
        <nav className="mt-10 flex flex-1 flex-col gap-1.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-slate-300/50"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-900">Nunca esquecer</p>
          <p className="mt-1 text-xs text-slate-500">
            Pedidos sem ação regressam ao topo até serem tratados. Atalhos: N novo · / procurar · F foco.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-3 py-2.5 backdrop-blur-xl sm:px-4 sm:py-3 lg:hidden">
        <Brand />
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/catalogo-tecnico"
            aria-label="Abrir catálogo técnico"
            title="Catálogo técnico"
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${location.pathname.startsWith("/catalogo-tecnico") ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          >
            <BookOpenCheck className="h-[18px] w-[18px]" />
          </Link>
          <NotificationsBell variant="mobile" />
        </div>
      </header>

      <main className="px-4 pb-32 pt-5 sm:px-8 sm:pt-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto w-full max-w-6xl 2xl:max-w-[1600px]">
          <SupplierEmailAlert />
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
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
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1"
              >
                <span className={`flex h-8 w-full max-w-[60px] items-center justify-center rounded-lg transition-colors duration-200 ${isActive ? "bg-primary text-primary-foreground" : "text-slate-500"}`}>
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
                </span>
                <span className={`w-full truncate text-center text-[10px] font-semibold leading-tight ${isActive ? "text-slate-900" : "text-slate-500"}`}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
