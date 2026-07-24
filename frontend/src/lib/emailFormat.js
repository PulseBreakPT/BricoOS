// Formatação/validação em tempo real do campo de email — minúsculas e sem
// espaços a cada tecla (email não é case-sensitive na prática e um espaço
// nunca é intencional), validação imediata e o domínio para o destacar
// junto ao campo (ex.: "gmail.com").

// \s já cobre a maioria dos espaços "esquisitos" (nbsp, BOM incluídos, por
// especificação do ECMAScript) — só falta o punhado de caracteres de
// largura zero (zero-width space/joiner) que às vezes vêm colados de
// WhatsApp/Outlook e não contam como espaço para a regex.
const REMOVE_RE = new RegExp("[\\s\\u200B-\\u200D\\u2060]", "g");
// Cópia sem a flag "g" — usada carácter-a-carácter (countNonSpaceUpTo);
// testar um regex global assim faz o lastIndex avançar e alternar
// resultados errados a cada chamada, por isso precisa da sua própria cópia.
const REMOVE_CHAR_RE = new RegExp("[\\s\\u200B-\\u200D\\u2060]");

export function normalizeEmailLive(value) {
  return String(value ?? "").toLowerCase().replace(REMOVE_RE, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  const v = String(value ?? "").trim();
  return !!v && EMAIL_RE.test(v);
}

export function emailDomain(value) {
  const v = String(value ?? "");
  const at = v.lastIndexOf("@");
  if (at === -1 || at === v.length - 1) return "";
  return v.slice(at + 1);
}

// Conta quantos caracteres ficam depois de normalizeEmailLive remover
// espaços/largura-zero antes de `index` em `raw` — a posição do cursor no
// texto já limpo é exatamente essa contagem.
export function countNonSpaceUpTo(str, index) {
  let n = 0;
  for (let i = 0; i < index && i < str.length; i++) {
    if (!REMOVE_CHAR_RE.test(str[i])) n++;
  }
  return n;
}
