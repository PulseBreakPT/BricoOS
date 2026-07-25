import { CATEGORY_LIST } from "@/lib/categories";
import { isOverdue, isToday, formatDue } from "@/lib/taskMeta";

function progressEmoji(done, total) {
  if (!total) return "";
  const pct = done / total;
  if (pct >= 0.8) return "🟢";
  if (pct >= 0.4) return "🟡";
  return "🔴";
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-center">
      <p className={`font-mono text-lg font-black tabular-nums ${tone || "text-foreground"}`}>{value ?? "–"}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}

// Reúne automaticamente as tarefas de hoje (hoje ou já atrasadas),
// agrupadas por secção — para ver de relance o que falta em cada área da
// loja, sem ter de filtrar manualmente. Mostrado como alternador dentro
// de Tasks.jsx (botão "Operação do Dia"), não uma página/rota própria.
export default function DailyOperationsView({ tasks, stats, togglingIds, onToggle, onOpen }) {
  const today = tasks.filter((t) => isToday(t.due_date) || isOverdue(t.due_date, t.done));
  const byCategory = CATEGORY_LIST.map((c) => ({
    ...c,
    items: today.filter((t) => t.category === c.key),
  }));

  return (
    <div className="mt-5" data-testid="daily-operations-view">
      {stats ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="Em execução" value={stats.in_progress} />
          <StatTile label="Concluídas hoje" value={stats.done_today} />
          <StatTile label="Por fazer" value={stats.pending} />
          <StatTile label="Atrasadas" value={stats.overdue} tone={stats.overdue > 0 ? "text-destructive" : undefined} />
        </div>
      ) : null}

      {byCategory.map((c) => {
        const Icon = c.icon;
        const doneCount = c.items.filter((t) => t.done).length;
        const total = c.items.length;
        return (
          <div key={c.key} className="mt-5" data-testid={`daily-ops-section-${c.key}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: c.accent }} />
                <p className="font-heading text-sm font-extrabold text-foreground">{c.label}</p>
              </div>
              {total > 0 ? (
                <span className="text-meta font-bold text-text-tertiary">
                  {progressEmoji(doneCount, total)} {doneCount}/{total} concluídas
                </span>
              ) : null}
            </div>
            {total === 0 ? (
              <p className="mt-1.5 text-xs text-text-body">Sem tarefas para hoje nesta secção.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {c.items.map((t) => (
                  <div
                    key={t.id}
                    data-testid={`daily-ops-task-${t.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      disabled={togglingIds.has(t.id)}
                      onChange={() => onToggle(t)}
                      className="h-4 w-4 shrink-0 rounded"
                    />
                    <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm font-semibold ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {t.title}
                      </span>
                    </button>
                    {t.due_date ? (
                      <span className="shrink-0 text-meta font-bold text-text-tertiary">{formatDue(t.due_date)}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
