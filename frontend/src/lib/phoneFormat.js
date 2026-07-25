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

// País "não listado" — quando o indicativo do cliente não está em
// COUNTRY_CODES, o campo troca para texto livre em vez de forçar um dos
// indicativos conhecidos. Não é um indicativo real, por isso nunca pode
// colidir com um valor de COUNTRY_CODES (todos começam por "+").
export const OTHER_COUNTRY = "outro";

// Ordenados uma única vez por comprimento de indicativo (do mais longo para
// o mais curto) — um indicativo mais curto que seja prefixo de outro mais
// longo (nenhum caso aqui, mas por segurança) nunca "rouba" a correspondência.
const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
export const MAX_DIGITS = 15; // limite prático do E.164, generoso para qualquer indicativo suportado
export const OTHER_MAX_LENGTH = 32; // texto livre em modo "Outro" — mais folga que MAX_DIGITS por poder ter espaços/hífens

export function splitPhone(value) {
  // Um valor não-string (ex.: um número, se algum chamador passar por engano)
  // fazia .trim() rebentar — normaliza sempre para string primeiro.
  const v = String(value ?? "").trim();
  if (v.startsWith("+")) {
    const match = COUNTRY_CODES_BY_LENGTH.find((c) => v.startsWith(c.code));
    if (match) return { country: match.code, digits: v.slice(match.code.length).trim() };
    // "+" seguido de um indicativo que não reconhecemos — país não
    // listado, guarda o valor tal como está para o modo de texto livre.
    return { country: OTHER_COUNTRY, digits: v };
  }
  // Sem "+": só dígitos mantém o comportamento antigo (assume Portugal —
  // é como a app sempre guardou números novos deste país). Qualquer outro
  // caráter (espaços, parênteses, hífen...) só pode ter vindo de alguém a
  // escrever livremente em modo "Outro" antes de existir indicativo.
  if (/^\d*$/.test(v)) return { country: DEFAULT_COUNTRY_CODE, digits: v };
  return { country: OTHER_COUNTRY, digits: v };
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
  // Modo "Outro" (país não listado): sem grelha própria — mostra
  // exatamente o que a pessoa escreveu, sem tentar agrupar.
  if (country === OTHER_COUNTRY) return digits;
  if (country === "+49") return formatDE(digits);
  if (country === "+55") return formatBR(digits);
  const groups = GROUPS_BY_COUNTRY[country];
  return groups ? groupDigits(digits, groups) : digits;
}

// Comprimento nacional esperado (mín/máx) por país — só para um indicador
// suave em tempo real (✓ quando bate certo), nunca bloqueia escrever mais
// ou menos: a validação que interessa mesmo continua a ser a do backend
// (normalize_phone, 9-15 dígitos, país-agnóstica).
const EXPECTED_LENGTH = {
  "+351": [9, 9], "+34": [9, 9], "+33": [9, 9], "+44": [10, 10],
  "+49": [10, 11], "+31": [9, 9], "+41": [9, 9], "+352": [9, 9],
  "+55": [10, 11], "+238": [7, 7], "+244": [9, 9], "+258": [9, 9],
};

// "empty" (nada escrito ainda) | "short" | "long" | "ok"
export function phoneLengthStatus(country, digits) {
  if (!digits) return "empty";
  // Modo "Outro": não há comprimento esperado a validar — qualquer coisa
  // escrita conta como "ok" (a única validação real continua a ser a do
  // backend, país-agnóstica).
  if (country === OTHER_COUNTRY) return "ok";
  const range = EXPECTED_LENGTH[country];
  if (!range) return "ok";
  if (digits.length < range[0]) return "short";
  if (digits.length > range[1]) return "long";
  return "ok";
}

// Reconhece "00351917100512" ou "351917100512" (sem "+") colados no campo
// de dígitos — só quando a sequência já excede visivelmente o que o país
// atualmente selecionado esperaria, para nunca confundir com um número
// nacional que por acaso começa pelos mesmos dígitos (ex.: um nº espanhol
// de 9 dígitos a começar por "34..." não é o indicativo de Espanha, é
// só coincidência — 9 dígitos cabe perfeitamente no país atual e por isso
// esta função nem chega a olhar para os indicativos). Devolve
// {country, digits} do país detetado, ou null se não for de confiança.
export function detectPastedCountry(rawDigits, currentCountry) {
  let digits = String(rawDigits ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const currentRange = EXPECTED_LENGTH[currentCountry];
  if (currentRange && digits.length <= currentRange[1]) return null; // cabe no país atual, nada a fazer
  const match = COUNTRY_CODES_BY_LENGTH.find((c) => {
    const cc = c.code.slice(1); // indicativo sem o "+"
    if (!digits.startsWith(cc)) return false;
    const rest = digits.slice(cc.length);
    const range = EXPECTED_LENGTH[c.code];
    return !!range && rest.length >= range[0] && rest.length <= range[1];
  });
  return match ? { country: match.code, digits: digits.slice(match.code.length - 1) } : null;
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
  // Modo "Outro": não há indicativo a mostrar antes do número — "digits"
  // já é o valor completo tal como foi escrito.
  if (country === OTHER_COUNTRY) return digits;
  const national = formatNational(country, digits);
  return national ? `${country} ${national}` : country;
}
