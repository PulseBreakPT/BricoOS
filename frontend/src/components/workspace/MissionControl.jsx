import { useEffect, useRef } from "react";
import { Layers3, MonitorUp, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PANEL_TYPES } from "@/lib/panelRegistry";
import { haptics } from "@/lib/haptics";

function PreviewSurface({ icon: Icon, primary = false }) {
  return (
    <div
      className={`mission-preview relative overflow-hidden bg-white ${primary ? "h-44" : "h-32"}`}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-dot-grid opacity-55" />
      <div className="absolute inset-3 grid grid-cols-[30%_1fr] gap-2">
        <div className="rounded-lg border border-slate-200 bg-slate-100/85 p-2">
          <span className="block h-2 w-8 rounded-full bg-slate-300" />
          <span className="mt-3 block h-1.5 w-full rounded-full bg-slate-200" />
          <span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-slate-200" />
          <span className="mt-1.5 block h-1.5 w-3/5 rounded-full bg-slate-200" />
        </div>
        <div className="grid grid-rows-[auto_1fr] gap-2">
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                className="h-8 rounded-lg border border-slate-200 bg-white shadow-sm"
              />
            ))}
          </div>
          <div className="relative rounded-lg border border-slate-200 bg-white shadow-sm">
            {Icon ? (
              <Icon
                className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-slate-200"
                strokeWidth={1.4}
              />
            ) : null}
            <span className="absolute bottom-3 left-3 h-1.5 w-1/3 rounded-full bg-slate-200" />
            <span className="absolute bottom-6 left-3 h-1.5 w-1/2 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Visão espacial das janelas reais. Mostra apenas superfícies que existem,
 * evitando "espaços" decorativos sem função, e preserva a hierarquia entre a
 * aplicação principal e as ferramentas flutuantes.
 */
