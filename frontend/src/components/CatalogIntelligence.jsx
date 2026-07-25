import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Award, BarChart3, BookOpenCheck, Calculator,
  CheckCircle2, Database, ExternalLink, FileSearch, GitCompare, Medal,
  Scale, Sparkles, Trophy,
} from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const MISSING = "Dados não encontrados em fontes oficiais.";

const scoreTone = (score) => {
  if (score === null || score === undefined) return "border-border bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]";
  if (score >= 90) return "border-amber-300 bg-amber-300 text-foreground";
  if (score >= 75) return "border-emerald-400 bg-emerald-400 text-foreground";
  if (score >= 60) return "border-blue-400 bg-blue-400 text-foreground";
  return "border-red-500 bg-red-500 text-white";
};

const statusLabel = (status) => ({
  scored: "Calculado",
  scored_conditional: "Potencial publicado",
  conflict: "Conflito de fontes",
  legacy_unmapped: "Norma histórica",
  partial: "Dados parciais",
  descriptive: "Descritivo",
  derived_not_scored: "Não duplicado",
  verified_no_scale: "Verificado · sem escala",
  not_applicable: "Não aplicável",
  blocked_source_policy: "Fonte não autorizada",
  missing: "Sem dados",
}[status] || status);

const statusTone = (status) => {
  if (status === "scored") return "border-border bg-[var(--tone-green-bg)] text-[color:var(--tone-green-text)]";
  if (["conflict", "legacy_unmapped"].includes(status)) return "border-border bg-[var(--tone-amber-bg)] text-[color:var(--tone-amber-text)]";
  if (["missing", "partial"].includes(status)) return "border-border bg-[var(--tone-purple-bg)] text-[color:var(--tone-purple-text)]";
  return "border-border bg-[var(--tone-blue-bg)] text-[color:var(--tone-blue-text)]";
};

function OverallBadge({ overall, compact = false }) {
  const value = overall?.score;
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 font-mono shadow-sm ${scoreTone(value)} ${compact ? "h-14 w-14" : "h-20 w-20"}`}>
      <span className={`${compact ? "text-xl" : "text-3xl"} font-black leading-none`}>{value ?? "N/D"}</span>
      <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-widest">Overall</span>
    </div>
  );
}

function RankingCard({ model, selected, onSelect }) {
  const { overall } = model;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-w-[13rem] flex-1 shrink-0 snap-start rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-1 active:scale-[0.98] sm:min-w-[14rem] ${selected ? "border-amber-400 bg-[var(--pastel-amber-bg)] shadow-md shadow-amber-200/50 ring-1 ring-amber-300" : "border-border bg-card shadow-sm hover:border-input hover:shadow-md"}`}
    >
      <div className="flex items-start gap-3">
        <OverallBadge overall={overall} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {overall.medal ? <Medal className="h-3.5 w-3.5 text-amber-500" /> : null}
            <p className="truncate text-sm font-extrabold text-foreground">{model.name}</p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{model.material} · {model.category_label}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {overall.category ? <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-black text-background">{overall.category}</span> : null}
            {overall.rank ? <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">#{overall.rank}</span> : null}
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{overall.coverage_percent}% cobertura</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function WinnerStrip({ winners }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Object.entries(winners || {}).filter(([key]) => key !== "quality_price").map(([key, winner]) => (
        <div key={key} className="rounded-xl border border-border bg-muted/80 p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{winner.label}</p>
          <p className="mt-1 text-[11px] font-bold leading-snug text-foreground">{winner.value}</p>
          {winner.score !== undefined ? <p className="mt-1 font-mono text-[10px] font-bold text-amber-600">{winner.score}/100</p> : null}
        </div>
      ))}
    </div>
  );
}

