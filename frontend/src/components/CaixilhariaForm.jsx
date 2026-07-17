import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BookOpen, Copy, ExternalLink, Eye, GitCompare, Info, Layers3, Plus, Ruler,
  ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import api from "@/lib/api";
import CatalogIntelligence from "@/components/CatalogIntelligence";
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
export async function getCaixilhariaCatalog() {
  if (!catalogCache) {
    const { data } = await api.get("/caixilharia/catalog");
    catalogCache = data;
  }
  return catalogCache;
}

const optionLetter = (index) => String.fromCharCode(65 + index);

export default function CaixilhariaForm({ catalog, spec, onChange }) {
  const normalized = normalizeCaixilhariaSpec(spec);
  const setTop = (key, value) => onChange({ ...normalized, [key]: value });
  const updateLines = (lines) => onChange({ ...normalized, linhas: lines });
  const updateLine = (lineIndex, update) => updateLines(
    normalized.linhas.map((line, index) => (index === lineIndex ? { ...line, ...update } : line)),
  );

  const addLine = (product = "janela") => updateLines([...normalized.linhas, createCaixLine(product)]);
  const duplicateLine = (lineIndex) => {
    const source = normalized.linhas[lineIndex];
    const copy = createCaixLine(source.produto, {
      ...source, id: "", nome: source.nome ? `${source.nome} (cópia)` : "",
      opcoes: source.opcoes.map((option) => ({ ...option, id: "" })),
    });
    updateLines([...normalized.linhas.slice(0, lineIndex + 1), copy, ...normalized.linhas.slice(lineIndex + 1)]);
  };
  const removeLine = (lineIndex) => {
    if (normalized.linhas.length === 1) return;
    updateLines(normalized.linhas.filter((_, index) => index !== lineIndex));
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
  const setMeasurement = (lineIndex, key, value) => {
    const line = normalized.linhas[lineIndex];
    updateLine(lineIndex, { [key]: measurementToMillimetres(value, line.unidade_entrada) });
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
      {catalog.catalog_meta ? (
        <div className="rounded-2xl bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300">
              <BookOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-extrabold">Catálogo técnico BandAlumínios</p>
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  revisto {catalog.catalog_meta.checked_at}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{catalog.catalog_meta.notice}</p>
              <a href={catalog.catalog_meta.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-300 hover:text-blue-200">
                Abrir catálogo oficial <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold uppercase tracking-wide text-amber-800">
        <Eye className="h-4 w-4 shrink-0" /> {catalog.aviso}
      </div>
      <CatalogIntelligence analysis={catalog.analise_tecnica} />

      <div className="mt-4 flex gap-2">
        {[['orcamento', 'Orçamento'], ['encomenda', 'Encomenda']].map(([key, label]) => {
          const disabled = key === "encomenda" && hasComparisons;
          return (
            <button
              key={key}
              type="button"
              data-testid={`caix-tipo-${key}`}
              onClick={() => !disabled && setTop("tipo_pedido", key)}
              disabled={disabled}
              title={disabled ? "Remova as alternativas antes de transformar em encomenda" : ""}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${normalized.tipo_pedido === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {hasComparisons ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700">
          <GitCompare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este é um pedido comparativo. O email pedirá um preço separado para cada opção.
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900">
            <Layers3 className="h-4 w-4" /> Elementos do pedido
          </h3>
          <p className="text-xs text-slate-500">Um elemento por porta, janela, portada ou rede com medidas próprias.</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {normalized.linhas.length} elem. · {totalUnits} un
        </span>
      </div>

      <div className="mt-3 space-y-4">
        {normalized.linhas.map((line, lineIndex) => (
          <section key={line.id} data-testid={`caix-line-${lineIndex}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 sm:px-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-extrabold text-white">{lineIndex + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{line.nome || catalog.produtos[line.produto] || "Elemento"}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {line.largura_mm && line.altura_mm
                    ? `${line.largura_mm} × ${line.altura_mm} mm · ${line.largura_mm / 10} × ${line.altura_mm / 10} cm · `
                    : ""}
                  {line.opcoes.length} opção{line.opcoes.length === 1 ? "" : "ões"}
                </p>
              </div>
              <button type="button" onClick={() => duplicateLine(lineIndex)} title="Duplicar elemento" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
                <Copy className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => removeLine(lineIndex)} disabled={normalized.linhas.length === 1} title="Remover elemento" className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-25">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 sm:p-4">
              <div className="space-y-1.5">
                <Label>Identificação (opcional)</Label>
                <Input value={line.nome} onChange={(event) => updateLine(lineIndex, { nome: event.target.value })} placeholder="Ex.: Porta da entrada, janela da cozinha" />
              </div>

              <div className="mt-4 space-y-1.5">
                <Label>Produto</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(catalog.produtos).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={`caix-line-${lineIndex}-produto-${key}`}
                      onClick={() => pickProduct(lineIndex, key)}
                      className={`rounded-xl border px-2 py-2 text-xs font-bold ${line.produto === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={line.quantidade} onChange={(event) => updateLine(lineIndex, { quantidade: event.target.value })} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Introduzir medidas em</Label>
                  <Select value={line.unidade_entrada || "mm"} onValueChange={(value) => updateLine(lineIndex, { unidade_entrada: value })}>
                    <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mm">Milímetros (mm)</SelectItem>
                      <SelectItem value="cm">Centímetros (cm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Ruler className="h-3 w-3" /> Largura ({line.unidade_entrada})</Label>
                  <Input
                    type="number"
                    min={line.unidade_entrada === "cm" ? 5 : 50}
                    step={line.unidade_entrada === "cm" ? 0.1 : 1}
                    value={measurementDisplayValue(line.largura_mm, line.unidade_entrada)}
                    onChange={(event) => setMeasurement(lineIndex, "largura_mm", event.target.value)}
                    placeholder={line.unidade_entrada === "cm" ? (line.produto === "porta" ? "80" : "100") : (line.produto === "porta" ? "800" : "1000")}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Altura ({line.unidade_entrada})</Label>
                  <Input
                    type="number"
                    min={line.unidade_entrada === "cm" ? 5 : 50}
                    step={line.unidade_entrada === "cm" ? 0.1 : 1}
                    value={measurementDisplayValue(line.altura_mm, line.unidade_entrada)}
                    onChange={(event) => setMeasurement(lineIndex, "altura_mm", event.target.value)}
                    placeholder={line.unidade_entrada === "cm" ? (line.produto === "porta" ? "200" : "100") : (line.produto === "porta" ? "2000" : "1000")}
                    className="font-mono"
                  />
                </div>
              </div>
              {line.largura_mm && line.altura_mm ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                  Pedido: {line.largura_mm} × {line.altura_mm} mm · {line.largura_mm / 10} × {line.altura_mm / 10} cm (L × A)
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  <Label>Número de folhas</Label>
                  <Input type="number" min={1} max={6} value={line.numero_folhas} onChange={(event) => updateLine(lineIndex, { numero_folhas: event.target.value })} placeholder="Ex.: 2" className="font-mono" />
                </div>
                <div className="space-y-1.5">
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

              <div className="mt-5 flex items-center justify-between gap-2">
                <div>
                  <Label>Opções de fabrico</Label>
                  <p className="text-[11px] text-slate-400">As medidas acima aplicam-se a todas as opções deste elemento.</p>
                </div>
                {line.opcoes.length > 1 ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">COMPARAÇÃO</span> : null}
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

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" size="sm" onClick={() => addOption(lineIndex)} className="h-9 flex-1 rounded-xl text-xs">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar outra opção
                </Button>
                {["janela", "porta"].includes(line.produto) ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => addOption(lineIndex, true)} className="h-9 flex-1 rounded-xl border-blue-200 text-xs text-blue-700 hover:bg-blue-50">
                    <GitCompare className="mr-1 h-3.5 w-3.5" /> Comparar PVC / alumínio
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 space-y-1.5">
                <Label>Observações deste elemento</Label>
                <Textarea value={line.observacoes} onChange={(event) => updateLine(lineIndex, { observacoes: event.target.value })} rows={2} placeholder="Ex.: manter o desenho atual, soleira baixa..." />
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-3">
        <p className="text-xs font-bold text-slate-700">Adicionar outro elemento</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(catalog.produtos).map(([key, label]) => (
            <Button key={key} type="button" variant="outline" size="sm" onClick={() => addLine(key)} className="h-9 rounded-xl bg-white text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_11rem]">
        <div className="space-y-1.5">
          <Label>Observações gerais</Label>
          <Textarea data-testid="caix-observacoes" value={normalized.observacoes} onChange={(event) => setTop("observacoes", event.target.value)} rows={2} placeholder="Informação comum a todo o pedido..." />
        </div>
        <div className="space-y-1.5">
          <Label>Entrega pretendida</Label>
          <Input data-testid="caix-data-entrega" type="date" value={normalized.data_entrega} onChange={(event) => setTop("data_entrega", event.target.value)} />
        </div>
      </div>
    </div>
  );
}

function OptionEditor({ catalog, line, lineIndex, option, optionIndex, onSet, onSetPair, onPickFamily, onRemove }) {
  const families = Object.entries(catalog.familias).filter(([, family]) => family.produtos.includes(line.produto));
  const selectedFamily = catalog.familias[option.familia];
  const selectedModel = catalog.modelos?.[option.sistema];
  const analysisId = catalog.analise_tecnica?.aliases?.[option.sistema] || option.sistema;
  const selectedAnalysis = catalog.analise_tecnica?.model_index?.[analysisId];
  const compatibleSystems = selectedFamily ? Object.entries(selectedFamily.sistemas).filter(
    ([key]) => isModelCompatible(catalog.modelos?.[key], line),
  ) : [];
  const isNet = option.familia === "redes";

  return (
    <div data-testid={`caix-line-${lineIndex}-option-${optionIndex}`} className={`rounded-xl border p-3 ${line.opcoes.length > 1 ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-slate-50/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-700">Opção {optionLetter(optionIndex)}</p>
        <button type="button" onClick={onRemove} disabled={line.opcoes.length === 1} className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-25">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        <Label>Material / família</Label>
        <div className="flex flex-wrap gap-1.5">
          {families.map(([key, family]) => (
            <button
              key={key}
              type="button"
              onClick={() => onPickFamily(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${option.familia === key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {family.label}
            </button>
          ))}
        </div>
      </div>

      {selectedFamily ? (
        <div className="mt-3 space-y-1.5">
          <Label>Modelo / série</Label>
          <div className="flex flex-wrap gap-1.5">
            {compatibleSystems.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onSet("sistema", key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${option.sistema === key ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {!compatibleSystems.length ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Não há modelos desta família compatíveis com o tipo de abertura escolhido.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">Escolha primeiro o material.</p>
      )}

      {selectedModel ? (
        <ModelPassport
          model={selectedModel}
          analysis={selectedAnalysis}
          onApplyGlass={() => onSetPair({
            material: option.material || "vidro",
            material_ref: selectedModel.reference_glass,
          })}
        />
      ) : null}

      <details className="mt-3 rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600">Acabamento e acessórios</summary>
        <div className="border-t border-slate-100 p-3">
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
                  <Label>Referência do vidro / painel</Label>
                  <Input value={option.material_ref} onChange={(event) => onSet("material_ref", event.target.value)} placeholder="Ex.: vidro duplo 4+16+4" />
                </div>
              </div>
              {catalog.vidros?.[option.material] ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-800">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  <span><strong>{catalog.vidros[option.material].benefit}</strong> {catalog.vidros[option.material].typical_use}</span>
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cor do aro</Label>
                  <Input value={option.cor_aro} onChange={(event) => onSet("cor_aro", event.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cor da folha</Label>
                  <Input value={option.cor_folha} onChange={(event) => onSet("cor_folha", event.target.value)} placeholder="Ex.: Branco RAL 9016" />
                </div>
              </div>
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
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

function ModelPassport({ model, analysis, onApplyGlass }) {
  const characteristics = Object.entries(model.characteristics || {});
  const classifications = Object.entries(model.classification || {});
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-3 py-3 text-white">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-extrabold">{model.name}</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">{model.category_label}</span>
              {analysis ? (
                <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black ${analysis.overall.score === null ? "bg-slate-700 text-slate-300" : "bg-amber-300 text-slate-950"}`}>
                  Overall {analysis.overall.score ?? "N/D"}{analysis.overall.category ? ` · ${analysis.overall.category}` : ""}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{model.description}</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        {analysis ? (
          <div className="mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {["air", "water", "wind", "thermal", "acoustic"].map((key) => {
              const feature = analysis.features?.[key];
              return (
                <div key={key} className="rounded-lg border border-slate-200 bg-white p-1.5 text-center">
                  <p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-400">{feature?.label}</p>
                  <p className={`mt-0.5 font-mono text-[11px] font-black ${feature?.score === null ? "text-slate-400" : "text-slate-900"}`}>{feature?.score ?? "N/D"}</p>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {characteristics.slice(0, 4).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-0.5 text-[11px] font-bold leading-snug text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        {model.reference_glass ? (
          <button type="button" onClick={onApplyGlass} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
            <Sparkles className="h-3 w-3" /> Usar vidro de referência {model.reference_glass}
          </button>
        ) : null}

        <details className="mt-2 rounded-lg border border-slate-200">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-slate-700">
            Classificação, ensaios e perfis
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-3">
            {classifications.length ? (
              <div className="flex flex-wrap gap-1.5">
                {classifications.map(([label, value]) => (
                  <span key={label} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
                    <strong>{label}</strong> · {value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">A ficha pública não apresenta classes de desempenho para este modelo.</p>
            )}

            {(model.tests || []).length ? (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Configurações ensaiadas</p>
                <div className="mt-1 space-y-1">
                  {model.tests.map((test) => (
                    <p key={`${test.sample}-${test.glass}`} className="rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-600">
                      {test.sample} · vidro {test.glass}
                      {test.uw ? ` · Uw ${test.uw}` : ""}
                      {test.wind ? ` · vento ${test.wind}` : ""}
                      {test.rw ? ` · Rw ${test.rw}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {(model.profiles || []).length ? (
              <p className="text-[10px] leading-relaxed text-slate-500">
                <strong className="text-slate-700">Perfis publicados:</strong> {model.profiles.join(", ")}
              </p>
            ) : null}

            {(model.data_notes || []).map((note) => (
              <p key={note} className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                <Info className="mt-0.5 h-3 w-3 shrink-0" /> {note}
              </p>
            ))}

            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
              <p className="text-[10px] leading-relaxed text-slate-400">Valores publicados para configurações de referência. Confirmar no orçamento.</p>
              <a href={model.source_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900">
                Ficha oficial <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </details>
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
