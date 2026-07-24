// Legibilidade do Centro de Conhecimento — funções puras (sem React), para
// serem testáveis isoladamente e para o componente (KnowledgeArticleDialog)
// só ter de decidir como desenhar o que aqui sai, não como calcular.
//
// `highlightEntities`/`renderParagraphs` nunca voltam a correr regex de
// deteção — usam sempre as substrings já extraídas pelo backend
// (`section.facts`/`deadline_mentions`/`mea_mentions`, ver
// backend/extraction_patterns.py e backend/correio_semanal.py), a única
// fonte de verdade sobre o que é "importante" num texto. Isto evita ter a
// mesma lógica de deteção duplicada em Python e em JavaScript.

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HIGHLIGHT_FACT_KEYS = ["precos", "descontos", "locais", "itm", "ean", "contactos", "datas"];

export function collectHighlightTerms(section) {
  const facts = section?.facts || {};
  const terms = [];
  for (const key of HIGHLIGHT_FACT_KEYS) {
    for (const v of facts[key] || []) terms.push(v);
  }
  for (const v of section?.deadline_mentions || []) terms.push(v);
  for (const v of section?.mea_mentions || []) terms.push(v);
  // Mais compridas primeiro: evita que uma substring curta (ex. "20%")
  // "roube" parte de uma menção mais longa que a contenha.
  return Array.from(new Set(terms.filter(Boolean))).sort((a, b) => b.length - a.length);
}

// Divide `text` em segmentos {type: "text"|"mark", value} — quem consome
// decide como desenhar cada um (ver SectionParagraphs em
// KnowledgeArticleDialog.jsx).
export function highlightEntities(text, section) {
  const raw = text || "";
  if (!raw) return [{ type: "text", value: "" }];
  const terms = collectHighlightTerms(section);
  if (!terms.length) return [{ type: "text", value: raw }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "g");
  const parts = raw.split(pattern).filter((p) => p !== "");
  const termSet = new Set(terms);
  return parts.map((value) => ({ type: termSet.has(value) ? "mark" : "text", value }));
}

// Nunca mostrar um bloco de texto corrido com mais de ~4-5 linhas seguidas
// (~320 caracteres a 700px/16px) — divide nas fronteiras de frase, nunca a
// meio de uma. Mesmo que o PDF de origem tenha vindo como um único
// parágrafo enorme, o resultado fica em blocos de leitura mais curtos.
const SOFT_WRAP_MAX_CHARS = 320;

function splitLongText(text) {
  if (text.length <= SOFT_WRAP_MAX_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]*(?:\s+|$)/g) || [text];
  const blocks = [];
  let buf = "";
  for (const sentence of sentences) {
    if (buf && buf.length + sentence.length > SOFT_WRAP_MAX_CHARS) {
      blocks.push(buf.trim());
      buf = "";
    }
    buf += sentence;
  }
  if (buf.trim()) blocks.push(buf.trim());
  return blocks.length ? blocks : [text];
}

// Uma linha de lista que comece por um código de 4-10 dígitos seguido de
// texto (ex. "1363912 20 kg") — em vez de uma bullet corrida, fica em duas
// colunas (código | resto), sem inventar nem separar nenhum valor que não
// estivesse já na própria linha.
const CODE_LINE_RE = /^(\d{4,10})\s+(.+)$/;

// Converte `section.paragraphs` (ver backend/correio_semanal.py:
// extract_structured) numa lista de blocos prontos a desenhar:
//   { kind: "heading", text }
//   { kind: "text", segments }
//   { kind: "list", items: [{ code, rest } | { segments }] }
// Sem `paragraphs` (artigo ainda não reprocessado com o motor atual),
// degrada para um único bloco de texto a partir de `section.text` — nunca
// pior do que o comportamento anterior a esta funcionalidade.
export function renderParagraphs(paragraphs, section) {
  const paras = paragraphs && paragraphs.length
    ? paragraphs
    : [{ type: "text", text: section?.text || "" }];

  const blocks = [];
  let listBuf = [];

  const flushList = () => {
    if (!listBuf.length) return;
    const items = listBuf.map((text) => {
      const m = CODE_LINE_RE.exec(text);
      return m ? { code: m[1], rest: m[2] } : { segments: highlightEntities(text, section) };
    });
    blocks.push({ kind: "list", items });
    listBuf = [];
  };

  for (const p of paras) {
    if (!p?.text) continue;
    if (p.type === "list_item") {
      listBuf.push(p.text);
      continue;
    }
    flushList();
    if (p.type === "heading") {
      blocks.push({ kind: "heading", text: p.text });
      continue;
    }
    for (const chunk of splitLongText(p.text)) {
      blocks.push({ kind: "text", segments: highlightEntities(chunk, section) });
    }
  }
  flushList();
  return blocks;
}
