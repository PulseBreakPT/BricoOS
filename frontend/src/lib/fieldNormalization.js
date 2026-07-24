// Fachada única para as normalizações de campo já construídas — nada de
// lógica nova aqui, só um ponto de import estável (normalizeName/
// normalizePhone/normalizeEmail) para quem preferir este nome genérico em
// vez de importar de cada módulo por assunto.
//
// normalizeAddress/normalizePostalCode/normalizeCompanyName não existem
// (deliberadamente): esta app não tem nenhum campo de morada, código
// postal ou nome de empresa em lado nenhum do modelo de dados — inventar
// uma normalização para um campo que não existe seria código morto.

export { normalizeName } from "./nameFormat";
export { normalizeEmailLive as normalizeEmail } from "./emailFormat";
export { formatPhoneDisplay as normalizePhone } from "./phoneFormat";
