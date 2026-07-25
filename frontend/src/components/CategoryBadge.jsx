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

// Primitivo partilhado: pastel bg + texto saturado + ícone (ou dot),
// a linguagem visual de badge usada em toda a app (categoria, estado,
// prioridade). CategoryBadge e StatusPill só escolhem os dados — o
// span/tamanhos/ícone vivem aqui uma única vez.
function PastelBadge({ bg, text, icon: Icon, dot, label, size = "sm", testid }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${pad}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {Icon ? (
        <Icon className="h-3 w-3 shrink-0" strokeWidth={2.6} />
      ) : dot ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      ) : null}
      {label}
    </span>
  );
}

export const CategoryBadge = ({ category, size = "sm" }) => {
  warnIfUnknown(CATEGORIES, category, "categoria");
  const c = getCategory(category);
  return (
    <PastelBadge
      testid={`category-badge-${c.key}`}
      bg={c.bg}
      text={c.text}
      icon={c.icon}
      label={c.label}
      size={size}
    />
  );
};

export const StatusPill = ({ status, size = "sm" }) => {
  warnIfUnknown(STATUS, status, "estado");
  const s = getStatus(status);
  return (
    <PastelBadge
      bg={s.bg}
      text={s.color}
      icon={s.icon}
      dot={s.icon ? undefined : s.color}
      label={s.label}
      size={size}
    />
  );
};
