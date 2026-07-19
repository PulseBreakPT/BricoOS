let sequence = 0;
const identifier = (prefix) => `${prefix}_${Date.now().toString(36)}_${++sequence}`;

export const OPTION_FIELDS = [
  "familia", "sistema", "material", "material_ref", "cor_aro", "cor_folha",
  "fechadura", "muletas", "estore", "quadricula", "quadricula_cor", "observacoes",
];

const LEGACY_OPENING_TYPES = {
  "De correr": "correr", "Oscilo-batente": "oscilo_batente",
  Basculante: "basculante", Fixa: "fixa",
};

const productOpeningDefault = (product) => (
  product === "portada" ? "portada" : product === "rede_mosquiteira" ? "rede" : ""
);

export function createCaixOption(seed = {}) {
  return {
    id: seed.id || identifier("opt"),
    familia: seed.familia || "", sistema: seed.sistema || "",
    material: seed.material || "", material_ref: seed.material_ref || "",
    cor_aro: seed.cor_aro || "", cor_folha: seed.cor_folha || "",
    fechadura: seed.fechadura || "", muletas: seed.muletas || "",
    estore: seed.estore || "", quadricula: seed.quadricula || "",
    quadricula_cor: seed.quadricula_cor || "", observacoes: seed.observacoes || "",
  };
}

export function createCaixLine(produto = "janela", seed = {}) {
  const legacyDirection = seed.sentido_abertura || "";
  const migratedType = seed.tipo_abertura || LEGACY_OPENING_TYPES[legacyDirection] || productOpeningDefault(produto);
  return {
    id: seed.id || identifier("elem"), nome: seed.nome || "", produto,
    quantidade: seed.quantidade ?? 1,
    largura_mm: seed.largura_mm ?? "", altura_mm: seed.altura_mm ?? "",
    unidade_entrada: ["mm", "cm"].includes(seed.unidade_entrada) ? seed.unidade_entrada : "mm",
    tipo_abertura: migratedType,
    numero_folhas: seed.numero_folhas ?? "",
    sentido_abertura: LEGACY_OPENING_TYPES[legacyDirection] ? "" : legacyDirection,
    opcoes: (seed.opcoes?.length ? seed.opcoes : [{}]).map(createCaixOption),
    observacoes: seed.observacoes || "",
  };
}

export function measurementDisplayValue(millimetres, unit = "mm") {
  if (millimetres === "" || millimetres === null || millimetres === undefined) return "";
  const value = Number(millimetres);
  if (!Number.isFinite(value)) return "";
  return unit === "cm" ? value / 10 : value;
}

export function measurementToMillimetres(value, unit = "mm") {
  if (value === "" || value === null || value === undefined) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return Math.round(numeric * (unit === "cm" ? 10 : 1));
}

export function isModelCompatible(model, line) {
  if (!model) return true;
  if (model.products?.length && !model.products.includes(line.produto)) return false;
  const type = line.tipo_abertura;
  if (!type) return true;
  if (type === "correr") return model.category === "correr";
  if (["abrir_batente", "oscilo_batente", "basculante", "fixa"].includes(type)) {
    return model.category === "abrir_batente";
  }
  if (type === "portada") return model.category === "portada";
  return true;
}

export function glazingThicknessMm(reference) {
  const match = String(reference || "").match(/\b\d{1,2}(?:\s*\+\s*\d{1,2})+\b/);
  if (!match) return null;
  return match[0].split("+").reduce((sum, part) => sum + Number(part.trim()), 0);
}

export function createEmptyCaixilharia() {
  return {
    schema_version: 2, tipo_pedido: "orcamento",
    linhas: [createCaixLine("janela")], observacoes: "", data_entrega: "",
  };
}

export const emptyCaixilharia = createEmptyCaixilharia();

export function normalizeCaixilhariaSpec(spec) {
  if (spec?.linhas?.length) {
    return {
      schema_version: 2,
      tipo_pedido: spec.tipo_pedido || "orcamento",
      linhas: spec.linhas.map((line) => createCaixLine(line.produto || "janela", line)),
      observacoes: spec.observacoes || "", data_entrega: spec.data_entrega || "",
    };
  }

  const legacyOption = OPTION_FIELDS.reduce((result, field) => ({ ...result, [field]: spec?.[field] || "" }), {});
  const lines = (spec?.itens || []).map((item) => createCaixLine(spec?.produto || "janela", {
    quantidade: item.quantidade, largura_mm: item.largura_mm, altura_mm: item.altura_mm,
    sentido_abertura: item.sentido_abertura || "", opcoes: [{ ...legacyOption }],
  }));
  return {
    schema_version: 2, tipo_pedido: spec?.tipo_pedido || "orcamento",
    linhas: lines.length ? lines : [createCaixLine("janela")],
    observacoes: spec?.observacoes || "", data_entrega: spec?.data_entrega || "",
  };
}

