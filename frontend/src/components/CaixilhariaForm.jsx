import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Copy, Eye, GitCompare, Layers3, Plus, Ruler, Trash2,
} from "lucide-react";
import api from "@/lib/api";
import {
  caixilhariaLabels, createCaixLine, createCaixOption, createEmptyCaixilharia,
  emptyCaixilharia, normalizeCaixilhariaSpec, validateCaixilhariaSpec,
} from "@/lib/caixilharia";

export {
  caixilhariaLabels, createCaixLine, createCaixOption, createEmptyCaixilharia,
  emptyCaixilharia, normalizeCaixilhariaSpec, validateCaixilhariaSpec,
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
    const validOptions = line.opcoes.filter((option) => catalog.familias[option.familia]?.produtos.includes(product));
    updateLine(lineIndex, { produto: product, opcoes: validOptions.length ? validOptions : [createCaixOption()] });
  };
  const setOption = (lineIndex, optionIndex, key, value) => {
    const line = normalized.linhas[lineIndex];
    const options = line.opcoes.map((option, index) => (
      index === optionIndex ? { ...option, [key]: value } : option
    ));
    updateLine(lineIndex, { opcoes: options });
  };
  const pickFamily = (lineIndex, optionIndex, family) => {
    const current = normalized.linhas[lineIndex].opcoes[optionIndex];
    setOptionPair(lineIndex, optionIndex, {
      familia: family, sistema: current.familia === family ? current.sistema : "",
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
    updateLine(lineIndex, { opcoes: [...line.opcoes, createCaixOption({ familia: family })] });
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
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold uppercase tracking-wide text-amber-800">
        <Eye className="h-4 w-4 shrink-0" /> {catalog.aviso}
      </div>

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
                  {line.largura_mm && line.altura_mm ? `${line.largura_mm} × ${line.altura_mm} mm · ` : ""}
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
                  <Label className="flex items-center gap-1"><Ruler className="h-3 w-3" /> Largura (mm)</Label>
                  <Input type="number" min={50} value={line.largura_mm} onChange={(event) => updateLine(lineIndex, { largura_mm: event.target.value })} placeholder={line.produto === "porta" ? "800" : "1000"} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Altura (mm)</Label>
                  <Input type="number" min={50} value={line.altura_mm} onChange={(event) => updateLine(lineIndex, { altura_mm: event.target.value })} placeholder={line.produto === "porta" ? "2000" : "1000"} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Abertura</Label>
                  <Select value={line.sentido_abertura || "none"} onValueChange={(value) => updateLine(lineIndex, { sentido_abertura: value === "none" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
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

function OptionEditor({ catalog, line, lineIndex, option, optionIndex, onSet, onPickFamily, onRemove }) {
  const families = Object.entries(catalog.familias).filter(([, family]) => family.produtos.includes(line.produto));
  const selectedFamily = catalog.familias[option.familia];
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
          <Label>Sistema / série</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(selectedFamily.sistemas).map(([key, label]) => (
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
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">Escolha primeiro o material.</p>
      )}

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
