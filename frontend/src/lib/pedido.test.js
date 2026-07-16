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

test("o pedido de cotação usa referência estável e o tom habitual", () => {
  const template = buildEmail(note);
  expect(template.subject).toContain("BCF-26-A1B2C3D4");
  expect(template.body).toMatch(/^(Bom dia|Boa tarde) Exmos\. Senhores,/);
  expect(template.body).toContain("para os seguintes artigos:");
  expect(template.body).toContain("Referência do artigo: ART-44");
  expect(template.body).toContain("• Prazo de entrega;");
});

test("o lembrete conserva a referência do pedido", () => {
  const template = buildReminder(note);
  expect(template.subject).toContain("BCF-26-A1B2C3D4");
  expect(template.body).toContain("reforçar o pedido de cotação");
});

test("ações reais abrem o fluxo guiado em vez de avançar o estado", () => {
  expect(getNextActionMode({ status: "em_preparacao" })).toBe("compose_supplier_email");
  expect(getNextActionCta({ status: "orcamento_recebido" })).toBe("Responder ao cliente");
  expect(getNextActionMode({ status: "novo" })).toBe("status");
});
