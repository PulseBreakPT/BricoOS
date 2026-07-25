import {
  splitPhone, formatNational, phoneLengthStatus, formatPhoneDisplay,
  DEFAULT_COUNTRY_CODE, OTHER_COUNTRY,
} from "./phoneFormat";

test("um indicativo conhecido continua a separar país e dígitos normalmente", () => {
  expect(splitPhone("+351917100512")).toEqual({ country: "+351", digits: "917100512" });
});

test("dígitos sem '+' continuam a assumir Portugal (comportamento antigo)", () => {
  expect(splitPhone("917100512")).toEqual({ country: DEFAULT_COUNTRY_CODE, digits: "917100512" });
});

test("um indicativo não listado cai em modo 'Outro', a guardar o valor tal como está", () => {
  expect(splitPhone("+48123456789")).toEqual({ country: OTHER_COUNTRY, digits: "+48123456789" });
});

test("texto escrito à mão sem '+' e com caracteres não numéricos também cai em modo 'Outro'", () => {
  expect(splitPhone("0048 123 456 789")).toEqual({ country: OTHER_COUNTRY, digits: "0048 123 456 789" });
});

test("em modo 'Outro' o número mostra-se tal como foi escrito, sem grelha de formatação", () => {
  expect(formatNational(OTHER_COUNTRY, "+48 123 456 789")).toBe("+48 123 456 789");
});

test("em modo 'Outro' não há validação de comprimento — só 'empty' ou 'ok'", () => {
  expect(phoneLengthStatus(OTHER_COUNTRY, "")).toBe("empty");
  expect(phoneLengthStatus(OTHER_COUNTRY, "123")).toBe("ok");
  expect(phoneLengthStatus(OTHER_COUNTRY, "+48 123 456 789 ext. 12")).toBe("ok");
});

test("a apresentação de um número em modo 'Outro' não antepõe o rótulo interno 'outro'", () => {
  expect(formatPhoneDisplay("+48 123 456 789")).toBe("+48 123 456 789");
});

test("a apresentação de um número normal continua a mostrar indicativo + número nacional", () => {
  expect(formatPhoneDisplay("+351917100512")).toBe("+351 917 100 512");
});
