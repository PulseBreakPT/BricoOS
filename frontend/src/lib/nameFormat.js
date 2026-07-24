// Capitalização automática do nome do cliente — primeira letra de cada
// palavra em maiúscula, exceto partículas de nomes compostos (da/de/do/
// das/dos/e) quando não são a primeira palavra. Comprimento da string
// nunca muda (só a capitalização de cada letra), por isso quem chama isto
// num campo de texto pode preservar a posição do cursor tal e qual.

import { cleanPastedText } from "./textClean";

const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

function capitalizeWord(word) {
  const lower = word.toLocaleLowerCase("pt-PT");
  return lower.charAt(0).toLocaleUpperCase("pt-PT") + lower.slice(1);
}

// Versão "ao vivo" — preserva os espaços exatamente como foram escritos
// (nunca colapsa nem apara), para não estragar o cursor a meio de escrever
// um espaço antes da palavra seguinte.
export function capitalizeName(value) {
  const str = String(value ?? "");
  const tokens = str.match(/[^\s]+|\s+/g) || [];
  let wordIndex = 0;
  return tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    const isFirstWord = wordIndex === 0;
    wordIndex += 1;
    const lower = tok.toLocaleLowerCase("pt-PT");
    // A primeira palavra começa sempre por maiúscula, mesmo que coincida
    // com uma partícula (ex.: alguém chamado só "Da" no início do nome).
    if (!isFirstWord && NAME_PARTICLES.has(lower)) return lower;
    return capitalizeWord(tok);
  }).join("");
}

// Versão final (onBlur) — apara espaços nas pontas e colapsa espaços
// repetidos a um só, depois capitaliza. A versão "ao vivo" não faz isto
// enquanto se escreve, para não impedir escrever um espaço a seguir a
// outro por engano sem o campo "comer" a tecla.
export function normalizeName(value) {
  const collapsed = cleanPastedText(value ?? "").trim().replace(/\s+/g, " ");
  return capitalizeName(collapsed);
}

// A partir daqui, comprimento a partir do qual mostrar um contador discreto
// — nomes de clientes desta loja raramente passam disto; serve só de aviso
// suave, nunca bloqueia escrever mais.
export const NAME_LONG_THRESHOLD = 40;

// Aviso (não bloqueia) quando o nome tem dígitos ou símbolos fora do
// habitual — letras (com acentos), espaços, hífen e apóstrofo são sempre
// aceites (nomes compostos, "O'Neil", etc.).
const NAME_SAFE_RE = /^[\p{L}\s'-]*$/u;
export function nameHasUnexpectedChars(value) {
  const str = String(value ?? "");
  return str.length > 0 && !NAME_SAFE_RE.test(str);
}

// "Detalhe que impressiona" — ao colar uma linha (ou várias, ou separadas
// por "|") tipo "Bernardo Santos - 917100512", "Bernardo Santos 917100512
// bernardo@gmail.com", "Bernardo Santos | 917100512 | bernardo@gmail.com"
// ou mesmo em três linhas separadas, no campo de nome separa
// automaticamente o que parecer email/telefone, deixando só o nome limpo.
// Devolve null quando não há nada a extrair (colou só um nome normal) —
// nesse caso quem chama isto trata o valor como um "paste" normal, sem
// qualquer efeito extra.
const EMAIL_TOKEN_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_TOKEN_RE = /\+?\d[\d\s().-]{6,}\d/;
// \s já apanha quebras de linha — por isso um "cole" em três linhas
// (nome\ntelefone\nemail) colapsa para uma só string tal como o formato
// "Nome - telefone" separado por hífen; "|" é só mais um separador comum
// (ex.: exportações de contactos) tratado da mesma forma.
const SEPARATORS_RE = /[-–,·|]/g;

export function parseContactPaste(text) {
  const str = cleanPastedText(text ?? "");
  const emailMatch = str.match(EMAIL_TOKEN_RE);
  const withoutEmail = emailMatch ? str.replace(emailMatch[0], " ") : str;
  const phoneMatch = withoutEmail.match(PHONE_TOKEN_RE);
  if (!emailMatch && !phoneMatch) return null;
  const phoneDigits = phoneMatch ? phoneMatch[0].replace(/\D/g, "") : "";
  if (phoneMatch && (phoneDigits.length < 9 || phoneDigits.length > 15)) return null; // não parece um telefone real, ignora
  const namePart = (phoneMatch ? withoutEmail.replace(phoneMatch[0], " ") : withoutEmail)
    .replace(SEPARATORS_RE, " ").replace(/\s+/g, " ").trim();
  return {
    name: namePart ? capitalizeName(namePart) : "",
    phone: phoneMatch ? (phoneMatch[0].trim().startsWith("+") ? `+${phoneDigits}` : phoneDigits) : "",
    email: emailMatch ? emailMatch[0].toLowerCase() : "",
  };
}
