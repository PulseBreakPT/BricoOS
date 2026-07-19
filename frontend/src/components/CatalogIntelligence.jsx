import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Award, BarChart3, BookOpenCheck, Calculator,
  CheckCircle2, Database, ExternalLink, FileSearch, GitCompare, Medal,
  Scale, Sparkles, Trophy,
} from "lucide-react";

const MISSING = "Dados não encontrados em fontes oficiais.";

const scoreTone = (score) => {
  if (score === null || score === undefined) return "border-slate-600 bg-slate-800 text-slate-300";
  if (score >= 90) return "border-amber-300 bg-amber-300 text-slate-950";
  if (score >= 75) return "border-emerald-400 bg-emerald-400 text-slate-950";
  if (score >= 60) return "border-blue-400 bg-blue-400 text-slate-950";
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
  if (status === "scored") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["conflict", "legacy_unmapped"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["missing", "partial"].includes(status)) return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-blue-200 bg-blue-50 text-blue-800";
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
      className={`min-w-[11.5rem] flex-1 rounded-2xl border p-3 text-left transition sm:min-w-[13rem] ${selected ? "border-amber-300 bg-white/10 ring-1 ring-amber-300" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}
    >
      <div className="flex items-start gap-3">
        <OverallBadge overall={overall} compact />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {overall.medal ? <Medal className="h-3.5 w-3.5 text-amber-300" /> : null}
            <p className="truncate text-sm font-extrabold text-white">{model.name}</p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-400">{model.material} · {model.category_label}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {overall.category ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white">{overall.category}</span> : null}
            {overall.rank ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-300">#{overall.rank}</span> : null}
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-300">{overall.coverage_percent}% cobertura</span>
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
        <div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{winner.label}</p>
          <p className="mt-1 text-[11px] font-bold leading-snug text-slate-200">{winner.value}</p>
          {winner.score !== undefined ? <p className="mt-1 font-mono text-[10px] text-amber-300">{winner.score}/100</p> : null}
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
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-blue-700" />
        <h4 className="text-sm font-extrabold text-slate-900">Comparação direta</h4>
      </div>
      <div className="mt-3 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <ModelSelect value={leftId} models={models} onChange={onLeft} />
        <span className="text-center font-mono text-[10px] font-bold text-slate-400">VS</span>
        <ModelSelect value={rightId} models={models} onChange={onRight} />
      </div>

      {left && right && comparison?.axes?.length ? (
        <div className="mt-4 space-y-2">
          {comparison.axes.map((axis) => {
            const leftFeature = left.features[axis.key];
            const rightFeature = right.features[axis.key];
            return (
              <div key={axis.key} className="rounded-xl bg-slate-50 p-2.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className={`font-mono font-black ${axis.winner === "left" ? "text-emerald-700" : "text-slate-600"}`}>{axis.left_score}</span>
                  <span className="text-center font-bold text-slate-600">{axis.label}</span>
                  <span className={`font-mono font-black ${axis.winner === "right" ? "text-emerald-700" : "text-slate-600"}`}>{axis.right_score}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="ml-auto h-full rounded-full bg-blue-600" style={{ width: `${axis.left_score}%` }} /></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-500" style={{ width: `${axis.right_score}%` }} /></div>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-[9px] text-slate-500">
                  <span className="truncate">{leftFeature.value}</span>
                  <span className="shrink-0 font-mono">Δ {axis.delta_points} pts{axis.difference_percent !== null ? ` · ${axis.difference_percent}%` : ""}</span>
                  <span className="truncate text-right">{rightFeature.value}</span>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-1 gap-2 pt-1 text-[10px] sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-900">
              <strong>{left.name} superior em</strong><br />{comparison.superior_left.length ? comparison.superior_left.join(", ") : "Nenhum eixo comparável."}
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
              <strong>{right.name} superior em</strong><br />{comparison.inferior_left.length ? comparison.inferior_left.join(", ") : "Nenhum eixo comparável."}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{leftId === rightId ? "Escolha dois modelos diferentes." : MISSING}</p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
        <Scale className="mt-0.5 h-3 w-3 shrink-0" /> Só são comparados eixos com a mesma base de cálculo. “Δ pts” é a diferença na escala Brico2; a percentagem aparece apenas quando pode ser calculada sobre valores físicos equivalentes.
      </p>
      <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
        <strong>Relação qualidade/preço:</strong> {analysis.winners?.quality_price?.value || MISSING} {analysis.winners?.quality_price?.explanation}
      </p>
    </div>
  );
}

function ModelSelect({ value, models, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
      {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
    </select>
  );
}

function FeatureAudit({ feature }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-bold text-slate-800">{feature.label}</p>
            <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusTone(feature.status)}`}>{statusLabel(feature.status)}</span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">{feature.value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-black ${feature.score === null ? "border-slate-200 bg-slate-50 text-slate-400" : scoreTone(feature.score)}`}>
          {feature.score ?? "N/D"}
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 p-3 text-[10px] leading-relaxed text-slate-600">
        <p>{feature.explanation}</p>
        {feature.formula ? (
          <div className="rounded-lg bg-slate-950 p-2.5 text-slate-200">
            <p className="flex items-center gap-1 font-bold text-white"><Calculator className="h-3 w-3" /> Cálculo</p>
            <p className="mt-1 font-mono text-[9px]">{feature.formula}</p>
          </div>
        ) : null}
        {feature.standard ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2"><strong className="text-slate-800">Norma</strong><br />{feature.standard}<br /><span className="text-slate-400">{feature.standard_status}</span></div>
            <div className="rounded-lg bg-slate-50 p-2"><strong className="text-slate-800">Escala / melhor classe</strong><br />{feature.official_scale}<br /><span className="text-slate-400">{feature.official_best}</span></div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {(feature.sources || []).filter((source) => source.url).map((source) => (
            <a key={`${source.type}-${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-bold text-blue-700 hover:bg-blue-100">
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <OverallBadge overall={model.overall} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-heading text-lg font-black text-slate-950">{model.name}</h4>
            {model.overall.category ? <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-black text-white">{model.overall.category}</span> : null}
            {model.overall.medal ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"><Award className="h-3 w-3" /> {model.overall.medal}</span> : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{model.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            <span className="rounded bg-white px-2 py-1">Cobertura {model.overall.coverage_percent}%</span>
            {model.overall.rank ? <span className="rounded bg-white px-2 py-1">Ranking #{model.overall.rank}</span> : null}
            {model.overall.percentile ? <span className="rounded bg-white px-2 py-1">Percentil {model.overall.percentile}</span> : null}
          </div>
        </div>
      </div>

      {model.overall.score === null ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span><strong>Overall bloqueado.</strong> {model.overall.explanation} São necessários os cinco eixos centrais comparáveis.</span>
        </p>
      ) : (
        <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-emerald-900">Auditar o Overall geral</summary>
          <div className="border-t border-emerald-100 p-3 text-[10px] leading-relaxed text-emerald-900">
            <p>{model.overall.explanation}</p>
            <p className="mt-2 rounded-lg bg-white/70 p-2 font-mono text-[9px]">{model.overall.formula}</p>
          </div>
        </details>
      )}

      {model.conflicts.length ? (
        <div className="mt-3 space-y-2">
          {model.conflicts.map((conflict) => (
            <div key={conflict.field} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">
              <p className="flex items-center gap-1 font-extrabold"><AlertTriangle className="h-3.5 w-3.5" /> Conflito · {conflict.field}</p>
              <p className="mt-1">{conflict.summary}</p>
              <div className="mt-1 flex flex-wrap gap-2">{conflict.sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="font-bold underline">Abrir fonte</a>)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {Object.values(model.features).map((feature) => <FeatureAudit key={feature.key} feature={feature} />)}
      </div>

      {model.manufacturer_sources.length ? (
        <details className="mt-3 rounded-xl border border-blue-200 bg-blue-50">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-blue-900">Dados do fabricante do sistema · escopo separado</summary>
          <div className="space-y-2 border-t border-blue-100 p-3">
            {model.manufacturer_sources.map((source) => (
              <div key={source.url} className="rounded-lg bg-white p-2.5 text-[10px] text-slate-600">
                <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-blue-700">{source.label} <ExternalLink className="h-3 w-3" /></a>
                <p className="mt-1 font-semibold text-amber-700">{source.scope}</p>
                <p className="mt-1">{Object.entries(source.published).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <InsightList title="Pontos fortes / vantagens" icon={CheckCircle2} items={model.strengths} tone="emerald" />
        <InsightList title="Pontos fracos relativos" icon={BarChart3} items={model.relative_lows} tone="slate" />
        <InsightList title="Limitações documentais" icon={AlertTriangle} items={model.limitations} tone="amber" />
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">Casos de utilização e limites da recomendação</summary>
        <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
          {[...positiveUses, ...unresolvedUses].map((item) => (
            <div key={item.use} className={`rounded-lg p-2 text-[10px] ${item.status === "not_determined" ? "bg-slate-50 text-slate-500" : "bg-emerald-50 text-emerald-900"}`}>
              <p className="font-extrabold">{item.use}</p><p className="mt-0.5 leading-relaxed">{item.reason}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function InsightList({ title, icon: Icon, items, tone }) {
  const classes = tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700";
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
  if (!analysis || !models.length) return null;
  const selected = analysis.model_index?.[selectedId] || models[0];
  const spotlight = ranked.length ? ranked.slice(0, 3) : models.slice(0, 3);

  return (
    <section className={`${standalone ? "" : "mt-4"} overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl sm:rounded-3xl`}>
      <div className="relative p-3 sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300"><Trophy className="h-5 w-5" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-black text-white">Overall técnico do catálogo</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] text-slate-400">{analysis.methodology.name}</span>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">Comparação rápida com fórmula, norma e fonte em cada nota. É um índice Brico2 auditável — não uma certificação.</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto">
            <Stat value={analysis.stats.catalog_models} label="modelos" />
            <Stat value={analysis.stats.ranked_models} label="no ranking" />
            <Stat value={analysis.stats.models_with_conflicts} label="conflitos" />
          </div>
        </div>

        <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1">
          {spotlight.map((model) => <RankingCard key={model.id} model={model} selected={selected.id === model.id} onSelect={() => setSelectedId(model.id)} />)}
        </div>
        <WinnerStrip winners={analysis.winners} />
      </div>

      <details open={analysisOpen} onToggle={(event) => setAnalysisOpen(event.currentTarget.open)} className="group border-t border-white/10 bg-slate-900/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-extrabold text-white hover:bg-white/[0.03] sm:px-5">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-300" /> {analysisOpen ? "Ocultar análise detalhada" : "Abrir análise, comparação e auditoria completa"}</span>
          <ArrowRight className="h-4 w-4 text-slate-500 transition group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t border-white/10 bg-slate-100 p-2 sm:p-4">
          <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
            <div className="order-2 space-y-3 xl:order-1">
              <ComparisonPanel analysis={analysis} leftId={leftId} rightId={rightId} onLeft={setLeftId} onRight={setRightId} />
              <div className="hidden rounded-2xl border border-slate-200 bg-white p-3 xl:block">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900"><Database className="h-4 w-4 text-blue-700" /> Todos os modelos</p>
                <div className="mt-2 space-y-1">
                  {models.map((model) => (
                    <button key={model.id} type="button" onClick={() => setSelectedId(model.id)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left ${selected.id === model.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-black ${selected.id === model.id ? scoreTone(model.overall.score) : "border-slate-200 bg-slate-50 text-slate-600"}`}>{model.overall.score ?? "N/D"}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{model.name}</span><span className={`block truncate text-[9px] ${selected.id === model.id ? "text-slate-400" : "text-slate-400"}`}>{model.category_label}</span></span>
                      {model.conflicts.length ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-[10px] leading-relaxed text-blue-900">
                <p className="flex items-center gap-1 font-extrabold"><BookOpenCheck className="h-3.5 w-3.5" /> Atualização protegida</p>
                <p className="mt-1">{analysis.methodology.update_rule}</p>
              </div>
              <MethodologyPanel methodology={analysis.methodology} models={models} />
            </div>
            <div className="order-1 space-y-3 xl:order-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 xl:hidden">
                <label htmlFor="catalog-model-mobile" className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Modelo em análise</label>
                <select id="catalog-model-mobile" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">
                  {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.overall.score ?? "N/D"}</option>)}
                </select>
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
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2.5 text-xs font-extrabold text-slate-800">Pesos, categorias e regra do ranking</summary>
      <div className="space-y-3 border-t border-slate-100 p-3 text-[10px] leading-relaxed text-slate-600">
        <p>{methodology.ranking_rule}</p>
        <div>
          <p className="font-extrabold text-slate-800">Pesos definidos</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(methodology.weights).map(([key, weight]) => (
              <span key={key} className={`rounded-md px-2 py-1 ${methodology.active_features.includes(key) ? "bg-emerald-50 font-bold text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                {labelFor(key)} {weight}%{methodology.active_features.includes(key) ? " · ativo" : " · sem cobertura comum"}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="font-extrabold text-slate-800">Categorias Brico2</p>
          <p className="mt-1 font-mono text-[9px]">{methodology.category_bands.map((band) => `${band.category} ≥ ${band.minimum}`).join(" · ")}</p>
        </div>
        <p className="rounded-lg bg-amber-50 p-2 text-amber-900"><strong>Regra de segurança:</strong> {methodology.missing_text}</p>
      </div>
    </details>
  );
}

function Stat({ value, label }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
      <p className="font-mono text-sm font-black text-white">{value}</p>
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