function ComparisonPanel({ analysis, leftId, rightId, onLeft, onRight }) {
  const models = analysis.models || [];
  const left = analysis.model_index?.[leftId];
  const right = analysis.model_index?.[rightId];
  const comparison = useMemo(() => {
    const direct = (analysis.comparisons || []).find((item) => (
      (item.left_id === leftId && item.right_id === rightId)
      || (item.left_id === rightId && item.right_id === leftId)
    ));
    if (!direct || direct.left_id === leftId) return direct;
    return {
      ...direct,
      superior_left: direct.inferior_left,
      inferior_left: direct.superior_left,
      axes: direct.axes.map((axis) => ({
        ...axis,
        left_score: axis.right_score,
        right_score: axis.left_score,
        winner: axis.winner === "left" ? "right" : axis.winner === "right" ? "left" : "equal",
      })),
    };
  }, [analysis.comparisons, leftId, rightId]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-[color:var(--pastel-blue-text)]" />
        <h4 className="text-sm font-extrabold text-foreground">Comparação direta</h4>
      </div>
      <div className="mt-3 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <ModelSelect value={leftId} models={models} onChange={onLeft} />
        <span className="text-center font-mono text-[10px] font-bold text-muted-foreground">VS</span>
        <ModelSelect value={rightId} models={models} onChange={onRight} />
      </div>

      {left && right && comparison?.axes?.length ? (
        <div className="mt-4 space-y-2">
          {comparison.axes.map((axis) => {
            const leftFeature = left.features[axis.key];
            const rightFeature = right.features[axis.key];
            return (
              <div key={axis.key} className="rounded-xl bg-muted p-2.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className={`font-mono font-black ${axis.winner === "left" ? "text-[color:var(--pastel-emerald-text)]" : "text-muted-foreground"}`}>{axis.left_score}</span>
                  <span className="text-center font-bold text-muted-foreground">{axis.label}</span>
                  <span className={`font-mono font-black ${axis.winner === "right" ? "text-[color:var(--pastel-emerald-text)]" : "text-muted-foreground"}`}>{axis.right_score}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="ml-auto h-full rounded-full bg-blue-600" style={{ width: `${axis.left_score}%` }} /></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${axis.right_score}%` }} /></div>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-[9px] text-muted-foreground">
                  <span className="truncate">{leftFeature.value}</span>
                  <span className="shrink-0 font-mono">Δ {axis.delta_points} pts{axis.difference_percent !== null ? ` · ${axis.difference_percent}%` : ""}</span>
                  <span className="truncate text-right">{rightFeature.value}</span>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-1 gap-2 pt-1 text-[10px] sm:grid-cols-2">
            <div className="rounded-lg bg-[var(--pastel-emerald-bg)] p-2 text-[color:var(--pastel-emerald-text)]">
              <strong>{left.name} superior em</strong><br />{comparison.superior_left.length ? comparison.superior_left.join(", ") : "Nenhum eixo comparável."}
            </div>
            <div className="rounded-lg bg-[var(--pastel-amber-bg)] p-2 text-[color:var(--pastel-amber-text)]">
              <strong>{right.name} superior em</strong><br />{comparison.inferior_left.length ? comparison.inferior_left.join(", ") : "Nenhum eixo comparável."}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">{leftId === rightId ? "Escolhe dois modelos diferentes." : MISSING}</p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Scale className="mt-0.5 h-3 w-3 shrink-0" /> Só são comparados eixos com a mesma base de cálculo. “Δ pts” é a diferença na escala Brico2; a percentagem aparece apenas quando pode ser calculada sobre valores físicos equivalentes.
      </p>
      <p className="mt-2 rounded-lg border border-border bg-muted p-2 text-[10px] text-muted-foreground">
        <strong>Relação qualidade/preço:</strong> {analysis.winners?.quality_price?.value || MISSING} {analysis.winners?.quality_price?.explanation}
      </p>
    </div>
  );
}

function ModelSelect({ value, models, onChange }) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={models.map((model) => ({ value: model.id, label: model.name }))}
      placeholder="Escolher modelo..."
      searchPlaceholder="Procurar modelo..."
      emptyText="Sem modelos."
      className="rounded-xl px-2 py-2.5 text-xs font-bold text-foreground"
    />
  );
}

function FeatureAudit({ feature }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-bold text-foreground">{feature.label}</p>
            <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusTone(feature.status)}`}>{statusLabel(feature.status)}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{feature.value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-black ${feature.score === null ? "border-border bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]" : scoreTone(feature.score)}`}>
          {feature.score ?? "N/D"}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border p-3 text-[10px] leading-relaxed text-muted-foreground">
        <p>{feature.explanation}</p>
        {feature.formula ? (
          <div className="rounded-lg border border-border bg-muted/80 p-2.5 text-muted-foreground">
            <p className="flex items-center gap-1 font-bold text-foreground"><Calculator className="h-3 w-3" /> Cálculo</p>
            <p className="mt-1 font-mono text-[9px]">{feature.formula}</p>
          </div>
        ) : null}
        {feature.standard ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-muted p-2"><strong className="text-foreground">Norma</strong><br />{feature.standard}<br /><span className="text-muted-foreground">{feature.standard_status}</span></div>
            <div className="rounded-lg bg-muted p-2"><strong className="text-foreground">Escala / melhor classe</strong><br />{feature.official_scale}<br /><span className="text-muted-foreground">{feature.official_best}</span></div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {(feature.sources || []).filter((source) => source.url).map((source) => (
            <a key={`${source.type}-${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-[var(--pastel-blue-bg)] px-2 py-1 font-bold text-[color:var(--pastel-blue-text)] hover:bg-[var(--pastel-blue-bg)]">
              {source.label} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
      </div>
    </details>
  );
}

function ModelAnalysis({ model }) {
  if (!model) return null;
  const positiveUses = model.recommendations.filter((item) => item.status !== "not_determined");
  const unresolvedUses = model.recommendations.filter((item) => item.status === "not_determined");
  return (
    <div className="rounded-2xl border border-border bg-muted p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <OverallBadge overall={model.overall} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-heading text-lg font-black text-foreground">{model.name}</h4>
            {model.overall.category ? <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-black text-background">{model.overall.category}</span> : null}
            {model.overall.medal ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pastel-amber-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-amber-text)]"><Award className="h-3 w-3" /> {model.overall.medal}</span> : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{model.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <span className="rounded bg-card px-2 py-1">Cobertura {model.overall.coverage_percent}%</span>
            {model.overall.rank ? <span className="rounded bg-card px-2 py-1">Ranking #{model.overall.rank}</span> : null}
            {model.overall.percentile ? <span className="rounded bg-card px-2 py-1">Percentil {model.overall.percentile}</span> : null}
          </div>
        </div>
      </div>

      {model.overall.score === null ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span><strong>Overall bloqueado.</strong> {model.overall.explanation} São necessários os cinco eixos centrais comparáveis.</span>
        </p>
      ) : (
        <details className="mt-3 rounded-xl border border-emerald-200 bg-[var(--pastel-emerald-bg)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[color:var(--pastel-emerald-text)]">Auditar o Overall geral</summary>
          <div className="border-t border-emerald-100 p-3 text-[10px] leading-relaxed text-[color:var(--pastel-emerald-text)]">
            <p>{model.overall.explanation}</p>
            <p className="mt-2 rounded-lg bg-card/70 p-2 font-mono text-[9px]">{model.overall.formula}</p>
          </div>
        </details>
      )}

      {model.conflicts.length ? (
        <div className="mt-3 space-y-2">
          {model.conflicts.map((conflict) => (
            <div key={conflict.field} className="rounded-xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3 text-[10px] leading-relaxed text-[color:var(--pastel-amber-text)]">
              <p className="flex items-center gap-1 font-extrabold"><AlertTriangle className="h-3.5 w-3.5" /> Conflito · {conflict.field}</p>
              <p className="mt-1">{conflict.summary}</p>
              <div className="mt-1 flex flex-wrap gap-2">{conflict.sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="font-bold underline">Abrir fonte</a>)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {Object.values(model.features).map((feature) => <FeatureAudit key={feature.key} feature={feature} />)}
      </div>

      {model.manufacturer_sources.length ? (
        <details className="mt-3 rounded-xl border border-blue-200 bg-[var(--pastel-blue-bg)]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[color:var(--pastel-blue-text)]">Dados do fabricante do sistema · escopo separado</summary>
          <div className="space-y-2 border-t border-blue-100 p-3">
            {model.manufacturer_sources.map((source) => (
              <div key={source.url} className="rounded-lg bg-card p-2.5 text-[10px] text-muted-foreground">
                <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-[color:var(--pastel-blue-text)]">{source.label} <ExternalLink className="h-3 w-3" /></a>
                <p className="mt-1 font-semibold text-[color:var(--pastel-amber-text)]">{source.scope}</p>
                <p className="mt-1">{Object.entries(source.published).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <InsightList title="Pontos fortes / vantagens" icon={CheckCircle2} items={model.strengths} tone="emerald" />
        <InsightList title="Pontos fracos relativos" icon={BarChart3} items={model.relative_lows} tone="slate" />
        <InsightList title="Limitações documentais" icon={AlertTriangle} items={model.limitations} tone="amber" />
      </div>

      <details className="mt-3 rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-foreground">Casos de utilização e limites da recomendação</summary>
        <div className="grid grid-cols-1 gap-2 border-t border-border p-3 sm:grid-cols-2">
          {[...positiveUses, ...unresolvedUses].map((item) => (
            <div key={item.use} className={`rounded-lg p-2 text-[10px] ${item.status === "not_determined" ? "bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]" : "bg-[var(--tone-green-bg)] text-[color:var(--tone-green-text)]"}`}>
              <p className="font-extrabold">{item.use}</p><p className="mt-0.5 leading-relaxed">{item.reason}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function InsightList({ title, icon: Icon, items, tone }) {
  const classes = tone === "emerald" ? "border-border bg-[var(--tone-green-bg)] text-[color:var(--tone-green-text)]" : tone === "amber" ? "border-border bg-[var(--tone-amber-bg)] text-[color:var(--tone-amber-text)]" : "border-border bg-card text-foreground";
  return (
    <div className={`rounded-xl border p-3 ${classes}`}>
      <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide"><Icon className="h-3.5 w-3.5" /> {title}</p>
      <ul className="mt-2 space-y-1 text-[10px] leading-relaxed">{items.map((item) => <li key={item}>• {item}</li>)}</ul>
    </div>
  );
}

export default function CatalogIntelligence({ analysis, initialModelId = "", standalone = false }) {
  const models = analysis?.models || [];
  const ranked = (analysis?.ranking || []).map((id) => analysis.model_index[id]).filter(Boolean);
  const requestedId = analysis?.aliases?.[initialModelId] || initialModelId;
  const initialSelected = analysis?.model_index?.[requestedId]?.id || ranked[0]?.id || models[0]?.id || "";
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [leftId, setLeftId] = useState(ranked[0]?.id || models[0]?.id || "");
  const [rightId, setRightId] = useState(ranked[1]?.id || models[1]?.id || "");
  const [analysisOpen, setAnalysisOpen] = useState(standalone);
  useEffect(() => {
    if (requestedId && analysis?.model_index?.[requestedId]) setSelectedId(requestedId);
  }, [analysis, requestedId]);
  // Catalog.jsx atualiza este "analysis" em segundo plano (ver loadCatalog);
  // se o catálogo mudar e leftId/rightId deixarem de existir no novo
  // model_index, o painel de comparação ficava preso a mostrar "Dados não
  // encontrados" para sempre, em vez de recair para modelos válidos.
  useEffect(() => {
    if (!analysis) return;
    if (leftId && !analysis.model_index?.[leftId]) setLeftId(ranked[0]?.id || models[0]?.id || "");
    if (rightId && !analysis.model_index?.[rightId]) setRightId(ranked[1]?.id || models[1]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);
  if (!analysis || !models.length) return null;
  const selected = analysis.model_index?.[selectedId] || models[0];
  const spotlight = ranked.length ? ranked.slice(0, 3) : models.slice(0, 3);

  return (
    <section className={`${standalone ? "" : "mt-4"} card-elevated overflow-hidden rounded-2xl border border-border bg-card sm:rounded-3xl`}>
      <div className="relative p-3 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[var(--pastel-blue-bg)] blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-[var(--tone-amber-bg)] text-[color:var(--tone-amber-text)]"><Trophy className="h-5 w-5" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-black text-foreground">Overall técnico do catálogo</h3>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">{analysis.methodology.name}</span>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">Comparação rápida com fórmula, norma e fonte em cada nota. É um índice Brico2 auditável — não uma certificação.</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto">
            <Stat value={analysis.stats.catalog_models} label="modelos" />
            <Stat value={analysis.stats.ranked_models} label="no ranking" />
            <Stat value={analysis.stats.models_with_conflicts} label="conflitos" />
          </div>
        </div>

        {/* Máscara no bordo direito — sinaliza que há mais cartões para ver
            ao arrastar, em vez de cortar o último a meio sem aviso. */}
        <div
          className="relative mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
          style={{ maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)", WebkitMaskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)" }}
        >
          {spotlight.map((model) => <RankingCard key={model.id} model={model} selected={selected.id === model.id} onSelect={() => setSelectedId(model.id)} />)}
        </div>
        <WinnerStrip winners={analysis.winners} />
      </div>

      <details open={analysisOpen} onToggle={(event) => setAnalysisOpen(event.currentTarget.open)} className="group border-t border-border bg-muted/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-extrabold text-foreground transition-colors hover:bg-muted/70 sm:px-5">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> {analysisOpen ? "Ocultar análise detalhada" : "Abrir análise, comparação e auditoria completa"}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t border-border bg-muted p-2 sm:p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_1fr]">
            <div className="order-2 min-w-0 space-y-3 xl:order-1">
              <ComparisonPanel analysis={analysis} leftId={leftId} rightId={rightId} onLeft={setLeftId} onRight={setRightId} />
              <div className="hidden rounded-2xl border border-border bg-card p-3 xl:block">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-foreground"><Database className="h-4 w-4 text-[color:var(--pastel-blue-text)]" /> Todos os modelos</p>
                <div className="mt-2 space-y-1">
                  {models.map((model) => (
                    <button key={model.id} type="button" onClick={() => setSelectedId(model.id)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${selected.id === model.id ? "bg-foreground text-background shadow-md shadow-slate-400/30" : "hover:bg-muted"}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-black ${selected.id === model.id ? scoreTone(model.overall.score) : "border-border bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]"}`}>{model.overall.score ?? "N/D"}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{model.name}</span><span className={`block truncate text-[9px] ${selected.id === model.id ? "text-white/50" : "text-muted-foreground"}`}>{model.category_label}</span></span>
                      {model.conflicts.length ? <AlertTriangle className="h-3.5 w-3.5 text-warning" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-[var(--pastel-blue-bg)] p-3 text-[10px] leading-relaxed text-[color:var(--pastel-blue-text)]">
                <p className="flex items-center gap-1 font-extrabold"><BookOpenCheck className="h-3.5 w-3.5" /> Atualização protegida</p>
                <p className="mt-1">{analysis.methodology.update_rule}</p>
              </div>
              <MethodologyPanel methodology={analysis.methodology} models={models} />
            </div>
            <div className="order-1 min-w-0 space-y-3 xl:order-2">
              <div className="rounded-2xl border border-border bg-card p-3 xl:hidden">
                <label htmlFor="catalog-model-mobile" className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Modelo em análise</label>
                <NativeSelect id="catalog-model-mobile" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="rounded-xl px-3 py-2.5 text-sm font-bold text-foreground focus-visible:border-blue-500 focus-visible:ring-blue-500/50">
                  {models.map((model) => <NativeSelectOption key={model.id} value={model.id}>{model.name} · {model.overall.score ?? "N/D"}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <ModelAnalysis model={selected} />
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function MethodologyPanel({ methodology, models }) {
  const labelFor = (key) => models[0]?.features?.[key]?.label || key;
  return (
    <details className="rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2.5 text-xs font-extrabold text-foreground">Pesos, categorias e regra do ranking</summary>
      <div className="space-y-3 border-t border-border p-3 text-[10px] leading-relaxed text-muted-foreground">
        <p>{methodology.ranking_rule}</p>
        <div>
          <p className="font-extrabold text-foreground">Pesos definidos</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(methodology.weights).map(([key, weight]) => (
              <span key={key} className={`rounded-md px-2 py-1 ${methodology.active_features.includes(key) ? "bg-[var(--tone-green-bg)] font-bold text-[color:var(--tone-green-text)]" : "bg-[var(--tone-slate-bg)] text-[color:var(--tone-slate-text)]"}`}>
                {labelFor(key)} {weight}%{methodology.active_features.includes(key) ? " · ativo" : " · sem cobertura comum"}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-extrabold text-foreground">Categorias Brico2</p>
          <p className="mt-1 font-mono text-[9px]">{methodology.category_bands.map((band) => `${band.category} ≥ ${band.minimum}`).join(" · ")}</p>
        </div>
        <p className="rounded-lg bg-[var(--pastel-amber-bg)] p-2 text-[color:var(--pastel-amber-text)]"><strong>Regra de segurança:</strong> {methodology.missing_text}</p>
      </div>
    </details>
  );
}

function Stat({ value, label }) {
  return (
    <div className="rounded-xl border border-border bg-muted/80 px-2.5 py-1.5">
      <p className="font-mono text-sm font-black text-foreground">{value}</p>
      <p className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
