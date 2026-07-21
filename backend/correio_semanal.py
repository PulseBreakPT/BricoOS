"""Resumo do "Correio Semanal" (boletim interno dos Mosqueteiros/Bricomarché).

Extração determinística, sem IA: lê o PDF por página com PyMuPDF, identifica
o índice de secções, os prazos/referências (datas-limite, MEA, folheto) e
reconstrói um resumo limpo por secção — sem cortar frases nem parafrasear,
só sem o ruído repetido do layout (rodapés, "CLICAR AQUI", etiquetas de
secção duplicadas). O layout muda ligeiramente de semana para semana, por
isso cada passo tem um fallback razoável em vez de assumir uma estrutura
rígida.

O resultado é HTML (títulos, negrito nas referências, lista de prazos) —
não texto simples — para o resumo ser rápido de ler em vez de uma parede de
texto. Todo o texto extraído do PDF passa por html.escape antes de entrar em
qualquer tag; as únicas tags no output são as que este módulo escreve, nunca
HTML vindo do PDF (que nem sequer tem HTML — é só texto).
"""

import re
from collections import Counter
from html import escape as html_escape

import fitz  # PyMuPDF

_TOC_ENTRY_RE = re.compile(r"^\s*(\d{2})\.\s*(.+?)\s*$")
_PAGE_MARK_RE = re.compile(r"^\s*P\.(\d+)\s*$")
_PAGE_MARK_PREFIX_RE = re.compile(r"^P\.\d+\s+")

_DEADLINE_KEYWORD_RE = re.compile(r"DATA LIMITE DE RESPOSTA", re.IGNORECASE)
_MEA_RE = re.compile(r"MEA\s*N[ºo°]?\s*[\d/]+[^\n,;]*", re.IGNORECASE)
_FOLHETO_RE = re.compile(r"FOLHETO\s*N[ºo°]?\s*[\d/]+", re.IGNORECASE)
_FACT_STARTS_RE = re.compile(
    r"^\s*(DATA LIMITE DE RESPOSTA|MEA\s*N[ºo°]?\s*[\d/]+|FOLHETO\s*N[ºo°]?\s*[\d/]+)",
    re.IGNORECASE)
# Para pôr em negrito estas referências onde quer que apareçam (na lista de
# prazos e dentro do texto de cada secção) — o que mais importa saltar à
# vista numa leitura rápida.
_INLINE_HIGHLIGHT_RE = re.compile(
    r"(DATA LIMITE DE RESPOSTA[:_]?|MEA\s*N[ºo°]?\s*[\d/]+|FOLHETO\s*N[ºo°]?\s*[\d/]+)",
    re.IGNORECASE)

# Linhas de "mobília" do layout que se repetem em quase todas as páginas e
# não têm informação própria — removidas do texto de cada secção.
_NOISE_LINE_RE = re.compile(
    r"^\s*(PARA VOLTAR AO IN[IÍ]CIO|CLICAR\s*AQUI|ZONA DE COMENT[ÁA]RIOS PDV:?|"
    r"CSN\s*N?[ºo°]?\s*\d+\s*[–-]\s*SEM\s*\d+/\d+|PARA INFORMA[ÇC][ÃA]O)\s*$",
    re.IGNORECASE)
_ACTION_RE = re.compile(r"❑\s*(A ENCOMENDAR|A FAZER)", re.IGNORECASE)
_FWD_PREFIX_RE = re.compile(r"^\s*(re|fw|fwd|enc)\s*:\s*", re.IGNORECASE)


def _pages_text(pdf_bytes):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        return []
    try:
        return [page.get_text() for page in doc]
    except Exception:
        return []


def _parse_toc(pages):
    """As primeiras páginas costumam ter o índice — entradas "NN. Título".
    Uma página só conta como "página de índice" (excluída do resumo por
    secção mais abaixo, já que o seu conteúdo fica coberto pelo próprio
    índice) se tiver pelo menos 3 entradas — evita apanhar por engano uma
    página de conteúdo que só por acaso tenha uma linha numerada."""
    toc = {}
    toc_pages = set()
    for idx, page_text in enumerate(pages[:3]):
        found_here = 0
        for line in page_text.splitlines():
            m = _TOC_ENTRY_RE.match(line)
            if m:
                num, title = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
                if title and num not in toc:
                    toc[num] = title
                found_here += 1
        if found_here >= 3:
            toc_pages.add(idx)
    return toc, toc_pages


