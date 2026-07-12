import { NavLink, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, Truck, ListChecks, Hammer } from "lucide-react";
import NotificationsBell from "@/components/NotificationsBell";

const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard, testid: "nav-inicio", end: true },
  { to: "/clientes", label: "Pedidos", icon: Users, testid: "nav-clientes" },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck, testid: "nav-fornecedores" },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, testid: "nav-tarefas" },
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
          <p className="text-xs font-semibold text-slate-900">Nenhum pedido esquecido</p>
          <p className="mt-1 text-xs text-slate-500">
            Alertas automáticos avisam quando um pedido está parado ou sem resposta.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/70 px-5 py-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <NotificationsBell variant="mobile" />
      </header>

      <main className="px-5 pb-28 pt-6 sm:px-8 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/80 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
          {NAV.map((item) => {
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
                className="flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5"
              >
                <span className={`flex h-9 w-full max-w-[64px] items-center justify-center rounded-lg transition-colors duration-200 ${isActive ? "bg-primary text-primary-foreground" : "text-slate-500"}`}>
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
                </span>
                <span className={`text-[11px] font-semibold ${isActive ? "text-slate-900" : "text-slate-500"}`}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
