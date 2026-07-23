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
import unicodedata
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
_FWD_PREFIX_RE = re.compile(r"^\s*(re|fw|fwd|enc)\s*:\s*", re.IGNORECASE)

# Cada página tem 3 caixas fixas: "PARA INFORMAÇÃO", "A ENCOMENDAR", "A
# FAZER". Uma caixa por marcar mantém o glifo ❑ no texto extraído do PDF;
# uma caixa marcada (✅) perde o glifo — o texto extraído fica só com o
# nome da caixa, sem nada à frente. O ❑ de uma caixa por marcar também pode
# aparecer isolado numa linha própria, com o nome da caixa só na linha
# seguinte (varia consoante a versão do boletim). Confirmado a olho contra
# o PDV real (5 páginas, marcações diferentes) — o ❑ ANTES do nome é o
# único sinal fiável de "não marcada".
CHECKBOX_LABELS = ("PARA INFORMAÇÃO", "A ENCOMENDAR", "A FAZER")
_CHECKBOX_GLYPH_RE = re.compile(r"^❑\s*(.*)$")


def _checkbox_state(text):
    """{"PARA INFORMAÇÃO"|"A ENCOMENDAR"|"A FAZER": True/False} — True =
    marcada nesta página (aplica-se)."""
    state = {}
    pending_unchecked = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = _CHECKBOX_GLYPH_RE.match(line)
        if m:
            rest = m.group(1).strip()
            if rest:
                for label in CHECKBOX_LABELS:
                    if rest.upper().startswith(label):
                        state.setdefault(label, False)
                pending_unchecked = False
            else:
                pending_unchecked = True
            continue
        matched = False
        for label in CHECKBOX_LABELS:
            if line.upper() == label:
                state.setdefault(label, not pending_unchecked)
                matched = True
                break
        pending_unchecked = False if matched else pending_unchecked
    return state


# ---------- Extração estruturada (para tarefas sugeridas e comparação semanal) ----------
_CSN_NUMBER_RE = re.compile(r"CORREIO\s*SEMANAL\s*N[ºo°]\s*(\d+)", re.IGNORECASE)
_WEEK_LABEL_RE = re.compile(r"^S\.(\d{1,2})\s*$", re.MULTILINE)
_ISSUE_DATE_RE = re.compile(
    r"(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|"
    r"setembro|outubro|novembro|dezembro)\s*\n\s*(\d{4})", re.IGNORECASE)
_SEMANA_RE = re.compile(r"^SEMANA\s*N[ºo°]\s*(\d+)", re.IGNORECASE)
_WEEKDAY_RE = re.compile(
    r"^(Segunda|Ter[çc]a|Quarta|Quinta|Sexta|S[áa]bado|Domingo)\s*-?\s*feira,\s*"
    r"(\d{1,2})\s+de\s+(\w+)", re.IGNORECASE)