def _extract_facts(full_text):
    """Datas-limite, MEAs e folhetos — nunca resumidos, sempre completos e
    deduplicados, na ordem em que aparecem no documento. Isto é o que mais
    importa não passar despercebido, por isso fica sempre em bloco próprio
    no topo do resumo, independente da limpeza por secção."""
    lines = full_text.splitlines()
    seen = set()
    facts = []

    def add(fact):
        fact = re.sub(r"\s+", " ", fact).strip(" .-–")
        if fact and fact.lower() not in seen:
            seen.add(fact.lower())
            facts.append(fact)

    for i, line in enumerate(lines):
        if _DEADLINE_KEYWORD_RE.search(line):
            combined = line.strip()
            j = i + 1
            # A data-limite às vezes continua na(s) linha(s) seguinte(s)
            # (ex.: "DATA LIMITE DE RESPOSTA" numa linha, "- Oportunidade
            # X" na seguinte) — junta enquanto parecer continuação, parando
            # assim que a linha seguinte for já outro facto distinto.
            while j < len(lines) and j < i + 3:
                nxt = lines[j].strip()
                if not nxt or len(nxt) > 80 or _FACT_STARTS_RE.match(nxt):
                    break
                combined += " " + nxt
                j += 1
            add(combined)
        for rx in (_MEA_RE, _FOLHETO_RE):
            m = rx.search(line)
            if m:
                add(m.group(0))
    return facts


def _reflow(lines):
    """As páginas deste PDF vêm muitas vezes com uma palavra por linha
    (colunas estreitas) — junta em parágrafos para ficar legível, sem tirar
    nem alterar palavra nenhuma. Devolve uma lista de (é_título, texto).

    Uma linha em maiúsculas é um título/subtítulo do próprio boletim — fica
    sempre em destaque, nunca fundida com o texto corrido. Mas um título
    longo vem muitas vezes partido em 2-3 linhas maiúsculas seguidas (a
    largura da coluna) — essas juntam-se num único parágrafo de título, para
    não aparecer partido a meio. Uma "etiqueta" de uma palavra só (ex.
    "DIGITAL", "ATUALIDADES" — o departamento/categoria da página) fica
    sempre isolada, nunca se funde com o título ao lado."""
    paragraphs = []
    buf = []
    heading_buf = []

    def flush_text():
        if buf:
            paragraphs.append((False, " ".join(buf)))
            buf.clear()

    def flush_heading():
        if heading_buf:
            paragraphs.append((True, " ".join(heading_buf)))
            heading_buf.clear()

    for line in lines:
        if line.isupper() and len(line) > 3:
            flush_text()
            is_tag = " " not in line and len(line) <= 15
            if is_tag:
                flush_heading()
                paragraphs.append((True, line))
            else:
                heading_buf.append(line)
            continue
        flush_heading()
        buf.append(line)
        if re.search(r"[.!?:”’)]$", line):
            flush_text()
    flush_heading()
    flush_text()
    return paragraphs


def _clean_page(text):
    """Limpa uma página: tira o ruído do layout, extrai as etiquetas de
    ação (❑ A ENCOMENDAR / ❑ A FAZER) e junta o texto em parágrafos."""
    raw_lines = [l.strip() for l in text.splitlines() if l.strip()]
    counts = Counter(raw_lines)
    lines = []
    actions = []
    seen_repeats = set()
    for line in raw_lines:
        line = _PAGE_MARK_PREFIX_RE.sub("", line).strip()
        if not line:
            continue
        am = _ACTION_RE.search(line)
        if am:
            tag = am.group(1).title()
            if tag not in actions:
                actions.append(tag)
            line = _ACTION_RE.sub("", line).strip(" ❑")
            if not line:
                continue
        if _NOISE_LINE_RE.match(line) or _PAGE_MARK_RE.match(line) or _TOC_ENTRY_RE.match(line):
            continue
        # Chrome do layout (etiquetas de secção, "DIGITAL", etc.) repete-se
        # literalmente na mesma página, sempre em maiúsculas — mantém só a
        # 1ª ocorrência. Restrito a maiúsculas para nunca apanhar palavras
        # curtas de ligação (ex. "às", "de") que se repetem legitimamente
        # em texto normal quebrado numa coluna estreita.
        if line.isupper() and counts[line] > 1:
            if line in seen_repeats:
                continue
            seen_repeats.add(line)
        lines.append(line)
    return _reflow(lines), actions


