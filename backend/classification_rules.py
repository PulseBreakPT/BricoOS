"""Motor de classificação partilhado — a MESMA lógica serve o Correio
Semanal (secções de um boletim em PDF) e os Anexos_Edição (ficheiros
Excel/PDF dentro de um zip): ambos são, no fundo, "um pedaço de texto que
fala de um assunto do negócio" (uma campanha, uma tabela de preços, uma
incidência, uma nota de encomenda, ...) — não há razão para duas
implementações diferentes.

Decisão de âmbito (confirmada duas vezes pelo utilizador): motor
determinístico por palavra-chave, não IA. A parte de "aprender sozinho,
sem alterações ao código" fica resolvida assim: as categorias e as suas
palavras-chave NÃO estão escritas no código — vivem na base de dados
(coleção `classification_rules`), semeadas uma vez com valores
predefinidos. Quando um documento não bate com nenhuma categoria
conhecida, fica "outro" e o texto que o distingue é guardado; se o mesmo
padrão se repetir, o sistema sugere uma categoria nova (ver
`unclassified_fingerprint`) que um humano aceita uma vez — a partir daí
fica gravada na base de dados e aplica-se sozinha a todas as edições
seguintes, sem precisar de deploy nenhum. O que continua a não ser
possível sem IA é inventar uma categoria do nada, sem qualquer palavra
repetida a apontar para ela — esse é o limite honesto de um motor
determinístico."""

import unicodedata
from collections import Counter
from datetime import datetime, timezone

RULES_DOC_ID = "default"

# Taxonomia inicial — cobre os assuntos já confirmados em amostras reais do
# Correio Semanal e dos Anexos_Edição. Fica só como semente: a cópia que
# manda é sempre a da base de dados (ver load_rules), para poder crescer
# sem tocar no código.
DEFAULT_KEYWORDS = {
    "incidencia": ["incidente", "nao servido", "artigo suprimido", "recolha",
                   "bloqueio de venda", "reclamacao", "nao conformidade"],
    "lista_limpeza": ["limpar ficheiro", "artigos a limpar", "artigo suprimido/ limpar"],
    "nota_encomenda": ["nota de encomenda", "reserva", "pdv n", "data limite de resposta"],
    "tabela_precos": ["tabela de preco", "tabela de precio", "tarifa", "propuesta", "pvp",
                       "preco cessao", "lista de precos", "sobretaxa", "ddd"],
    "dossier_gama": ["dossier de gama", "dossier gama", "ficha tecnica", "caracteristicas tecnicas"],
    "planograma": ["planograma", "implantacao", "exposicao"],
    "campanha": ["campanha", "oportunidade comercial", "condicoes da acao", "regulamento",
                 "adesao", "nao adesao", "promocao"],
    "catalogo": ["catalogo", "folheto", "imperdivel"],
    "informativo": ["para informacao", "nota informativa", "comunicado interno", "informamos que"],
    "tecnico": ["manual tecnico", "instrucoes de montagem", "especificacoes tecnicas", "norma"],
}

CATEGORIES_FALLBACK = "outro"
_TITLE_CHARS = 200
_FINGERPRINT_WORDS = 6
_STOPWORDS = {
    "para", "com", "por", "uma", "das", "dos", "que", "nao", "sim", "sao",
    "este", "esta", "isso", "aquele", "aquela", "todos", "todas", "outro",
    "outros", "sobre", "entre", "mais", "menos", "cada", "pelo", "pela",
}


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def keyword_scores(folded_text, rules):
    """Nº de palavras-chave DISTINTAS (não ocorrências) por categoria — um
    termo genérico repetido dezenas de vezes não deve pesar mais do que a
    frase que o próprio documento usa para se identificar."""
    scores = Counter()
    for cat, keywords in rules.items():
        for kw in keywords:
            if kw in folded_text:
                scores[cat] += 1
    return scores


def classify(text_or_keywords, rules, title_chars=_TITLE_CHARS):
    """Devolve a categoria mais provável, ou "outro" se nada bater certo —
    nunca falha, só fica menos específico. Documentos reais quase sempre
    dizem o que são logo no início ("DOSSIER DE GAMA ...", "NOTA DE
    ENCOMENDA", "CAMPANHA ...") — por isso o início pesa sozinho primeiro;
    só se não decidir nada é que se cai para a frequência de palavras-chave
    no resto do texto, mais ruidosa."""
    folded = _fold(text_or_keywords)
    title_scores = keyword_scores(folded[:title_chars], rules)
    if title_scores:
        return title_scores.most_common(1)[0][0]
    body_scores = keyword_scores(folded, rules)
    if not body_scores:
        return CATEGORIES_FALLBACK
    return body_scores.most_common(1)[0][0]


def unclassified_fingerprint(text_or_keywords):
    """Quando nada bate (categoria "outro"), guarda as palavras mais
    distintivas do próprio texto — não para classificar agora, mas para um
    padrão que se repita em várias edições poder ser reconhecido como
    "provavelmente um tipo de documento novo" e sugerido a um humano (ver
    server.py: deteção de categoria nova)."""
    folded = _fold(text_or_keywords)
    words = [w for w in folded.split() if len(w) >= 5 and w not in _STOPWORDS and w.isalpha()]
    if not words:
        return []
    counts = Counter(words)
    return [w for w, _ in counts.most_common(_FINGERPRINT_WORDS)]


def default_rules_doc():
    return {"id": RULES_DOC_ID,
            "keywords": {k: list(v) for k, v in DEFAULT_KEYWORDS.items()},
            "created_at": _now_iso(), "updated_at": _now_iso()}


async def load_rules(db):
    """Carrega as regras da base de dados, semeando os valores predefinidos
    da primeira vez. A partir daqui, o código nunca mais é a fonte da
    verdade — só a base de dados, que pode crescer via learn_new_category
    sem precisar de deploy nenhum."""
    doc = await db.classification_rules.find_one({"id": RULES_DOC_ID}, {"_id": 0})
    if not doc:
        doc = default_rules_doc()
        await db.classification_rules.insert_one(dict(doc))
    return doc["keywords"]


async def learn_new_category(db, category, keywords, source=""):
    """Acrescenta (ou estende) uma categoria — chamado quando um humano
    aceita uma sugestão de "categoria nova" (ver server.py). Fica gravado
    na base de dados: nenhuma alteração ao código, nenhum deploy, aplica-se
    já à próxima edição processada."""
    rules = await load_rules(db)
    category = category.strip().lower().replace(" ", "_")
    folded_keywords = sorted({_fold(k).strip() for k in keywords if _fold(k).strip()})
    existing = set(rules.get(category, []))
    rules[category] = sorted(existing | set(folded_keywords))
    await db.classification_rules.update_one(
        {"id": RULES_DOC_ID},
        {"$set": {f"keywords.{category}": rules[category], "updated_at": _now_iso()},
         "$push": {"history": {"category": category, "keywords": folded_keywords,
                                "source": source, "at": _now_iso()}}},
        upsert=True)
    return rules
