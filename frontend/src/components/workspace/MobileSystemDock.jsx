import {
  BarChart3,
  ClipboardList,
  Grid2X2,
  ListChecks,
  Mail,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { haptics } from "@/lib/haptics";

const mobileApps = [
  {
    path: "/",
    id: "pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    key: "pedidos_ativos",
    end: true,
  },
  {
    path: "/emails",
    id: "correio",
    label: "Correio",
    icon: Mail,
    key: "emails_nao_vistos",
  },
  {
    path: "/tarefas",
    id: "tarefas",
    label: "Tarefas",
    icon: ListChecks,
    key: "tarefas_pendentes",
  },
  {
    path: "/estatisticas",
    id: "analise",
    label: "Análise",
    icon: BarChart3,
  },
];

export default function MobileSystemDock({ onOpenMore, moreOpen = false }) {
  const { status } = useSystemStatus();

  return (
    <nav
      data-testid="mobile-system-dock"
      aria-label="Aplicações principais"
      className="mobile-system-dock fixed inset-x-3 bottom-[calc(0.65rem+env(safe-area-inset-bottom))] z-40 grid h-[66px] grid-cols-5 items-stretch rounded-[22px] border border-white/[0.13] p-1.5 text-white shadow-[0_22px_60px_-18px_rgba(0,0,0,0.9)]"
    >
      {mobileApps.map((app) => {
        const Icon = app.icon;
        const count = app.key ? Number(status?.[app.key] || 0) : 0;
        return (
          <NavLink
            key={app.path}
            to={app.path}
            end={app.end}
            data-testid={`mobile-dock-${app.id}`}
            onClick={() => haptics.tap()}
            className={({ isActive }) =>
              `mobile-dock-item group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 transition-all duration-200 active:scale-90 ${isActive ? "is-active text-white" : "text-white/40"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`relative flex h-7 w-9 items-center justify-center rounded-xl transition-all duration-200 ${isActive ? "bg-white text-black shadow-[0_6px_18px_-8px_rgba(255,255,255,0.8)]" : "group-hover:bg-white/10 group-hover:text-white/75"}`}
                >
                  <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
                  {count > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[8px] font-black text-white ring-2 ring-[#101114]">
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[9px] font-extrabold tracking-tight">
                  {app.label}
                </span>
              </>
            )}
          </NavLink>
        );
      })}
      <button
        type="button"
        data-testid="mobile-dock-more"
        onClick={() => {
          haptics.tap();
          onOpenMore?.();
        }}
        aria-label="Abrir todas as aplicações"
        aria-expanded={moreOpen}
        className={`mobile-dock-item group flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-1 transition-all duration-200 active:scale-90 ${moreOpen ? "is-active text-white" : "text-white/40"}`}
      >
        <span
          className={`flex h-7 w-9 items-center justify-center rounded-xl transition-all ${moreOpen ? "bg-white text-black" : "group-hover:bg-white/10 group-hover:text-white/75"}`}
        >
          <Grid2X2 className="h-[17px] w-[17px]" strokeWidth={2.2} />
        </span>
        <span className="text-[9px] font-extrabold tracking-tight">Mais</span>
      </button>
    </nav>
  );
}