def _section_title(page_text, page_index, toc):
    """A marca "P.N" da página identifica a que entrada do índice
    corresponde. Sem marca reconhecida (ou sem essa entrada no índice),
    usa a primeira linha em maiúsculas da página como título aproximado;
    em último caso, um título genérico pela posição."""
    for line in page_text.splitlines():
        m = _PAGE_MARK_RE.match(line.strip())
        if m:
            num = m.group(1).zfill(2)
            if num in toc:
                return f"{num}. {toc[num]}"
    for line in page_text.splitlines():
        stripped = line.strip()
        if (len(stripped) > 4 and stripped == stripped.upper()
                and any(c.isalpha() for c in stripped)
                and not _NOISE_LINE_RE.match(stripped)):
            return stripped.title()
    return f"Página {page_index + 1}"


def _highlight(escaped_text):
    """Realça (negrito) as referências MEA/FOLHETO/DATA LIMITE dentro de um
    texto já escapado — aplicado tanto na lista de prazos como no corpo de
    cada secção, para as referências saltarem à vista sempre que aparecem,
    não só no bloco dedicado."""
    return _INLINE_HIGHLIGHT_RE.sub(lambda m: f"<strong>{m.group(0)}</strong>", escaped_text)


def _clean_subject_title(subject):
    s = (subject or "").strip()
    while True:
        m = _FWD_PREFIX_RE.match(s)
        if not m:
            break
        s = s[m.end():].strip()
    return s or "Correio Semanal"


def build_digest(pdf_bytes_list, subject):
    """Resumo completo do Correio Semanal, em HTML — títulos, negrito nas
    referências, lista de prazos — pronto a mostrar na app. Sem IA: só
    extração e limpeza determinística, por isso o mesmo PDF produz sempre o
    mesmo resultado."""
    all_pages = []
    for pdf_bytes in pdf_bytes_list:
        all_pages.extend(_pages_text(pdf_bytes))
    if not all_pages:
        return ""

    full_text = "\n".join(all_pages)
    toc, toc_pages = _parse_toc(all_pages)
    facts = _extract_facts(full_text)

    html_parts = [f"<h3>{html_escape(_clean_subject_title(subject))}</h3>"]

    if facts:
        items = "".join(f"<li>{_highlight(html_escape(f))}</li>" for f in facts)
        html_parts.append(f"<h4>Prazos e referências</h4><ul>{items}</ul>")

    seen_titles = set()
    for i, page_text in enumerate(all_pages):
        if i in toc_pages:
            continue
        paragraphs, actions = _clean_page(page_text)
        total_len = sum(len(p) for _, p in paragraphs)
        if total_len < 30:
            continue
        title = _section_title(page_text, i, toc)
        if title in seen_titles:
            title = f"{title} (cont.)"
        else:
            seen_titles.add(title)

        section_html = [f"<h4>{html_escape(title)}</h4>"]
        if actions:
            tags = ", ".join(html_escape(a) for a in actions)
            section_html.append(f'<p class="csn-action">Ação: {tags}</p>')
        for is_heading, para in paragraphs:
            escaped = _highlight(html_escape(para))
            if is_heading:
                section_html.append(f"<p><strong>{escaped}</strong></p>")
            else:
                section_html.append(f"<p>{escaped}</p>")
        html_parts.append("".join(section_html))

    return "".join(html_parts)