export function validateCaixilhariaSpec(spec, catalog) {
  const normalized = normalizeCaixilhariaSpec(spec);
  if (!normalized.linhas.length) return { ok: false, error: "Adiciona pelo menos um elemento." };
  if (normalized.tipo_pedido === "encomenda" && normalized.linhas.some((line) => line.opcoes.length > 1)) {
    return { ok: false, error: "Numa encomenda escolhe uma só opção por elemento. Para comparar materiais, usa Orçamento." };
  }

  const lines = [];
  const warnings = [];
  for (const [lineIndex, line] of normalized.linhas.entries()) {
    const number = lineIndex + 1;
    const quantity = parseInt(line.quantidade, 10);
    const width = parseInt(line.largura_mm, 10);
    const height = parseInt(line.altura_mm, 10);
    const leaves = line.numero_folhas === "" || line.numero_folhas === null
      ? null : parseInt(line.numero_folhas, 10);
    if (!quantity || quantity < 1 || quantity > 999) {
      return { ok: false, error: `Elemento ${number}: indica uma quantidade entre 1 e 999.` };
    }
    if (!width || !height || width < 50 || height < 50 || width > 10000 || height > 10000) {
      return { ok: false, error: `Elemento ${number}: largura e altura devem estar entre 50 e 10000 mm.` };
    }
    if (!line.opcoes.length) return { ok: false, error: `Elemento ${number}: adiciona uma opção de fabrico.` };
    if (leaves !== null && (!leaves || leaves < 1 || leaves > 6)) {
      return { ok: false, error: `Elemento ${number}: indica entre 1 e 6 folhas.` };
    }

    const seen = new Set();
    const options = [];
    for (const [optionIndex, option] of line.opcoes.entries()) {
      const optionNumber = optionIndex + 1;
      if (!option.familia || !option.sistema) {
        return { ok: false, error: `Elemento ${number}, opção ${optionNumber}: escolhe o material e o sistema.` };
      }
      const family = catalog?.familias?.[option.familia];
      if (family && !family.produtos.includes(line.produto)) {
        return { ok: false, error: `Elemento ${number}: ${family.label} não se aplica ao produto escolhido.` };
      }
      if (family && !family.sistemas?.[option.sistema]) {
        return { ok: false, error: `Elemento ${number}, opção ${optionNumber}: o sistema não pertence ao material escolhido.` };
      }
      const model = catalog?.modelos?.[option.sistema];
      if (model && !isModelCompatible(model, line)) {
        return { ok: false, error: `Elemento ${number}, opção ${optionNumber}: ${model.name} não corresponde ao produto ou tipo de abertura.` };
      }
      if (leaves && model?.leaves?.length && !model.leaves.includes(leaves)) {
        return { ok: false, error: `Elemento ${number}: ${model.name} admite ${model.leaves.join(", ")} folha(s).` };
      }
      const glazing = glazingThicknessMm(option.material_ref);
      if (glazing && model?.glass_limit_mm && glazing > model.glass_limit_mm) {
        warnings.push(
          `Elemento ${number}, opção ${optionNumber}: a composição indicada soma ${glazing} mm e ultrapassa `
          + `os ${model.glass_limit_mm} mm publicados para ${model.name}. Confirma com a BandAlumínios.`,
        );
      }
      const maxWhite = model?.max_dimensions?.white;
      if (maxWhite && (width > maxWhite.width_mm || height > maxWhite.height_mm)) {
        warnings.push(
          `Elemento ${number}: as medidas ultrapassam o máximo publicado para ${model.name} em branco `
          + `(${maxWhite.width_mm} × ${maxWhite.height_mm} mm).`,
        );
      }
      const key = `${option.familia}:${option.sistema}`;
      if (seen.has(key)) return { ok: false, error: `Elemento ${number}: existe uma opção repetida.` };
      seen.add(key);
      options.push(createCaixOption(option));
    }

    if (line.produto === "porta" && width > height) {
      warnings.push(`Elemento ${number}: a largura da porta é maior do que a altura; confirma a ordem das medidas.`);
    }
    lines.push({
      ...line, quantidade: quantity, largura_mm: width, altura_mm: height,
      numero_folhas: leaves,
      opcoes: options,
    });
  }
  return { ok: true, linhas: lines, warnings };
}

export function caixilhariaLabels(catalog, spec) {
  const normalized = normalizeCaixilhariaSpec(spec);
  const productCounts = new Map();
  const families = [];
  let options = 0;
  normalized.linhas.forEach((line) => {
    const label = catalog?.produtos?.[line.produto] || line.produto;
    productCounts.set(label, (productCounts.get(label) || 0) + (parseInt(line.quantidade, 10) || 0));
    line.opcoes.forEach((option) => {
      const family = catalog?.familias?.[option.familia]?.label || option.familia;
      if (family && !families.includes(family)) families.push(family);
      options += 1;
    });
  });
  const plurals = { Janela: "Janelas", Porta: "Portas", Portada: "Portadas", "Rede mosquiteira": "Redes mosquiteiras" };
  return {
    produto: [...productCounts.entries()].map(([label, count]) => `${count} ${count === 1 ? label : (plurals[label] || `${label}s`)}`).join(" + "),
    familia: families.join(" + "),
    sistema: `${options} opção${options === 1 ? "" : "ões"}`,
    total_un: [...productCounts.values()].reduce((sum, count) => sum + count, 0),
    element_count: normalized.linhas.length,
    option_count: options,
  };
}