export default function MissionControl({
  open,
  onClose,
  onShowDesktop,
  primaryWindow,
}) {
  const { panels, zOrder, activeId, focusPanel, closePanel } = useWorkspace();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => overlayRef.current?.focus(), 0);
    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Diálogo modal sem retenção de foco deixava o Tab escapar para a
      // página por trás — prende a navegação por teclado dentro do overlay
      // enquanto estiver aberto.
      if (event.key === "Tab" && overlayRef.current) {
        const focusables = Array.from(
          overlayRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const ordered = [...panels].sort(
    (a, b) => zOrder.indexOf(b.id) - zOrder.indexOf(a.id),
  );
  const totalWindows = ordered.length + (primaryWindow ? 1 : 0);
  const PrimaryIcon = primaryWindow?.icon;
  const typeCounts = {};
  panels.forEach((panel) => {
    typeCounts[panel.type] = (typeCounts[panel.type] || 0) + 1;
  });
  const typeSeen = {};

  const showDesktop = () => {
    haptics.tap();
    onShowDesktop?.();
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      data-testid="mission-control"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-control-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mission-control-overlay fixed inset-0 z-[70] flex flex-col overflow-auto p-5 outline-none backdrop-blur-2xl animate-scale-in lg:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-dot-grid-dark opacity-60"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-5 3xl:max-w-7xl">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="mission-control-glyph flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-neutral-900/10 text-neutral-700">
            <Layers3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[8px] 3xl:text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">
              Workspace 01 · Multitarefa
            </p>
            <h2
              id="mission-control-title"
              className="mt-1 truncate font-heading text-2xl font-extrabold tracking-tight text-neutral-900"
            >
              Todas as janelas
            </h2>
          </div>
          <span className="hidden rounded-full border border-neutral-900/10 bg-neutral-900/[0.04] px-2.5 py-1 font-mono text-[9px] 3xl:text-[11px] font-bold text-neutral-400 sm:inline-flex">
            {totalWindows} {totalWindows === 1 ? "janela" : "janelas"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-testid="mission-show-desktop"
            onClick={showDesktop}
            className="flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-900/10 bg-neutral-900/[0.04] px-3.5 text-[10px] 3xl:text-[12px] font-extrabold text-neutral-500 transition-colors hover:border-neutral-900/20 hover:bg-white hover:text-neutral-900"
          >
            <MonitorUp className="h-4 w-4" />
            <span className="hidden sm:inline">Mostrar secretária</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-900/10 bg-neutral-900/[0.04] text-neutral-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            aria-label="Fechar visão geral"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mission-space-strip relative mx-auto mt-5 flex w-full max-w-6xl items-center gap-3 rounded-[18px] border border-neutral-900/[0.08] px-3 py-2.5 3xl:max-w-7xl">
        <span className="flex h-9 w-14 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 font-mono text-[8px] 3xl:text-[10px] font-black uppercase tracking-[0.12em] text-red-100/75">
          OP·01
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] 3xl:text-[12px] font-extrabold text-neutral-600">
            Operação principal
          </span>
          <span className="mt-0.5 block truncate text-[8px] 3xl:text-[10px] font-semibold text-neutral-400">
            {primaryWindow?.title || "Ambiente de trabalho"} · ferramentas do turno
          </span>
        </span>
        <span className="flex items-center gap-2 font-mono text-[8px] 3xl:text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
          <span className="led led-ok" /> Espaço ativo
        </span>
      </div>

      {totalWindows === 0 ? (
        <div className="relative mx-auto my-auto flex max-w-md flex-col items-center py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-neutral-900/10 bg-neutral-900/[0.03] text-neutral-400">
            <MonitorUp className="h-7 w-7" />
          </span>
          <p className="mt-5 font-heading text-xl font-extrabold text-neutral-800">
            Secretária livre
          </p>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-neutral-400">
            Abre uma aplicação no dock para começar um novo espaço de trabalho.
          </p>
        </div>
      ) : (
        <div className="relative mx-auto my-auto grid w-full max-w-6xl grid-cols-1 items-start gap-4 py-7 md:grid-cols-2 xl:grid-cols-3 3xl:max-w-7xl 3xl:grid-cols-4">
          {primaryWindow ? (
            <button
              data-testid="mission-control-primary"
              onClick={() => {
                haptics.tap();
                primaryWindow.onFocus?.();
                onClose();
              }}
              className={`mission-window-card group relative overflow-hidden rounded-[22px] border text-left transition-all duration-200 hover:-translate-y-1 hover:border-neutral-900/25 ${primaryWindow.minimized ? "border-neutral-900/10 opacity-70" : "is-active border-red-400/45"}`}
              style={{ "--stagger-i": 0 }}
            >
              <div className="os-primary-titlebar flex h-11 items-center gap-2.5 border-b border-neutral-900/[0.08] px-3">
                <span className="os-window-app-icon flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-900/10">
                  {PrimaryIcon ? <PrimaryIcon className="h-3.5 w-3.5 text-neutral-700" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] 3xl:text-[13px] font-extrabold text-neutral-800">
                  {primaryWindow.title}
                </span>
                <span className="rounded-full border border-neutral-900/[0.08] bg-neutral-900/[0.04] px-2 py-1 font-mono text-[7px] 3xl:text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-400">
                  {primaryWindow.minimized ? "Minimizada" : "Principal"}
                </span>
              </div>
              <PreviewSurface icon={PrimaryIcon} primary />
              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3.5 py-2.5">
                <span className="text-[10px] 3xl:text-[12px] font-extrabold text-slate-700">
                  Retomar aplicação
                </span>
                <span className="font-mono text-[8px] 3xl:text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Workspace 01
                </span>
              </div>
            </button>
          ) : null}

          {ordered.map((panel, cardIndex) => {
            const meta = PANEL_TYPES[panel.type];
            if (!meta) return null;
            const Icon = meta.icon;
            const active = activeId === panel.id && !panel.minimized;
            typeSeen[panel.type] = (typeSeen[panel.type] || 0) + 1;
            const label =
              typeCounts[panel.type] > 1
                ? `${meta.title} #${typeSeen[panel.type]}`
                : meta.title;
            return (
              <div
                key={panel.id}
                className="mission-window-wrap group relative"
                style={{ "--stagger-i": cardIndex + (primaryWindow ? 1 : 0) }}
              >
                <button
                  data-testid={`mission-control-card-${panel.id}`}
                  onClick={() => {
                    haptics.tap();
                    focusPanel(panel.id);
                    onClose();
                  }}
                  className={`mission-window-card w-full overflow-hidden rounded-[22px] border text-left transition-all duration-200 hover:-translate-y-1 hover:border-neutral-900/25 ${active ? "is-active border-emerald-500/45" : "border-neutral-900/10"} ${panel.minimized ? "opacity-70" : ""}`}
                >
                  <div className="os-primary-titlebar flex h-11 items-center gap-2.5 border-b border-neutral-900/[0.08] px-3">
                    <span className="os-window-app-icon flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-900/10">
                      <Icon className="h-3.5 w-3.5 text-neutral-600" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] 3xl:text-[13px] font-extrabold text-neutral-800">
                      {label}
                    </span>
                    <span className="font-mono text-[7px] 3xl:text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-400">
                      {panel.minimized ? "Minimizada" : active ? "Em foco" : "Aberta"}
                    </span>
                  </div>
                  <PreviewSurface icon={Icon} />
                  <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3.5 py-2.5">
                    <span className="text-[10px] 3xl:text-[12px] font-extrabold text-slate-700">
                      Abrir janela
                    </span>
                    <span className="font-mono text-[8px] 3xl:text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      Ferramenta
                    </span>
                  </div>
                </button>
                <button
                  data-testid={`mission-control-close-${panel.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    haptics.tap();
                    closePanel(panel.id);
                  }}
                  title="Fechar janela"
                  aria-label={`Fechar ${label}`}
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-900/10 bg-white text-neutral-500 opacity-0 shadow-xl transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="relative mx-auto mt-auto font-mono text-[8px] 3xl:text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
        F3 visão geral · Esc voltar · ⌘H secretária
      </p>
    </div>
  );
}