_CALENDAR_ITEM_START_RE = re.compile(r"^(DATA LIMITE DE RESPOSTA|MEA\s*N[ºo°])", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_ADHESION_RE = re.compile(r"N[ÃA]O\s+ADES[ÃA]O|ADES[ÃA]O", re.IGNORECASE)

_MONTHS_PT = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def _iso_date(day, month_name, year):
    month = _MONTHS_PT.get(_fold(month_name))
    if not month or not year:
        return None
    try:
        return f"{int(year):04d}-{month:02d}-{int(day):02d}"
    except (TypeError, ValueError):
        return None


def _parse_header(full_text):
    csn = _CSN_NUMBER_RE.search(full_text)
    week = _WEEK_LABEL_RE.search(full_text)
    date_m = _ISSUE_DATE_RE.search(full_text)
    year = int(date_m.group(3)) if date_m else None
    return {
        "csn_number": csn.group(1) if csn else None,
        "week_label": f"S.{week.group(1)}" if week else None,
        "issue_date": _iso_date(date_m.group(1), date_m.group(2), year) if date_m else None,
        "year": year,
    }


def _parse_deadlines_calendar(full_text, year):
    """A caixa "DATAS a não esquecer!" da página 1 — SEMANA Nº > dia da
    semana > lista de prazos. Sempre no mesmo formato de semana para
    semana mesmo que o resto do boletim mude de layout, por isso é a
    fonte mais fiável para os prazos (item 1 do pedido)."""
    start = full_text.find("SEMANA")
    if start == -1:
        return []
    end = full_text.find("Atualidades", start)
    block = full_text[start:end if end != -1 else None]
    lines = [l.strip() for l in block.splitlines() if l.strip()]

    calendar = []
    week = day_label = day_date_text = day_iso = None
    items, buf = [], []

    def flush_item():
        if buf:
            text = re.sub(r"\s+", " ", " ".join(buf)).strip(" -")
            if text:
                items.append(text)
            buf.clear()

    def flush_day():
        flush_item()
        if day_label and items:
            calendar.append({"week": week, "weekday": day_label, "date": day_date_text,
                              "date_iso": day_iso, "items": list(items)})
        items.clear()

    for line in lines:
        m = _SEMANA_RE.match(line)
        if m:
            flush_day()
            week = f"Nº{m.group(1)}"
            day_label = day_date_text = day_iso = None
            continue
        m = _WEEKDAY_RE.match(line)
        if m:
            flush_day()
            day_label = m.group(1).title()
            day_date_text = f"{m.group(2)} de {m.group(3)}"
            day_iso = _iso_date(m.group(2), m.group(3), year)
            continue
        if _CALENDAR_ITEM_START_RE.match(line):
            flush_item()
            buf.append(line)
            continue
        if buf:
            buf.append(line)
    flush_day()
    return calendar


def _page_department(text):
    """A "etiqueta" curta em maiúsculas (ex.: BRICOLAGE, JARDIM, DIGITAL) —
    mesma heurística usada em _reflow para não fundir a etiqueta com o
    título ao lado, aqui reaproveitada como campo próprio. Deteta o que
    houver, não uma lista fixa de departamentos."""
    for line in text.splitlines():
        line = line.strip()
        if (line and line.isupper() and " " not in line and len(line) <= 15
                and not _PAGE_MARK_RE.match(line) and not _NOISE_LINE_RE.match(line)):
            return line.title()
    return None


def _adhesion_info(text):
    """Secções que pedem uma resposta por email (adesão/não adesão) — para
    sugerir o rascunho, nunca para enviar sozinho."""
    if not _ADHESION_RE.search(text):
        return False, []
    return True, sorted(set(_EMAIL_RE.findall(text)))


def extract_structured(pdf_bytes_list, subject):
    """Extração estruturada (não HTML) do mesmo boletim que build_digest
    resume — usada para sugerir tarefas, comparar com a semana anterior e
    guardar histórico. Orientada pelo conteúdo de cada página (marcador
    P.N + índice + as 3 caixas fixas), nunca por um número de página fixo:
    uma secção nova, numa posição nunca vista, é lida da mesma forma."""
    all_pages = []
    for pdf_bytes in pdf_bytes_list:
        all_pages.extend(_pages_text(pdf_bytes))
    if not all_pages:
        return None

    full_text = "\n".join(all_pages)
    header = _parse_header(full_text)
    toc, toc_pages = _parse_toc(all_pages)
    deadlines_calendar = _parse_deadlines_calendar(full_text, header.get("year"))

    sections = []
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
        requires_adhesion, adhesion_emails = _adhesion_info(page_text)
        sections.append({
            "page": i + 1, "title": title, "department": _page_department(page_text),
            "checked_actions": actions,
            "deadline_mentions": _extract_facts(page_text),
            "mea_mentions": sorted({m.group(0).strip() for m in _MEA_RE.finditer(page_text)}),
            "requires_adhesion_email": requires_adhesion, "adhesion_emails": adhesion_emails,
            "text": " ".join(p for _, p in paragraphs)[:2000],
        })

    return {**header, "subject": _clean_subject_title(subject), "sections": sections,
            "deadlines_calendar": deadlines_calendar,
            "section_titles": [s["title"] for s in sections]}


def diff_digest_versions(prev, new):
    """Compara duas edições do Correio Semanal (extract_structured) —
    assuntos novos, removidos, e prazos novos/removidos. Não tenta
    adivinhar se um assunto é "o mesmo" só que mudou (os títulos raramente
    coincidem ao carácter entre edições) — só o que apareceu e o que
    desapareceu, que já poupa reler tudo de novo."""
    if not prev or not new:
        return None
    prev_titles = set(prev.get("section_titles") or [])
    new_titles = set(new.get("section_titles") or [])

    def _flat_items(digest):
        return {item for day in (digest.get("deadlines_calendar") or []) for item in day.get("items", [])}

    prev_items, new_items = _flat_items(prev), _flat_items(new)
    prev_depts = Counter(s.get("department") for s in (prev.get("sections") or []) if s.get("department"))
    new_depts = Counter(s.get("department") for s in (new.get("sections") or []) if s.get("department"))
    dept_changes = {d: new_depts[d] - prev_depts.get(d, 0) for d in new_depts if new_depts[d] != prev_depts.get(d, 0)}
    for d in prev_depts:
        if d not in new_depts:
            dept_changes[d] = -prev_depts[d]

    added_sections = sorted(new_titles - prev_titles)
    removed_sections = sorted(prev_titles - new_titles)
    added_deadlines = sorted(new_items - prev_items)
    removed_deadlines = sorted(prev_items - new_items)
    return {
        "prev_csn_number": prev.get("csn_number"), "new_csn_number": new.get("csn_number"),
        "added_sections": added_sections, "removed_sections": removed_sections,
        "added_deadlines": added_deadlines, "removed_deadlines": removed_deadlines,
        "department_changes": dept_changes,
        "has_changes": bool(added_sections or removed_sections or added_deadlines or removed_deadlines),
    }


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
    """Limpa uma página: tira o ruído do layout, lê o estado das 3 caixas
    fixas (PARA INFORMAÇÃO / A ENCOMENDAR / A FAZER) e junta o texto em
    parágrafos. Devolve (parágrafos, [rótulos marcados])."""
    checkbox_state = _checkbox_state(text)
    actions = [label.title() for label in ("A ENCOMENDAR", "A FAZER") if checkbox_state.get(label)]
    raw_lines = [l.strip() for l in text.splitlines() if l.strip()]
    counts = Counter(raw_lines)
    lines = []
    seen_repeats = set()
    for line in raw_lines:
        line = _PAGE_MARK_PREFIX_RE.sub("", line).strip()
        if not line:
            continue
        cm = _CHECKBOX_GLYPH_RE.match(line)
        if cm:
            rest = cm.group(1).strip()
            if not rest or any(rest.upper().startswith(l) for l in CHECKBOX_LABELS):
                continue
        elif any(line.upper() == label for label in CHECKBOX_LABELS):
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
