// Formatação/validação em tempo real do campo de email — minúsculas e sem
// espaços a cada tecla (email não é case-sensitive na prática e um espaço
// nunca é intencional), validação imediata e o domínio para o destacar
// junto ao campo (ex.: "gmail.com").

export function normalizeEmailLive(value) {
  return String(value ?? "").toLowerCase().replace(/\s/g, "");
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

// Conta quantos caracteres NÃO-espaço existem antes de `index` em `raw` —
// como normalizeEmailLive remove todos os espaços, a posição do cursor no
// texto já sem espaços é exatamente essa contagem.
export function countNonSpaceUpTo(str, index) {
  let n = 0;
  for (let i = 0; i < index && i < str.length; i++) {
    if (!/\s/.test(str[i])) n++;
  }
  return n;
}
