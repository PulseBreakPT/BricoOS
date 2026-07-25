import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BookOpenCheck, Check, ChevronDown, Copy, ExternalLink, GitCompare, Info,
  Plus, Sparkles, Trash2,
} from "lucide-react";
import api from "@/lib/api";
import {
  caixilhariaLabels, createCaixLine, createCaixOption, createEmptyCaixilharia,
  emptyCaixilharia, isModelCompatible, measurementDisplayValue, measurementToMillimetres,
  normalizeCaixilhariaSpec, validateCaixilhariaSpec,
} from "@/lib/caixilharia";

export {
  caixilhariaLabels, createCaixLine, createCaixOption, createEmptyCaixilharia,
  emptyCaixilharia, isModelCompatible, measurementDisplayValue, measurementToMillimetres,
  normalizeCaixilhariaSpec, validateCaixilhariaSpec,
};

// Cache do catálogo — é estático por sessão, não vale a pena repetir o pedido.
let catalogCache = null;
let catalogInFlight = null;
export async function getCaixilhariaCatalog() {
  if (catalogCache) return catalogCache;
  // Duas chamadas em quase simultâneo (ex.: o diálogo do pedido e o formulário
  // dentro dele a montar ao mesmo tempo) partilham o mesmo pedido em vez de
  // dispararem duas chamadas à API antes da primeira responder.
  if (!catalogInFlight) {
    catalogInFlight = api.get("/caixilharia/catalog")
      .then(({ data }) => { catalogCache = data; return data; })
      .finally(() => { catalogInFlight = null; });
  }
  return catalogInFlight;
}

const optionLetter = (index) => String.fromCharCode(65 + index);

// Pontuação global do catálogo técnico para um modelo (ou null sem dados).
function modelOverall(catalog, systemKey) {
  if (!systemKey) return null;
  const id = catalog.analise_tecnica?.aliases?.[systemKey] || systemKey;
  const overall = catalog.analise_tecnica?.model_index?.[id]?.overall;
  return overall && overall.score != null ? overall : null;
}

// Título de secção centrado com traços — a mesma linguagem visual do resto da app.
function MiniTitle({ title, first = false }) {
  return (
    <div className={`flex items-center gap-3 ${first ? "" : "mt-5"}`}>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-border" />
      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{title}</span>
      <span aria-hidden className="flex-1 border-t-2 border-dashed border-border" />
    </div>
  );
}

function OverallBadge({ overall, selected = false }) {
  if (!overall) return null;
  const medalTone = overall.medal === "Ouro"
    ? "bg-amber-300 text-amber-950"
    : overall.medal === "Prata"
      ? "bg-sky-300 text-sky-950"
      : overall.medal === "Bronze"
        ? "bg-orange-300 text-orange-950"
        : selected ? "bg-card/25 text-white" : "bg-foreground/10 text-foreground";
  return (
    <span className={`ml-1.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${medalTone}`}>
      {overall.score}
    </span>
  );
}

