import {
  caixilhariaLabels, normalizeCaixilhariaSpec, validateCaixilhariaSpec,
} from "./caixilharia";

const catalog = {
  produtos: { janela: "Janela", porta: "Porta" },
  familias: {
    pvc: { label: "PVC", produtos: ["janela", "porta"], sistemas: { euro: "Eurodesign" } },
    aluminio: { label: "Alumínio", produtos: ["janela", "porta"], sistemas: { thermo: "Thermostop" } },
  },
};

test("suporta porta PVC e janela de alumínio com medidas independentes", () => {
  const spec = {
    tipo_pedido: "orcamento",
    linhas: [
      { produto: "porta", quantidade: 1, largura_mm: 800, altura_mm: 2000, opcoes: [{ familia: "pvc", sistema: "euro" }] },
      { produto: "janela", quantidade: 1, largura_mm: 1000, altura_mm: 1000, opcoes: [{ familia: "aluminio", sistema: "thermo" }] },
    ],
  };
  const result = validateCaixilhariaSpec(spec, catalog);
  expect(result.ok).toBe(true);
  expect(result.linhas[0]).toMatchObject({ produto: "porta", largura_mm: 800, altura_mm: 2000 });
  expect(result.linhas[1]).toMatchObject({ produto: "janela", largura_mm: 1000, altura_mm: 1000 });
});

test("a mesma janela pode comparar PVC com alumínio", () => {
  const spec = { linhas: [{
    produto: "janela", quantidade: 1, largura_mm: 1000, altura_mm: 1000,
    opcoes: [{ familia: "pvc", sistema: "euro" }, { familia: "aluminio", sistema: "thermo" }],
  }] };
  expect(validateCaixilhariaSpec(spec, catalog).ok).toBe(true);
  expect(caixilhariaLabels(catalog, spec)).toMatchObject({ element_count: 1, option_count: 2 });
});

test("uma encomenda não aceita alternativas ainda por decidir", () => {
  const spec = { tipo_pedido: "encomenda", linhas: [{
    produto: "janela", quantidade: 1, largura_mm: 1000, altura_mm: 1000,
    opcoes: [{ familia: "pvc", sistema: "euro" }, { familia: "aluminio", sistema: "thermo" }],
  }] };
  expect(validateCaixilhariaSpec(spec, catalog)).toMatchObject({ ok: false });
});

test("o esquema antigo migra cada medida para um elemento", () => {
  const spec = normalizeCaixilhariaSpec({
    produto: "janela", familia: "pvc", sistema: "euro",
    itens: [{ quantidade: 1, largura_mm: 800, altura_mm: 900 }, { quantidade: 1, largura_mm: 1000, altura_mm: 1200 }],
  });
  expect(spec.schema_version).toBe(2);
  expect(spec.linhas).toHaveLength(2);
  expect(spec.linhas.every((line) => line.opcoes[0].familia === "pvc")).toBe(true);
});
