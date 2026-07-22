import { CATEGORIES, STATUS, getCategory, getStatus } from "@/lib/categories";

// getCategory/getStatus caem sempre num valor por omissão em vez de
// devolver null — sem isto, uma categoria/estado desconhecido (typo,
// migração de dados incompleta) mostrava-se silenciosamente como
// "Construção"/"Aberto", escondendo o problema em vez de o assinalar.
function warnIfUnknown(map, key, kind) {
  if (process.env.NODE_ENV !== "production" && key && !map[key]) {
    // eslint-disable-next-line no-console
    console.warn(`[CategoryBadge] ${kind} desconhecido: "${key}" — a mostrar o valor por omissão.`);
  }
}

export const CategoryBadge = ({ category, size = "sm" }) => {
  warnIfUnknown(CATEGORIES, category, "categoria");
  const c = getCategory(category);
  const Icon = c.icon;
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <span
      data-testid={`category-badge-${c.key}`}
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${pad}`}
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.6} />
      {c.label}
    </span>
  );
};

export const StatusPill = ({ status }) => {
  warnIfUnknown(STATUS, status, "estado");
  const s = getStatus(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
};