export default function CaixilhariaForm({ catalog, spec, onChange }) {
  const normalized = normalizeCaixilhariaSpec(spec);
  const [expandedLineId, setExpandedLineId] = useState(normalized.linhas[0]?.id || "");
  const lineIds = normalized.linhas.map((line) => line.id).join("|");
  const firstLineId = normalized.linhas[0]?.id || "";
  useEffect(() => {
    if (expandedLineId && !lineIds.split("|").includes(expandedLineId)) {
      setExpandedLineId(firstLineId);
    }
  }, [expandedLineId, firstLineId, lineIds]);
  const setTop = (key, value) => onChange({ ...normalized, [key]: value });
  const updateLines = (lines) => onChange({ ...normalized, linhas: lines });
  const updateLine = (lineIndex, update) => updateLines(
    normalized.linhas.map((line, index) => (index === lineIndex ? { ...line, ...update } : line)),
  );

  const addLine = (product = "janela") => {
    const nextLine = createCaixLine(product);
    setExpandedLineId(nextLine.id);
    updateLines([...normalized.linhas, nextLine]);
  };
  const duplicateLine = (lineIndex) => {
    const source = normalized.linhas[lineIndex];
    const copy = createCaixLine(source.produto, {
      ...source, id: "", nome: source.nome ? `${source.nome} (cópia)` : "",
      opcoes: source.opcoes.map((option) => ({ ...option, id: "" })),
    });
    setExpandedLineId(copy.id);
    updateLines([...normalized.linhas.slice(0, lineIndex + 1), copy, ...normalized.linhas.slice(lineIndex + 1)]);
  };
  // Sugestão: depois de medir uma janela/porta, oferece adicionar a rede
  // mosquiteira ou portada correspondente já com as mesmas medidas. "Já
  // adicionada" é derivado dos elementos existentes (não é estado à parte),
  // por isso fica sempre correto mesmo que o elemento seja removido depois.
  const hasCompanion = (line, product) => normalized.linhas.some((other) => (
    other.id !== line.id && other.produto === product
    && String(other.largura_mm) === String(line.largura_mm)
    && String(other.altura_mm) === String(line.altura_mm)
  ));
  const addCompanionLine = (lineIndex, product) => {
    const source = normalized.linhas[lineIndex];
    const companion = createCaixLine(product, {
      largura_mm: source.largura_mm,
      altura_mm: source.altura_mm,
      unidade_entrada: source.unidade_entrada,
      quantidade: source.quantidade,
      nome: source.nome ? `${source.nome} — ${catalog.produtos[product] || ""}`.trim() : "",
    });
    setExpandedLineId(companion.id);
    updateLines([...normalized.linhas.slice(0, lineIndex + 1), companion, ...normalized.linhas.slice(lineIndex + 1)]);
  };
  const removeLine = (lineIndex) => {
    if (normalized.linhas.length === 1) return;
    const remaining = normalized.linhas.filter((_, index) => index !== lineIndex);
    if (normalized.linhas[lineIndex].id === expandedLineId) {
      setExpandedLineId(remaining[Math.max(0, lineIndex - 1)]?.id || remaining[0]?.id || "");
    }
    updateLines(remaining);
  };

  const pickProduct = (lineIndex, product) => {
    const line = normalized.linhas[lineIndex];
    const openingType = product === "portada" ? "portada" : product === "rede_mosquiteira" ? "rede" : "";
    const nextLine = { ...line, produto: product, tipo_abertura: openingType };
    const validOptions = line.opcoes
      .filter((option) => catalog.familias[option.familia]?.produtos.includes(product))
      .map((option) => (
        isModelCompatible(catalog.modelos?.[option.sistema], nextLine) ? option : { ...option, sistema: "" }
      ));
    updateLine(lineIndex, {
      produto: product,
      tipo_abertura: openingType,
      numero_folhas: "",
      opcoes: validOptions.length ? validOptions : [createCaixOption()],
    });
  };
  const pickOpeningType = (lineIndex, openingType) => {
    const line = normalized.linhas[lineIndex];
    const nextLine = { ...line, tipo_abertura: openingType };
    updateLine(lineIndex, {
      tipo_abertura: openingType,
      opcoes: line.opcoes.map((option) => (
        isModelCompatible(catalog.modelos?.[option.sistema], nextLine) ? option : { ...option, sistema: "" }
      )),
    });
  };
  // Medidas sempre em milímetros — sem seletor de unidade a atrapalhar.
  const setMeasurement = (lineIndex, key, value) => {
    updateLine(lineIndex, { [key]: measurementToMillimetres(value, "mm"), unidade_entrada: "mm" });
  };
  const setOption = (lineIndex, optionIndex, key, value) => {
    const line = normalized.linhas[lineIndex];
    const options = line.opcoes.map((option, index) => (
      index === optionIndex ? { ...option, [key]: value } : option
    ));
    updateLine(lineIndex, { opcoes: options });
  };
  const suggestedSystem = (familyKey, line) => {
    const systems = Object.keys(catalog.familias[familyKey]?.sistemas || {}).filter(
      (key) => isModelCompatible(catalog.modelos?.[key], line),
    );
    return systems.length === 1 ? systems[0] : "";
  };
  const pickFamily = (lineIndex, optionIndex, family) => {
    const current = normalized.linhas[lineIndex].opcoes[optionIndex];
    setOptionPair(lineIndex, optionIndex, {
      familia: family,
      sistema: current.familia === family ? current.sistema : suggestedSystem(family, normalized.linhas[lineIndex]),
    });
  };
  const setOptionPair = (lineIndex, optionIndex, values) => {
    const line = normalized.linhas[lineIndex];
    updateLine(lineIndex, {
      opcoes: line.opcoes.map((option, index) => (index === optionIndex ? { ...option, ...values } : option)),
    });
  };
  const addOption = (lineIndex, comparison = false) => {
    const line = normalized.linhas[lineIndex];
    const allowed = Object.entries(catalog.familias).filter(([, family]) => family.produtos.includes(line.produto));
    const used = new Set(line.opcoes.map((option) => option.familia));
    let family = "";
    if (comparison) {
      if (!used.has("pvc") && catalog.familias.pvc?.produtos.includes(line.produto)) family = "pvc";
      else family = allowed.find(([key]) => key.startsWith("aluminio") && !used.has(key))?.[0] || "";
    }
    if (!family) family = allowed.find(([key]) => !used.has(key))?.[0] || "";
    updateLine(lineIndex, {
      opcoes: [...line.opcoes, createCaixOption({ familia: family, sistema: suggestedSystem(family, line) })],
    });
  };
  const removeOption = (lineIndex, optionIndex) => {
    const line = normalized.linhas[lineIndex];
    if (line.opcoes.length === 1) return;
    updateLine(lineIndex, { opcoes: line.opcoes.filter((_, index) => index !== optionIndex) });
  };

  const hasComparisons = normalized.linhas.some((line) => line.opcoes.length > 1);
  const totalUnits = normalized.linhas.reduce((sum, line) => sum + (parseInt(line.quantidade, 10) || 0), 0);

  return (
    <div>
      {/* Cabeçalho compacto: aviso + atalho para o catálogo técnico */}
      {catalog.catalog_meta ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-blue-300">
              <BookOpenCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-foreground">Pedido de caixilharia</p>
              <p className="truncate text-[11px] text-muted-foreground">{catalog.aviso}</p>
            </div>
          </div>
          <a
            href="/catalogo-tecnico"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-sm hover:border-blue-300 hover:text-[color:var(--pastel-blue-text)]"
          >
            <span className="hidden sm:inline">Comparar modelos</span>
            <span className="sm:hidden">Modelos</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {hasComparisons ? (
        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-[var(--pastel-blue-bg)] p-2.5 text-xs text-[color:var(--pastel-blue-text)]">
          <GitCompare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pedido comparativo: o email pede um preço separado para cada opção.
        </p>
      ) : null}

      {/* Elementos */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <h3 className="font-heading text-base font-extrabold text-foreground">Elementos do pedido</h3>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
          {normalized.linhas.length} elem. · {totalUnits} un
        </span>
      </div>

      <div className="mt-2 space-y-3">
        {normalized.linhas.map((line, lineIndex) => (
          <section
            key={line.id}
            data-testid={`caix-line-${lineIndex}`}
            className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors ${expandedLineId === line.id ? "border-blue-300 ring-1 ring-blue-100" : "border-border"}`}
          >
            {/* Cabeçalho do elemento */}
            <div className={`flex items-center gap-1 bg-muted/80 px-2 py-1.5 sm:gap-2 sm:px-3 ${expandedLineId === line.id ? "border-b border-border" : ""}`}>
              <button
                type="button"
                onClick={() => setExpandedLineId(expandedLineId === line.id ? "" : line.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-expanded={expandedLineId === line.id}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-xs font-extrabold text-background">{lineIndex + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-foreground">{line.nome || catalog.produtos[line.produto] || "Elemento"}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {line.largura_mm && line.altura_mm ? `${line.largura_mm} × ${line.altura_mm} mm` : "Medidas por preencher"}
                    {line.opcoes.some((option) => option.sistema)
                      ? ` · ${line.opcoes.map((option) => catalog.modelos?.[option.sistema]?.name).filter(Boolean).join(" + ")}`
                      : ` · ${line.opcoes.length} opção${line.opcoes.length === 1 ? "" : "ões"}`}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandedLineId === line.id ? "rotate-180" : ""}`} />
              </button>
              <button type="button" onClick={() => duplicateLine(lineIndex)} title="Duplicar elemento" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-card hover:text-foreground">
                <Copy className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => removeLine(lineIndex)} disabled={normalized.linhas.length === 1} title="Remover elemento" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-[var(--pastel-red-bg)] hover:text-destructive disabled:opacity-25">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {expandedLineId === line.id ? <div className="p-3 sm:p-5">
              {/* 1. Produto */}
              <MiniTitle first title="Produto" />
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(catalog.produtos).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    data-testid={`caix-line-${lineIndex}-produto-${key}`}
                    onClick={() => pickProduct(lineIndex, key)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors ${line.produto === key ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Identificação (opcional)</Label>
                <Input value={line.nome} onChange={(event) => updateLine(lineIndex, { nome: event.target.value })} placeholder="Ex.: Porta da entrada, janela da cozinha" />
              </div>

              {/* 2. Medidas — sempre em milímetros */}
              <MiniTitle title="Medidas (mm)" />
              <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:gap-3">
                <div className="space-y-1.5">
                  <Label>Largura</Label>
                  <Input
                    type="number"
                    min={50}
                    step={1}
                    value={measurementDisplayValue(line.largura_mm, "mm")}
                    onChange={(event) => setMeasurement(lineIndex, "largura_mm", event.target.value)}
                    placeholder={line.produto === "porta" ? "800" : "1000"}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Altura</Label>
                  <Input
                    type="number"
                    min={50}
                    step={1}
                    value={measurementDisplayValue(line.altura_mm, "mm")}
                    onChange={(event) => setMeasurement(lineIndex, "altura_mm", event.target.value)}
                    placeholder={line.produto === "porta" ? "2000" : "1000"}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={line.quantidade} onChange={(event) => updateLine(lineIndex, { quantidade: event.target.value })} className="font-mono" />
                </div>
              </div>

              {["janela", "porta"].includes(line.produto) && line.largura_mm && line.altura_mm ? (
                <div className="mt-3 rounded-xl border border-dashed border-blue-200 bg-[var(--pastel-blue-bg)] p-3">
                  <p className="text-xs font-semibold text-[color:var(--pastel-blue-text)]">Incluir rede mosquiteira ou portada com as mesmas medidas?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[["rede_mosquiteira", "Rede mosquiteira", "rede"], ["portada", "Portada", "portada"]].map(([product, label, slug]) => {
                      const added = hasCompanion(line, product);
                      return (
                        <Button
                          key={product}
                          type="button"
                          data-testid={`caix-line-${lineIndex}-add-${slug}`}
                          variant="outline"
                          size="sm"
                          disabled={added}
                          onClick={() => addCompanionLine(lineIndex, product)}
                          className={`h-8 rounded-lg text-xs ${added ? "border-success/30 bg-success-bg text-success disabled:opacity-100" : ""}`}
                        >
                          {added ? <Check className="mr-1 h-3.5 w-3.5" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                          {label}{added ? " adicionada" : ""}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* 3. Abertura */}
              <MiniTitle title="Abertura" />
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de abertura</Label>
                  <Select value={line.tipo_abertura || "none"} onValueChange={(value) => pickOpeningType(lineIndex, value === "none" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Por definir</SelectItem>
                      {Object.entries(catalog.tipos_abertura || {}).filter(([key]) => {
                        if (!key) return false;
                        if (line.produto === "portada") return key === "portada";
                        if (line.produto === "rede_mosquiteira") return key === "rede";
                        return !["portada", "rede"].includes(key);
                      }).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>N.º de folhas</Label>
                  <Input type="number" min={1} max={6} value={line.numero_folhas} onChange={(event) => updateLine(lineIndex, { numero_folhas: event.target.value })} placeholder="Ex.: 2" className="font-mono" />
                </div>
                <div className="col-span-2 space-y-1.5 sm:col-span-1">
                  <Label>Lado / direção</Label>
                  <Select value={line.sentido_abertura || "none"} onValueChange={(value) => updateLine(lineIndex, { sentido_abertura: value === "none" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Por definir</SelectItem>
                      {catalog.sentidos.map((direction) => <SelectItem key={direction} value={direction}>{direction}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 4. Material e modelo */}
              <MiniTitle title="Material e modelo" />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">As medidas acima aplicam-se a todas as opções deste elemento.</p>
                {line.opcoes.length > 1 ? <span className="shrink-0 rounded-full bg-[var(--pastel-blue-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-blue-text)]">COMPARAÇÃO</span> : null}
              </div>

              <div className="mt-2 space-y-3">
                {line.opcoes.map((option, optionIndex) => (
                  <OptionEditor
                    key={option.id}
                    catalog={catalog}
                    line={line}
                    lineIndex={lineIndex}
                    option={option}
                    optionIndex={optionIndex}
                    onSet={(key, value) => setOption(lineIndex, optionIndex, key, value)}
                    onSetPair={(values) => setOptionPair(lineIndex, optionIndex, values)}
                    onPickFamily={(family) => pickFamily(lineIndex, optionIndex, family)}
                    onRemove={() => removeOption(lineIndex, optionIndex)}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addOption(lineIndex)} className="h-9 rounded-xl text-xs">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar outra opção
                </Button>
                {["janela", "porta"].includes(line.produto) ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => addOption(lineIndex, true)} className="h-9 rounded-xl border-blue-200 text-xs text-[color:var(--pastel-blue-text)] hover:bg-[var(--pastel-blue-bg)]">
                    <GitCompare className="mr-1 h-3.5 w-3.5" /> Comparar PVC / alumínio
                  </Button>
                ) : null}
              </div>

              {/* 5. Notas do elemento */}
              <MiniTitle title="Notas" />
              <div className="mt-2.5 space-y-1.5">
                <Textarea value={line.observacoes} onChange={(event) => updateLine(lineIndex, { observacoes: event.target.value })} rows={2} placeholder="Só deste elemento — ex.: manter o desenho atual, soleira baixa..." />
              </div>
              <Button type="button" variant="outline" onClick={() => setExpandedLineId("")} className="mt-4 h-10 w-full rounded-xl border-success/30 text-xs font-bold text-success hover:bg-success-bg">
                <Check className="mr-1.5 h-4 w-4" /> Concluir este elemento
              </Button>
            </div> : null}
          </section>
        ))}
      </div>

      {/* Adicionar elementos */}
      <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/50 p-3">
        <p className="text-xs font-bold text-foreground">Adicionar outro elemento</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(catalog.produtos).map(([key, label]) => (
            <Button key={key} type="button" variant="outline" size="sm" onClick={() => addLine(key)} className="h-9 rounded-xl bg-card text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Observações gerais do pedido */}
      <div className="mt-5 space-y-1.5">
        <Label>Observações gerais</Label>
        <Textarea data-testid="caix-observacoes" value={normalized.observacoes} onChange={(event) => setTop("observacoes", event.target.value)} rows={2} placeholder="Informação comum a todo o pedido..." />
      </div>
    </div>
  );
}

function OptionEditor({ catalog, line, lineIndex, option, optionIndex, onSet, onSetPair, onPickFamily, onRemove }) {
  const families = Object.entries(catalog.familias).filter(([, family]) => family.produtos.includes(line.produto));
  const selectedFamily = catalog.familias[option.familia];
  const selectedModel = catalog.modelos?.[option.sistema];
  const analysisId = catalog.analise_tecnica?.aliases?.[option.sistema] || option.sistema;
  const compatibleSystems = selectedFamily ? Object.entries(selectedFamily.sistemas).filter(
    ([key]) => isModelCompatible(catalog.modelos?.[key], line),
  ) : [];
  const isNet = option.familia === "redes";

  return (
    <div data-testid={`caix-line-${lineIndex}-option-${optionIndex}`} className={`rounded-xl border p-3 ${line.opcoes.length > 1 ? "border-blue-200 bg-[var(--pastel-blue-bg)]" : "border-border bg-muted/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Opção {optionLetter(optionIndex)}</p>
        <button type="button" onClick={onRemove} disabled={line.opcoes.length === 1} className="rounded-lg p-1 text-muted-foreground hover:bg-[var(--pastel-red-bg)] hover:text-destructive disabled:opacity-25">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        <Label>Material / família</Label>
        <div className="sm:hidden">
          <Select value={option.familia || "none"} onValueChange={(value) => onPickFamily(value === "none" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder="Escolher material" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolher material</SelectItem>
              {families.map(([key, family]) => <SelectItem key={key} value={key}>{family.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden flex-wrap gap-1.5 sm:flex">
          {families.map(([key, family]) => (
            <button
              key={key}
              type="button"
              onClick={() => onPickFamily(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${option.familia === key ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {family.label}
            </button>
          ))}
        </div>
      </div>

      {selectedFamily ? (
        <div className="mt-3 space-y-1.5">
          <Label>Modelo / série</Label>
          <div className="sm:hidden">
            <Select value={option.sistema || "none"} onValueChange={(value) => onSet("sistema", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Escolher modelo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Escolher modelo</SelectItem>
                {compatibleSystems.map(([key, label]) => {
                  const overall = modelOverall(catalog, key);
                  return (
                    <SelectItem key={key} value={key}>
                      {label}{overall ? ` · ${overall.score}${overall.medal ? ` (${overall.medal})` : ""}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden flex-wrap gap-1.5 sm:flex">
            {compatibleSystems.map(([key, label]) => {
              const overall = modelOverall(catalog, key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSet("sistema", key)}
                  className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${option.sistema === key ? "bg-blue-700 text-white" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
                >
                  {label}
                  <OverallBadge overall={overall} selected={option.sistema === key} />
                </button>
              );
            })}
          </div>
          {!compatibleSystems.length ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-[var(--pastel-amber-bg)] p-2 text-xs text-[color:var(--pastel-amber-text)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Não há modelos desta família compatíveis com o tipo de abertura escolhido.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[color:var(--pastel-amber-text)]">Escolhe primeiro o material.</p>
      )}

      {selectedModel ? (
        <SelectedModelSummary model={selectedModel} analysisId={analysisId} overall={modelOverall(catalog, option.sistema)} />
      ) : null}

      <details className="mt-3 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-muted-foreground">Acabamento e acessórios</summary>
        <div className="border-t border-border p-3">
          {isNet ? (
            <div className="space-y-1.5">
              <Label>Cor do perfil</Label>
              <Input value={option.cor_aro} onChange={(event) => onSet("cor_aro", event.target.value)} placeholder="Ex.: Branco RAL 9016" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Vidro / painéis</Label>
                  <Select value={option.material || "none"} onValueChange={(value) => onSet("material", value === "none" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {Object.entries(catalog.materiais).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Cor</Label>
                  <Input value={option.cor_aro} onChange={(event) => onSet("cor_aro", event.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
              </div>
              {catalog.vidros?.[option.material] ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--pastel-blue-bg)] p-2 text-[11px] leading-relaxed text-[color:var(--pastel-blue-text)]">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  <span><strong>{catalog.vidros[option.material].benefit}</strong> {catalog.vidros[option.material].typical_use}</span>
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <OptionSelect
                  label="Quadrícula decorativa"
                  value={option.quadricula}
                  options={catalog.quadriculas || {}}
                  onChange={(value) => onSetPair({
                    quadricula: value,
                    quadricula_cor: value === "sem" ? "" : option.quadricula_cor,
                  })}
                />
                <div className="space-y-1.5">
                  <Label>Cor da quadrícula</Label>
                  <Input
                    value={option.quadricula_cor}
                    onChange={(event) => onSet("quadricula_cor", event.target.value)}
                    disabled={!option.quadricula || option.quadricula === "sem"}
                    placeholder="Ex.: igual à caixilharia"
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <OptionSelect label="Fechadura" value={option.fechadura} options={catalog.fechaduras} onChange={(value) => onSet("fechadura", value)} />
                <OptionSelect label="Muletas" value={option.muletas} options={catalog.muletas} onChange={(value) => onSet("muletas", value)} />
                <OptionSelect label="Estore" value={option.estore} options={catalog.estores} onChange={(value) => onSet("estore", value)} />
              </div>
            </>
          )}
          <div className="mt-3 space-y-1.5">
            <Label>Observações desta opção</Label>
            <Textarea value={option.observacoes} onChange={(event) => onSet("observacoes", event.target.value)} rows={2} placeholder="O que muda apenas nesta opção..." />
          </div>
        </div>
      </details>
    </div>
  );
}

function SelectedModelSummary({ model, analysisId, overall }) {
  return (
    <div className="mt-3 rounded-xl border border-success/30 bg-success-bg p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-extrabold text-foreground">
            {model.name}
            {overall ? (
              <span className="ml-1.5 rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-success">
                {overall.score}{overall.medal ? ` · ${overall.medal}` : ""}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{model.category_label}</p>
        </div>
        <a href={`/catalogo-tecnico?modelo=${encodeURIComponent(analysisId)}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-card px-2 py-1.5 text-[10px] font-bold text-[color:var(--pastel-blue-text)] hover:bg-[var(--pastel-blue-bg)]">
          Ver ficha <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function OptionSelect({ label, value, options, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {Object.entries(options).map(([key, optionLabel]) => <SelectItem key={key} value={key}>{optionLabel}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
