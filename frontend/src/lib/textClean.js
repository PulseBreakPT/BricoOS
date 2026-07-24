// Limpeza de "lixo invisivel" comum em texto colado de emails/WhatsApp/
// Outlook - caracteres de largura zero, aspas tipograficas e tracos
// esquisitos que nao se veem mas confundem comparacoes e formatos
// esperados (nome, telefone, email). So usado no momento de colar - nunca
// a cada tecla, para nao mexer na posicao do cursor durante a escrita.

const ZERO_WIDTH_RE = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g");
const SMART_SINGLE_QUOTES_RE = new RegExp("[\\u2018\\u2019\\u201B\\u2032]", "g");
const SMART_DOUBLE_QUOTES_RE = new RegExp("[\\u201C\\u201D\\u201F\\u2033]", "g");
const ODD_DASHES_RE = new RegExp("[\\u2010-\\u2015\\u2212]", "g");

export function cleanPastedText(value) {
  return String(value ?? "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(SMART_SINGLE_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, '"')
    .replace(ODD_DASHES_RE, "-");
}

// Comparacao de nomes sem acento (pesquisa/autocompletar de clientes) -
// "conceicao" encontra "Conceicao".
export function stripAccents(value) {
  return String(value ?? "").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}
