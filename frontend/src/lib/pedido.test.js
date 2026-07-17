import {
  buildEmail, buildReminder, getNextActionCta, getNextActionMode,
} from "./pedido";

const note = {
  id: "a1b2c3d4-e5f6-7890",
  created_at: "2026-07-16T09:30:00+00:00",
  description: "Bancada de madeira",
  reference: "ART-44",
  measurements: "2000 × 600 × 30 mm",
  quantity: "2 unidades",
};

test("o pedido de cotação usa o tom habitual sem referência interna", () => {
  const template = buildEmail(note);
  expect(template.subject).not.toContain("BCF-");
  expect(template.body).toMatch(/^(Bom dia|Boa tarde) Exmos\. Senhores,/);
  expect(template.body).toContain("para os seguintes artigos:");
  expect(template.body).toContain("Código EAN13: ART-44");
  expect(template.body).toContain("Tiago Jesus");
});

test("o lembrete não expõe a referência interna ao fornecedor", () => {
  const template = buildReminder(note);
  expect(template.subject).not.toContain("BCF-");
  expect(template.body).toContain("reforçar o pedido de cotação");
});

test("ações reais abrem o fluxo guiado em vez de avançar o estado", () => {
  expect(getNextActionMode({ status: "em_preparacao" })).toBe("compose_supplier_email");
  expect(getNextActionCta({ status: "orcamento_recebido" })).toBe("Responder ao cliente");
  expect(getNextActionMode({ status: "novo" })).toBe("status");
});
