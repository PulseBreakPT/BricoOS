// Formatação de números de telefone por país — partilhada entre o campo de
// edição (PhoneInput.jsx) e qualquer sítio que só MOSTRA o número (cartões,
// separador Detalhes, cronologia, etc.). O valor guardado/enviado ao
// backend nunca muda — continua a ser sempre indicativo + dígitos limpos,
// sem espaços (ex. "+351917100512"); só a apresentação ganha os
// agrupamentos, aqui e em qualquer componente que use formatPhoneDisplay().

// Indicativos mais comuns para clientes da loja de Faro — Portugal por defeito.
export const COUNTRY_CODES = [
  { code: "+351", flag: "🇵🇹", name: "Portugal" },
  { code: "+34", flag: "🇪🇸", name: "Espanha" },
  { code: "+33", flag: "🇫🇷", name: "França" },
  { code: "+44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "+49", flag: "🇩🇪", name: "Alemanha" },
  { code: "+31", flag: "🇳🇱", name: "Países Baixos" },
  { code: "+41", flag: "🇨🇭", name: "Suíça" },
  { code: "+352", flag: "🇱🇺", name: "Luxemburgo" },
  { code: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "+238", flag: "🇨🇻", name: "Cabo Verde" },
  { code: "+244", flag: "🇦🇴", name: "Angola" },
  { code: "+258", flag: "🇲🇿", name: "Moçambique" },
];

export const DEFAULT_COUNTRY_CODE = "+351";

// Ordenados uma única vez por comprimento de indicativo (do mais longo para
// o mais curto) — um indicativo mais curto que seja prefixo de outro mais
// longo (nenhum caso aqui, mas por segurança) nunca "rouba" a correspondência.
const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
export const MAX_DIGITS = 15; // limite prático do E.164, generoso para qualquer indicativo suportado

export function splitPhone(value) {
  // Um valor não-string (ex.: um número, se algum chamador passar por engano)
  // fazia .trim() rebentar — normaliza sempre para string primeiro.
  const v = String(value ?? "").trim();
  if (!v.startsWith("+")) return { country: DEFAULT_COUNTRY_CODE, digits: v };
  const match = COUNTRY_CODES_BY_LENGTH.find((c) => v.startsWith(c.code));
  return match
    ? { country: match.code, digits: v.slice(match.code.length).trim() }
    : { country: DEFAULT_COUNTRY_CODE, digits: v };
}

// Agrupamento visual por país — como cada um deles costuma escrever o seu
// próprio número nacional.
const GROUPS_BY_COUNTRY = {
  "+351": [3, 3, 3],      // Portugal: 917 100 512
  "+34": [3, 2, 2, 2],    // Espanha: 612 34 56 78
  "+33": [1, 2, 2, 2, 2], // França: 6 12 34 56 78
  "+44": [4, 6],          // Reino Unido: 7911 123456
  "+31": [1, 8],          // Países Baixos: 6 12345678
  "+41": [2, 3, 2, 2],    // Suíça: 79 123 45 67
  "+352": [3, 3, 3],      // Luxemburgo: 621 123 456
  "+238": [3, 2, 2],      // Cabo Verde: 991 23 45
  "+244": [3, 3, 3],      // Angola: 923 123 456
  "+258": [2, 3, 4],      // Moçambique: 84 123 4567
};

function groupDigits(digits, groups) {
  const parts = [];
  let idx = 0;
  for (const len of groups) {
    if (idx >= digits.length) break;
    parts.push(digits.slice(idx, idx + len));
    idx += len;
  }
  if (idx < digits.length) {
    // Sobra (mais dígitos do que o padrão previa) fica anexada ao último
    // grupo, nunca é cortada nem vira um grupo solto separado por espaço.
    if (parts.length) parts[parts.length - 1] += digits.slice(idx);
    else parts.push(digits.slice(idx));
  }
  return parts.join(" ");
}

// Alemanha: comprimento nacional variável (10-11 dígitos) — só dois blocos
// fixos (indicativo de área + resto), sem inventar uma grelha rígida que
// não existe de facto neste país.
function formatDE(digits) {
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

// Brasil: (DD) NNNNN-NNNN (móvel, com o 9º dígito) ou (DD) NNNN-NNNN (fixo)
// — o próprio comprimento à medida que se escreve decide qual dos dois.
function formatBR(digits) {
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `(${ddd}`;
  const firstLen = rest.length >= 9 ? 5 : 4;
  const first = rest.slice(0, firstLen);
  const second = rest.slice(firstLen);
  return second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`;
}

export function formatNational(country, digits) {
  if (!digits) return "";
  if (country === "+49") return formatDE(digits);
  if (country === "+55") return formatBR(digits);
  const groups = GROUPS_BY_COUNTRY[country];
  return groups ? groupDigits(digits, groups) : digits;
}

// Cursor: ao formatar, o texto mostrado fica mais comprido do que o que a
// pessoa escreveu (espaços/parênteses/hífen inseridos automaticamente) — sem
// isto, o cursor saltaria sempre para o fim do campo a cada tecla, tornando
// impossível corrigir um dígito a meio do número. Só usado pelo PhoneInput
// (campo de edição); não é preciso para apresentação read-only.
export function countDigitsUpTo(str, index) {
  let n = 0;
  for (let i = 0; i < index && i < str.length; i++) {
    if (/\d/.test(str[i])) n++;
  }
  return n;
}

export function positionAfterNDigits(formatted, n) {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      count += 1;
      if (count === n) return i + 1;
    }
  }
  return formatted.length;
}

// Ponto único para qualquer sítio que só MOSTRA o número (nunca edita):
// "+33624066447" -> "+33 6 24 06 64 47". String vazia devolve string vazia
// (para os componentes poderem continuar a fazer `{n.phone ? ... : "—"}`
// sem precisar de tratar o caso especial).
export function formatPhoneDisplay(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const { country, digits } = splitPhone(v);
  const national = formatNational(country, digits);
  return national ? `${country} ${national}` : country;
}
