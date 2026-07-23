"""Anexos_Edição.zip do Correio Semanal — extração determinística de um
pacote de ficheiros heterogéneo (Excel, PDF, e por vezes um zip dentro do
zip), sem depender do nome dos ficheiros nem de uma estrutura fixa de
pastas: cada ficheiro é aberto e classificado pelo próprio conteúdo.

Decisão de âmbito (confirmada): motor determinístico, não IA — deteta o
que reconhecer por palavra-chave (cabeçalhos de coluna em Excel, termos no
texto de um PDF); um layout genuinely novo, sem nenhuma palavra-chave
conhecida, fica arquivado e classificado como "outro" em vez de ficar sem
dados — nunca falha nem é ignorado, só não é decomposto em campos.
"""

import hashlib
import io
import re
import unicodedata
import zipfile
from collections import Counter

import fitz  # PyMuPDF
import openpyxl

MAX_ROWS_PER_SHEET = 1000
HEADER_SCAN_ROWS = 15
MIN_TEXT_CHARS_PER_PAGE = 40  # abaixo disto, o PDF é provavelmente imagem/vetor sem texto


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def _content_hash(data):
    return hashlib.sha256(data).hexdigest()


def iter_zip_files(zip_bytes, _prefix=""):
    """Gerador (caminho, bytes) para cada ficheiro do zip — desce
    recursivamente em qualquer zip encontrado dentro do zip, sem limite de
    profundidade fixo (o padrão real: um "Anexos_Edição.zip" que contém um
    "AÇÃO_...zip" com mais PDFs lá dentro)."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        return
    for info in zf.infolist():
        if info.is_dir():
            continue
        try:
            data = zf.read(info)
        except Exception:
            continue
        path = _prefix + info.filename
        if path.lower().endswith(".zip"):
            yield from iter_zip_files(data, _prefix=path + "/")
        else:
            yield path, data


_EXT_KIND = {
    ".xlsx": "xlsx", ".xlsm": "xlsx", ".xls": "xlsx",
    ".pdf": "pdf", ".docx": "docx", ".doc": "docx",
    ".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image",
}


def detect_file_kind(path, data):
    ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else ""
    kind = _EXT_KIND.get(ext)
    if kind:
        return kind
    if data[:4] == b"%PDF":
        return "pdf"
    if data[:2] == b"PK":
        return "xlsx"  # zip-based Office format sem extensão reconhecida
    return "other"


# ---------- Classificação por conteúdo (nunca pelo nome do ficheiro) ----------
CATEGORIES = ("tabela_precos", "nota_encomenda", "incidencia", "lista_limpeza",
              "dossier_gama", "planograma", "campanha", "catalogo", "outro")

# Cada categoria tem palavras-chave (já sem acentos, em minúsculas) — a
# categoria escolhida é a que tiver mais acertos no texto/cabeçalhos
# encontrados. PT + ES, porque alguns anexos de fornecedor vêm em espanhol
# (confirmado em amostras reais — "PROPUESTA", "TARIFA GENERAL").
_CATEGORY_KEYWORDS = {
    "incidencia": ("incidente", "nao servido", "artigo suprimido", "recolha", "bloqueio de venda"),
    "lista_limpeza": ("limpar ficheiro", "artigos a limpar", "artigo suprimido/ limpar"),
    "nota_encomenda": ("nota de encomenda", "reserva", "pdv n", "data limite de resposta"),
    "tabela_precos": ("tabela de preco", "tabela de precio", "tarifa", "propuesta", "pvp",
                       "preco cessao", "lista de precos", "sobretaxa", "ddd"),
    "dossier_gama": ("dossier de gama", "dossier gama", "ficha tecnica", "caracteristicas tecnicas"),
    "planograma": ("planograma", "implantacao", "exposicao"),
    "campanha": ("campanha", "oportunidade comercial", "condicoes da acao", "regulamento",
                 "adesao", "nao adesao"),
    "catalogo": ("catalogo", "folheto", "imperdivel"),
}


_TITLE_CHARS = 200


def _keyword_scores(folded_text):
    """Nº de palavras-chave DISTINTAS (não ocorrências) por categoria — um
    termo genérico repetido dezenas de vezes num documento comprido (ex.:
    "rutura" numa garantia, "pvp" em cada linha de produto) não deve pesar
    mais do que a frase que o próprio documento usa para se identificar."""
    scores = Counter()
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in folded_text:
                scores[cat] += 1
    return scores


def _classify(text_or_keywords):
    """Devolve a categoria mais provável, ou "outro" se nada bater certo —
    nunca falha, só fica menos específico. Os documentos reais desta
    fonte quase sempre dizem o que são logo no título ("DOSSIER DE GAMA
    ...", "NOTA DE ENCOMENDA", "CATÁLOGO ...") — por isso o título pesa
    sozinho primeiro; só se não decidir nada é que se cai para a
    frequência de palavras-chave no resto do texto, que é mais ruidosa."""
    folded = _fold(text_or_keywords)
    title_scores = _keyword_scores(folded[:_TITLE_CHARS])
    if title_scores:
        return title_scores.most_common(1)[0][0]
    body_scores = _keyword_scores(folded)
    if not body_scores:
        return "outro"
    return body_scores.most_common(1)[0][0]


# ---------- Excel: deteção flexível de cabeçalho (por palavra-chave, não posição) ----------
# Cada campo canónico tem um conjunto de padrões (regex, já sobre texto sem
# acentos) que uma coluna de cabeçalho pode ter — várias colunas podem
# mapear para o mesmo campo (ex.: duas colunas de preço = preço antigo e
# novo lado a lado, muito comum nestas tabelas).
_FIELD_PATTERNS = {
    "ean": (r"^ean", r"^ean.?13$"),
    "itm": (r"^itm", r"^codigo", r"^cod\.?$", r"^ref\.?$", r"^referencia"),
    "descricao": (r"description", r"descri[cç][aã]o", r"descripci[oó]n", r"designa[cç][aã]o", r"^produto$"),
    "marca": (r"^marca$", r"^fornecedor$", r"rais.?soc", r"^marque$"),
    "preco": (r"pre[cç]o", r"precio", r"^pvp", r"tarifa", r"^p\.?\s*cess", r"^pc\b"),
    "quantidade": (r"^uds", r"quantidade", r"^cdt$", r"acond"),
    "data": (r"^data", r"^fecha", r"vigor", r"in[ií]cio", r"^fim$"),
    "incidente": (r"incidente", r"causa"),
    "plano_accao": (r"plano.?a[cç][cç][aã]o", r"solu[cç][aã]o"),
    "estado": (r"^estado$", r"^status$"),
}
_FIELD_RES = {field: [re.compile(p) for p in pats] for field, pats in _FIELD_PATTERNS.items()}


def _match_fields(header_text):
    folded = _fold(header_text).strip()
    return [field for field, res in _FIELD_RES.items() if any(r.search(folded) for r in res)]


_MAX_COLS = 40


def _extract_sheet(ws):
    """openpyxl em modo read-only não é fiável em ws.max_row/max_column —
    ficheiros reais aparecem com formatação aplicada à coluna inteira e o
    valor fica ordens de grandeza acima do conteúdo real (chegou a
    pendurar o processo minutos a fio numa das folhas de amostra). Por
    isso nunca se itera por posição: só ws.iter_rows() em stream, com um
    limite explícito de linhas (MAX_ROWS_PER_SHEET) que manda parar
    independentemente do que os metadados da folha disserem."""
    row_iter = ws.iter_rows(values_only=True)
    buffered = []
    for _ in range(HEADER_SCAN_ROWS):
        try:
            buffered.append(next(row_iter))
        except StopIteration:
            break

    best_row, best_score, best_fields = None, 0, {}
    for idx, values in enumerate(buffered, start=1):
        fields, score = {}, 0
        for c, v in enumerate(values[:_MAX_COLS], start=1):
            if not v or not isinstance(v, str):
                continue
            matched = _match_fields(v)
            if matched:
                fields[c] = {"header": v.strip(), "fields": matched}
                score += 1
        if score > best_score:
            best_row, best_score, best_fields = idx, score, fields

    if not best_row or not best_fields:
        # Sem cabeçalho reconhecível — não inventa colunas; guarda só uma
        # amostra do texto para a categoria poder ser deduzida de outra forma.
        sample = " ".join(str(v) for row in buffered for v in row if isinstance(v, str))[:1000]
        return {"header_row": None, "columns": {}, "rows": [], "row_count": 0,
                "truncated": False, "sample_text": sample}

    # Amostra para a classificação por conteúdo: todo o texto das linhas até
    # ao cabeçalho (título/contexto acima) + a linha de cabeçalho inteira —
    # não só as colunas reconhecidas, senão uma coluna como "Tabela 2026
    # c/sobretaxa" perdia a palavra "sobretaxa" por a coluna em si não
    # corresponder a nenhum campo canónico.
    context_rows = buffered[:best_row]
    sample = " ".join(str(v) for row in context_rows for v in row if isinstance(v, str))[:1500]

    columns = best_fields
    rows, truncated = [], False

    def _consume(values):
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in values):
            return
        row = {}
        for c, v in enumerate(values[:_MAX_COLS], start=1):
            if c in columns and v is not None:
                row[columns[c]["header"]] = v
        if row:
            rows.append(row)

    for values in buffered[best_row:]:
        if len(rows) >= MAX_ROWS_PER_SHEET:
            truncated = True
            break
        _consume(values)
    if not truncated:
        for values in row_iter:
            if len(rows) >= MAX_ROWS_PER_SHEET:
                truncated = True
                break
            _consume(values)

    return {"header_row": best_row, "columns": {c: v["fields"] for c, v in columns.items()},
            "column_labels": {c: v["header"] for c, v in columns.items()},
            "rows": rows, "row_count": len(rows), "truncated": truncated, "sample_text": sample}


def _structural_category(sheets):
    """As frases-chave no texto às vezes não chegam (uma folha só com
    "EAN / DESIGNAÇÃO / PREÇO 2026" não usa nenhuma das frases da lista),
    mas as colunas já identificadas por _extract_sheet não deixam dúvidas
    sobre o que a folha é — mais fiável do que procurar frases soltas."""
    all_fields = {f for sheet in sheets for cols in sheet.get("columns", {}).values() for f in cols}
    if "incidente" in all_fields or "plano_accao" in all_fields:
        return "incidencia"
    if "preco" in all_fields and ("ean" in all_fields or "itm" in all_fields or "descricao" in all_fields):
        return "tabela_precos"
    return None


def extract_xlsx(data):
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:
        return {"error": str(e), "sheets": []}
    sheets = []
    classify_text = []
    for ws in wb.worksheets:
        info = _extract_sheet(ws)
        info["sheet_name"] = ws.title
        sheets.append(info)
        classify_text.append(ws.title)
        classify_text.append(info.get("sample_text", ""))
    category = _classify(" ".join(classify_text))
    if category == "outro":
        category = _structural_category(sheets) or category
    return {"sheets": sheets, "category": category}


# ---------- PDF: reaproveita a mesma extração de texto de correio_semanal.py ----------
_FACT_CONTACT_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+|\b2\d{2}\s?\d{3}\s?\d{3}\b")
_FACT_DEADLINE_RE = re.compile(r"DATA LIMITE DE (RESPOSTA|ENCOMENDA)[:_\s]*", re.IGNORECASE)


def extract_pdf(data):
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        return {"error": str(e)}
    page_count = doc.page_count
    texts = [page.get_text() for page in doc]
    full_text = "\n".join(texts)
    avg_chars = len(full_text) / max(page_count, 1)
    if avg_chars < MIN_TEXT_CHARS_PER_PAGE:
        return {"page_count": page_count, "likely_image_pdf": True, "category": "outro",
                "text_chars": len(full_text)}
    category = _classify(full_text)
    deadlines = sorted(set(m.group(0).strip() for m in _FACT_DEADLINE_RE.finditer(full_text)))
    contacts = sorted(set(_FACT_CONTACT_RE.findall(full_text)))
    return {"page_count": page_count, "likely_image_pdf": False, "category": category,
            "text_chars": len(full_text), "deadline_mentions": deadlines, "contacts": contacts,
            "excerpt": re.sub(r"\s+", " ", full_text).strip()[:600]}


_EDITION_RE = re.compile(r"(\d{3,4})")


def process_zip(zip_bytes, zip_filename=""):
    """Ponto de entrada: descompacta (incl. zips aninhados), classifica e
    extrai cada ficheiro pelo conteúdo. Devolve a lista de ficheiros
    processados + um resumo — nunca lança exceção por um ficheiro
    individual falhar (fica marcado com "error", os restantes continuam)."""
    edition_m = _EDITION_RE.search(zip_filename or "")
    edition_number = edition_m.group(1) if edition_m else None

    files = []
    for path, data in iter_zip_files(zip_bytes):
        entry = {"path": path, "size": len(data), "content_hash": _content_hash(data),
                 "kind": detect_file_kind(path, data)}
        try:
            if entry["kind"] == "xlsx":
                extracted = extract_xlsx(data)
                entry["category"] = extracted.pop("category", "outro")
                entry["extracted"] = extracted
            elif entry["kind"] == "pdf":
                extracted = extract_pdf(data)
                entry["category"] = extracted.get("category", "outro")
                entry["extracted"] = extracted
            else:
                entry["category"] = "outro"
                entry["extracted"] = {}
        except Exception as e:
            entry["category"] = "outro"
            entry["extracted"] = {}
            entry["error"] = str(e)
        files.append(entry)

    by_category = Counter(f["category"] for f in files)
    return {
        "edition_number": edition_number,
        "zip_filename": zip_filename,
        "file_count": len(files),
        "files": files,
        "by_category": dict(by_category),
    }


# ---------- Comparação entre edições ----------
def _price_index(processed):
    """{ean_ou_itm: {"preco", "descricao", "path"}} — juntando TODAS as
    tabelas de preços da edição, não um ficheiro em concreto: os nomes dos
    ficheiros de preços mudam de semana para semana, o que se mantém
    comparável é o conteúdo (EAN/ITM). Quando uma folha tem mais do que
    uma coluna de preço lado a lado (ex.: "Tabela 2025" e "Tabela 2026" —
    antigo vs novo dentro da própria semana), usa-se a mais à direita, que
    nas amostras reais é sempre a mais recente."""
    index = {}
    for f in processed.get("files", []):
        if f.get("category") != "tabela_precos" or f.get("kind") != "xlsx":
            continue
        for sheet in f.get("extracted", {}).get("sheets", []):
            columns, labels = sheet.get("columns", {}), sheet.get("column_labels", {})
            key_cols = [c for c, fs in columns.items() if "ean" in fs or "itm" in fs]
            desc_cols = [c for c, fs in columns.items() if "descricao" in fs]
            preco_cols = sorted(c for c, fs in columns.items() if "preco" in fs)
            if not key_cols or not preco_cols:
                continue
            key_label = labels[key_cols[0]]
            desc_label = labels[desc_cols[0]] if desc_cols else None
            preco_label = labels[preco_cols[-1]]
            for row in sheet.get("rows", []):
                key, price = row.get(key_label), row.get(preco_label)
                if key is None or not isinstance(price, (int, float)):
                    continue
                index[str(key)] = {"preco": float(price),
                                    "descricao": row.get(desc_label) if desc_label else None,
                                    "path": f["path"]}
    return index


def diff_edicao_versions(prev, new):
    """Compara duas edições do Anexos_Edição — ficheiros novos/removidos/
    atualizados (por hash de conteúdo, nunca pelo nome — os nomes mudam de
    semana para semana) e alterações de preço/produtos novos/descontinuados
    (por EAN/ITM, juntando todas as tabelas de preços de cada edição)."""
    if not prev or not new:
        return None

    def norm(path):
        # O primeiro segmento do caminho é a pasta raiz do zip
        # ("Anexos_Edição 644/...") — muda de número a cada edição, por
        # isso não entra na comparação.
        parts = path.split("/", 1)
        return parts[1] if len(parts) > 1 else path

    prev_by_path = {norm(f["path"]): f for f in prev.get("files", [])}
    new_by_path = {norm(f["path"]): f for f in new.get("files", [])}
    new_files = sorted(set(new_by_path) - set(prev_by_path))
    removed_files = sorted(set(prev_by_path) - set(new_by_path))
    updated_files = sorted(
        p for p in (set(new_by_path) & set(prev_by_path))
        if new_by_path[p]["content_hash"] != prev_by_path[p]["content_hash"])

    prev_prices, new_prices = _price_index(prev), _price_index(new)
    price_changes = []
    for key, new_info in new_prices.items():
        old_info = prev_prices.get(key)
        if not old_info or abs(old_info["preco"] - new_info["preco"]) < 0.005:
            continue
        pct = ((new_info["preco"] - old_info["preco"]) / old_info["preco"] * 100) if old_info["preco"] else None
        price_changes.append({
            "key": key, "descricao": new_info.get("descricao") or old_info.get("descricao"),
            "preco_antigo": old_info["preco"], "preco_novo": new_info["preco"],
            "variacao_pct": round(pct, 1) if pct is not None else None})
    price_changes.sort(key=lambda c: -(abs(c["variacao_pct"]) if c["variacao_pct"] is not None else 0))
    new_products = sorted(set(new_prices) - set(prev_prices))
    discontinued_products = sorted(set(prev_prices) - set(new_prices))

    return {
        "prev_edition": prev.get("edition_number"), "new_edition": new.get("edition_number"),
        "new_files": new_files, "removed_files": removed_files, "updated_files": updated_files,
        "price_changes": price_changes[:200], "price_changes_count": len(price_changes),
        "new_products": new_products[:200], "new_products_count": len(new_products),
        "discontinued_products": discontinued_products[:200],
        "discontinued_products_count": len(discontinued_products),
        "has_changes": bool(new_files or removed_files or updated_files or price_changes
                            or new_products or discontinued_products),
    }
