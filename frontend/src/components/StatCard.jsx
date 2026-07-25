import { useEffect, useRef, useState } from "react";

// Contagem animada — o número "sobe" até ao valor real quando os dados
// chegam. Só anima valores numéricos; strings (ex.: "3h") passam direto.
function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (typeof value !== "number") return undefined;
    const start = performance.now();
    const dur = 700;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  if (typeof value !== "number") return <>{value}</>;
  return <span className="tabular-nums">{display}</span>;
}

// Tile de estatística partilhado (secção L): número grande em destaque,
// descrição discreta, ícone com chip de cor. `accent` aceita tanto um
// hex cru (compatibilidade com chamadas existentes) como um dos tokens
// semânticos ("success"|"warning"|"info"|"destructive"), para novos
// consumidores não precisarem de inventar hex ad hoc.
const SEMANTIC_ACCENTS = {
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  info: "hsl(var(--info))",
  destructive: "hsl(var(--destructive))",
};

export function StatCard({ icon: Icon, label, value, accent, testid, danger, index = 0 }) {
  const resolvedAccent = SEMANTIC_ACCENTS[accent] || accent;
  return (
    <div
      data-testid={testid}
      className={`group relative animate-fade-up overflow-hidden rounded-2xl border bg-card p-4 card-elevated card-elevated-hover transition-all duration-200 hover:-translate-y-1 sm:p-5 ${danger && value > 0 ? "border-red-200" : "border-border hover:border-input"}`}
      style={{ "--stagger-i": index }}
    >
      {/* Barra de sinal — mesma linguagem dos alertas: margem vermelha =
          este número exige intervenção. */}
      {danger && value > 0 ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-700" />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
        style={{ backgroundColor: resolvedAccent }}
      />
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6 sm:h-10 sm:w-10"
        style={{ backgroundColor: `color-mix(in srgb, ${resolvedAccent} 10%, transparent)`, color: resolvedAccent }}
      >
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.2} />
      </div>
      <p className="mt-3 font-heading text-value-lg text-foreground sm:text-4xl">
        <CountUp value={value} />
      </p>
      <p className="mt-0.5 text-xs font-semibold text-text-tertiary sm:text-sm">{label}</p>
    </div>
  );
}
