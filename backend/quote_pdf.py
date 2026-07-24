"""Importação de orçamentos PDF da BandAluminios e geração do PDF de venda.

O fornecedor envia um PDF com carta de apresentação (IBANs, condições) e uma
tabela de caixilhos com gráfico, descrição, quantidade e preço de custo.
A loja entrega ao cliente um PDF com o mesmo formato de tabela mas com o
logótipo Bricomarché, sem os dados do fornecedor e com preços de venda num
total único com IVA incluído — réplica do documento que a loja já fazia à mão.
"""

import base64
import io
import re
import unicodedata
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

import fitz  # PyMuPDF
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

IVA_RATE = 0.23

# Margens da loja sobre o custo do fornecedor: PVC 15%; alumínio, redes
# mosquiteiras e portadas 18%. O material é detetado pela descrição da linha
# (as séries vêm do catálogo BandAluminios: Euro-Design/Slinova são PVC;
# SB/Thermostop/Thermoline/Confort e as Portadas HP são alumínio). Quando a
# descrição não permite identificar o material com segurança, aplica-se 20%
# por defeito — nunca se arrisca uma margem baixa num artigo desconhecido.
MARGIN_PVC_PCT = 15.0
MARGIN_ALU_PCT = 18.0
MARGIN_UNKNOWN_PCT = 20.0

MATERIAL_MARGINS = {"pvc": MARGIN_PVC_PCT, "aluminio": MARGIN_ALU_PCT,
                    "portada": MARGIN_ALU_PCT, "rede": MARGIN_ALU_PCT,
                    "desconhecido": MARGIN_UNKNOWN_PCT}
MATERIAL_LABELS = {"pvc": "PVC", "aluminio": "Alumínio",
                   "portada": "Portada", "rede": "Rede mosquiteira",
                   "desconhecido": "Não identificado"}
_PVC_HINTS = ("pvc", "euro-design", "eurodesign", "slinova")
_ALU_HINTS = ("alumin", "thermostop", "thermoline", "confort")

# Fronteiras horizontais (pontos PDF) das colunas da tabela BandAluminios,
# medidas em orçamentos reais. O Nº fica à esquerda de X_DESC; o gráfico
# ocupa o espaço até X_DESC sem texto.
X_NUM_MAX = 45
X_DESC_MIN, X_DESC_MAX = 130, 338
X_QTY_MAX = 380
X_UNIT_MAX = 460
X_TOTAL_MAX = 545

# Escala do rasterizado da célula "GRÁFICO" (4x ~= 288 dpi): nítido mesmo
# impresso, mantendo o ficheiro leve.
GRAPHIC_RENDER_MATRIX = fitz.Matrix(4, 4)

OBSERVACOES = [
    "ATENÇÃO: Todas as medidas são LARGURA x ALTURA.",
    "ATENÇÃO: Todos os caixilhos estão vistos pelo INTERIOR.",
    "ATENÇÃO: Todas as medidas estão em milímetros.",
    "ATENÇÃO: Não fornecemos puxadores exteriores para portas.",
    "ATENÇÃO: Solicitamos que analisem pormenorizadamente o orçamento antes "
    "de procederem à encomenda.",
]

STORE_ADDRESS = ["BRICO FARO", "EDÍFICIO BRICOMARCHÉ, RUA VALE DA AMOREIRA", "8005-429  FARO", "FARO"]

TABLE_BLUE = colors.HexColor("#2B57A5")


def _parse_pt_number(raw):
    try:
        return float(raw.replace(".", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None


def format_pt_price(value):
    return f"{value:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def detect_material(description):
    """Classifica a linha para escolher a margem:
    pvc | aluminio | portada | rede | desconhecido (20% por segurança)."""
    d = _fold(description)
    if "mosquit" in d or re.search(r"\brede\b", d):
        return "rede"
    if "portada" in d:
        return "portada"
    if any(hint in d for hint in _PVC_HINTS):
        return "pvc"
    if any(hint in d for hint in _ALU_HINTS) or re.search(r"\bsb\b", d):
        return "aluminio"
    return "desconhecido"


def margin_for_material(material, overrides=None):
    """`overrides`, quando indicado, é o grupo de definições
    material_margins (definições → Preços) — substitui MATERIAL_MARGINS
    sem alterar a deteção do material em si."""
    table = overrides or MATERIAL_MARGINS
    return table.get(material, table.get("desconhecido", MARGIN_UNKNOWN_PCT))


def material_label(material):
    return MATERIAL_LABELS.get(material, "Não identificado")


def _round_half_up(value, ndigits):
    """Arredondamento comercial (0,5 sobe sempre), igual ao do software da
    loja — evita o "round-half-to-even" do round() nativo do Python e as
    armadilhas de binário do float (usa Decimal a partir da representação
    em string do valor)."""
    quantum = Decimal(1).scaleb(-ndigits)
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


# Preço "redondo" ao cliente: em vez de um valor quebrado ao cêntimo
# (703,28 €), o preço de venda sobe sempre para um valor comercial — nunca
# desce, para a margem nunca ficar abaixo da configurada. O múltiplo usado
# cresce com o valor do artigo, para o arredondamento nunca ficar "grosseiro"
# num artigo barato nem "insignificante" num artigo caro:
#   < 100 €        → ao euro inteiro
#   100–500 €      → múltiplos de 5 €
#   500–5 000 €    → múltiplos de 5 €
#   5 000–20 000 € → múltiplos de 10 €
#   ≥ 20 000 €     → múltiplos de 50 €
# (confirmado com o utilizador: 703,28→705,00 · 697,40→700,00 ·
# 1014,66→1015,00 · 2493,12→2495,00 · 4981,90→4985,00 · 10047,81→10050,00 ·
# 24996,15→25000,00)
PRICE_ROUND_TIERS = [(100, 1), (500, 5), (5000, 5), (20000, 10)]
PRICE_ROUND_STEP_ABOVE = 50


def _price_round_step(value, tiers=None, step_above=None):
    for ceiling, step in (tiers or PRICE_ROUND_TIERS):
        if value < ceiling:
            return step
    return PRICE_ROUND_STEP_ABOVE if step_above is None else step_above


def _round_up_to_step(value, step):
    if not value or value <= 0 or step <= 0:
        return value
    step_d = Decimal(str(step))
    units = (Decimal(str(value)) / step_d).to_integral_value(rounding=ROUND_CEILING)
    return float(units * step_d)


def round_commercial(value, tiers=None, step_above=None):
    """Preço redondo ao cliente, escolhendo automaticamente o múltiplo
    conforme o valor (ver PRICE_ROUND_TIERS) — usado tanto no preço de cada
    artigo como, opcionalmente, num total. `tiers`/`step_above`, quando
    indicados, vêm do grupo de definições price_rounding (definições →
    Preços) em vez das constantes por omissão."""
    return _round_up_to_step(value, _price_round_step(value, tiers, step_above))


# Limite teórico da margem para este IVA: quando margem/100 se aproxima de
# 1/(1+IVA) o coeficiente diverge para infinito (preço de venda infinito).
# Nunca se deve pedir margens tão altas na loja; usa-se uma margem folgada
# abaixo do limite para não deixar o cálculo explodir com um valor inválido.
MAX_MARGIN_PCT = round((1 / (1 + IVA_RATE)) * 100 - 1, 1)


def price_coefficient(margin_pct):
    """Coeficiente exato PV_com_IVA = Custo × coeficiente, replicando a
    lógica do software oficial da loja (grupo Les Mousquetaires): a margem
    é definida sobre o preço de venda final (com IVA), não sobre o custo.

        margem = (PV_sem_IVA - Custo) / PV_com_IVA
               = 1/(1+IVA) - Custo/PV_com_IVA

    Resolvendo para o coeficiente (PV_com_IVA = Custo × coeficiente):

        coeficiente = 1 / (1/(1+IVA) - margem)

    Fórmula confirmada ao cêntimo contra os exemplos reais da loja
    (Custo 199,00€ · margem 15% → coef. 1,508 · PV 300,15€; margem 18% →
    coef. 1,580 · PV 314,37€) e contra múltiplos artigos reais da ficha de
    artigo (RYOBI, LAVAT. FLATE 70, DIVERCOL, MDV MESA, etc.).
    """
    denom = (1 / (1 + IVA_RATE)) - (margin_pct / 100.0)
    if denom <= 0:
        raise ValueError(
            f"Margem inválida: {margin_pct}% é demasiado alta para IVA a "
            f"{IVA_RATE * 100:.0f}% (máximo praticável: {MAX_MARGIN_PCT}%).")
    return 1 / denom


def coefficient_for_margin(margin_pct):
    """Coeficiente arredondado a 3 casas — apenas para visualização (campo
    'Coeficiente', nunca editável). O preço final usa sempre o coeficiente
    exato (não o arredondado) para não perder precisão ao cêntimo."""
    return _round_half_up(price_coefficient(margin_pct), 3)


def suggest_client_price(supplier_unit_price, margin_pct=MARGIN_UNKNOWN_PCT,
                          rounding_tiers=None, rounding_step_above=None):
    """Preço de venda ao cliente: PV_com_IVA = Custo / (1/(1+IVA) - margem),
    depois arredondado para cima a um valor comercial (ver
    round_commercial) — nunca um valor quebrado ao cêntimo (ex.:
    703,28 € → 705,00 €). Arredondar para cima nunca deixa a margem final
    abaixo da configurada (só pode ficar igual ou ligeiramente acima).
    `rounding_tiers`/`rounding_step_above`, quando indicados, vêm do grupo
    de definições price_rounding."""
    if not supplier_unit_price or supplier_unit_price <= 0:
        return 0.0
    exact = supplier_unit_price * price_coefficient(margin_pct)
    return round_commercial(exact, rounding_tiers, rounding_step_above)


def _header_field(text, pattern):
    m = re.search(pattern, text)
    return m.group(1).strip() if m else ""


def parse_supplier_pdf(pdf_bytes):
    """Extrai cabeçalho, linhas (com gráfico) e totais de um orçamento BandAluminios."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise ValueError("O ficheiro não é um PDF válido.")
    full_text = "\n".join(page.get_text() for page in doc)

    quote_number = _header_field(full_text, r"Orçamento número:\s*(OR[\s\d/]+\d)")
    if not quote_number or "GRÁFICO" not in full_text:
        raise ValueError("PDF não reconhecido — esperava um orçamento BandAluminios "
                         "com «Orçamento número» e a tabela de caixilhos.")

    # Número da obra: identificador sequencial do PDF, usado tal e qual no
    # assunto do email ao cliente. Se o documento tiver identificadores
    # diferentes (ou nenhum), o assunto fica marcado para revisão manual.
    obra_candidates = list(dict.fromkeys(
        m.strip().rstrip(".,;") for m in re.findall(r"Obra:\s*(\S+)", full_text) if m.strip()))
    header = {
        "quote_number": re.sub(r"\s+", " ", quote_number),
        "date": _header_field(full_text, r"Data:\s*([\d-]+)"),
        "obra": obra_candidates[0] if len(obra_candidates) == 1 else "",
        "obra_candidates": obra_candidates,
        "client_number": _header_field(full_text, r"Nº Cliente:\s*(\d+)"),
        "nif": _header_field(full_text, r"Contribuinte:\s*(\d+)"),
        "phone": _header_field(full_text, r"Telf\.?:\s*(\d+)"),
        "email": _header_field(full_text, r"e-Mail:\s*(\S+@\S+)"),
    }

    items = []
    for page in doc:
        graf = page.search_for("GRÁFICO")
        if not graf:
            continue
        top = graf[0].y1 + 2
        bottom_hits = page.search_for("TOTAL BRUTO") or page.search_for("TOTAL ORÇAMENTO")
        bottom = min(r.y0 for r in bottom_hits) - 2 if bottom_hits else page.rect.y1 - 60

        words = [w for w in page.get_text("words") if top < w[1] < bottom]
        starts = sorted(
            (w[1], int(w[4])) for w in words
            if w[0] < X_NUM_MAX and w[4].isdigit()
        )
        for idx, (y_start, n) in enumerate(starts):
            y_end = starts[idx + 1][0] - 2 if idx + 1 < len(starts) else bottom
            row_words = [w for w in words if y_start - 2 <= w[1] < y_end]

            desc_words = sorted(
                (w for w in row_words if X_DESC_MIN <= w[0] < X_DESC_MAX),
                key=lambda w: (round(w[1]), w[0]))
            desc_lines, current, current_y = [], [], None
            for w in desc_words:
                if current_y is not None and abs(w[1] - current_y) > 3:
                    desc_lines.append(" ".join(current))
                    current = []
                current.append(w[4])
                current_y = w[1]
            if current:
                desc_lines.append(" ".join(current))
            description = "\n".join(desc_lines)

            def _col_value(x_min, x_max):
                vals = [w[4] for w in row_words if x_min <= w[0] < x_max]
                return vals[0] if vals else ""

            qty_raw = _col_value(X_DESC_MAX, X_QTY_MAX)
            medida = _header_field(description, r"Medida \(LxA\):\s*([\d ]+x[\d ]+)")
            item = {
                "n": n,
                "description": description,
                "medida": medida,
                "qty": int(qty_raw) if qty_raw.isdigit() else 1,
                "supplier_unit_price": _parse_pt_number(_col_value(X_QTY_MAX, X_UNIT_MAX)),
                "supplier_total": _parse_pt_number(_col_value(X_UNIT_MAX, X_TOTAL_MAX)),
                "image_b64": "",
                "y_range": (y_start, y_end),
            }
            items.append((page, item))

        # O desenho de cada caixilho (vidro, aros, travessas, seta de abertura)
        # não é uma única imagem: é uma foto de fundo (o "vidro") com o resto
        # traçado por cima em vetor. Extrair só a imagem embutida perdia todo
        # esse traçado e deixava um retângulo liso. Em vez disso, faz-se o
        # rasterizado da própria célula "GRÁFICO" da linha (imagem + vetores,
        # tal como o PDF os desenha) a alta resolução — fica pixel a pixel
        # igual ao que o fornecedor enviou.
        #
        # Para recortar a célula com exatidão (sem cortar o desenho nem
        # arrastar para dentro o traço da grelha da tabela), usa-se as
        # próprias linhas horizontais da grelha como fronteiras — não a
        # posição aproximada do texto. Só quando a grelha não bate certo com
        # o nº de linhas (formato inesperado) é que se recua para a
        # aproximação por texto.
        page_items = [item for pg, item in items if pg is page]
        row_lines = sorted({
            round((seg[1].y + seg[2].y) / 2, 1)
            for d in page.get_drawings() for seg in d["items"]
            if seg[0] == "l" and abs(seg[1].y - seg[2].y) < 0.5
            and min(seg[1].x, seg[2].x) < X_NUM_MAX + 5
            and max(seg[1].x, seg[2].x) > X_TOTAL_MAX - 20
            and top - 5 <= seg[1].y <= bottom + 5
        })
        use_grid = len(row_lines) == len(page_items) + 1
        for idx, item in enumerate(page_items):
            y0, y1 = item["y_range"]
            if use_grid:
                clip_top, clip_bottom = row_lines[idx] + 1, row_lines[idx + 1] - 1
            else:
                clip_top, clip_bottom = y0 + 1, y1 - 1
            clip = fitz.Rect(X_NUM_MAX, clip_top, X_DESC_MIN, clip_bottom)
            if clip.width <= 2 or clip.height <= 2:
                continue
            pix = page.get_pixmap(clip=clip, matrix=GRAPHIC_RENDER_MATRIX)
            item["image_b64"] = base64.b64encode(pix.tobytes("png")).decode()

    parsed_items = []
    for _, item in items:
        item.pop("y_range", None)
        parsed_items.append(item)
    if not parsed_items:
        raise ValueError("Não encontrei linhas de caixilhos na tabela do PDF.")

    totals_text = full_text
    return {
        **header,
        "items": parsed_items,
        "total_bruto": _parse_pt_number(_header_field(totals_text, r"TOTAL BRUTO \(EUR\)\s*\n?\s*([\d.,]+)")),
        "iva": _parse_pt_number(_header_field(totals_text, r"\+\s*23% IVA\s*\n?\s*([\d.,]+)")),
        "total": _parse_pt_number(_header_field(totals_text, r"TOTAL ORÇAMENTO \(EUR\)\s*\n?\s*([\d.,]+)")),
    }


def build_client_pdf(quote, logo_png_bytes):
    """Gera o PDF de venda ao cliente a partir do orçamento importado/editado.

    `quote` é o dicionário guardado em note.supplier_quote: cabeçalho + items
    (cada um com description, qty, client_price, image_b64, include).
    """
    included = [i for i in quote.get("items", []) if i.get("include", True)]
    if not included:
        raise ValueError("Nenhuma linha selecionada para o PDF do cliente.")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=10 * mm, bottomMargin=14 * mm, title=f"Orçamento {quote.get('quote_number', '')}")
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=8.5, leading=10.5)
    small = ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10)
    obs_style = ParagraphStyle("obs", fontName="Helvetica", fontSize=9.5, leading=13)
    story = []

    # Cabeçalho: logótipo à esquerda, caixa com a morada da loja à direita.
    logo = ImageReader(io.BytesIO(logo_png_bytes))
    lw, lh = logo.getSize()
    logo_img = Image(io.BytesIO(logo_png_bytes), width=52 * mm, height=52 * mm * lh / lw)
    address = Table([[Paragraph("<br/>".join(STORE_ADDRESS), body)]], colWidths=[78 * mm])
    address.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    top = Table([[logo_img, "", address]], colWidths=[70 * mm, 22 * mm, 90 * mm])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(top)
    story.append(Spacer(1, 6 * mm))

    info = [f"Orçamento número: {quote.get('quote_number', '')}"]
    line2 = []
    if quote.get("client_number"):
        line2.append(f"Nº Cliente: {quote['client_number']}")
    if quote.get("nif"):
        line2.append(f"Nº Contribuinte: {quote['nif']}")
    if quote.get("phone"):
        line2.append(f"Telf.: {quote['phone']}")
    if quote.get("email"):
        line2.append(f"e-Mail: {quote['email']}")
    if line2:
        info.append("   ".join(line2))
    line3 = []
    if quote.get("date"):
        line3.append(f"Data: {quote['date']}")
    if quote.get("obra"):
        line3.append(f"Obra: {quote['obra']}")
    if quote.get("bricoaval_number"):
        line3.append(f"Nº BricoAval: {quote['bricoaval_number']}")
    if line3:
        info.append("   ".join(line3))
    for ln in info:
        story.append(Paragraph(ln, ParagraphStyle("info", fontName="Helvetica", fontSize=9, leading=12)))
    story.append(Spacer(1, 4 * mm))

    # Tabela de linhas — mesmas colunas do documento do fornecedor.
    col_widths = [10 * mm, 30 * mm, 80 * mm, 14 * mm, 22 * mm, 26 * mm]
    header_style = ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=9.5, textColor=TABLE_BLUE)
    rows = [[Paragraph(h, header_style) for h in ("Nº", "GRÁFICO", "DESCRIÇÃO", "NºUD.", "PVP/UD.", "TOTAL")]]
    total = 0.0
    for item in included:
        price = float(item.get("client_price") or 0)
        qty = int(item.get("qty") or 1)
        line_total = price * qty
        total += line_total
        graphic = ""
        if item.get("image_b64"):
            img_bytes = base64.b64decode(item["image_b64"])
            reader = ImageReader(io.BytesIO(img_bytes))
            iw, ih = reader.getSize()
            width = 24 * mm
            graphic = Image(io.BytesIO(img_bytes), width=width, height=width * ih / iw)
        rows.append([
            Paragraph(str(item.get("n", "")), body),
            graphic,
            Paragraph(item.get("description", "").replace("\n", "<br/>"), body),
            Paragraph(str(qty), body),
            Paragraph(format_pt_price(price), small),
            Paragraph(format_pt_price(line_total), body),
        ])
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, TABLE_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    totals = Table(
        [[Paragraph("TOTAL ORÇAMENTO (EUR)", ParagraphStyle(
            "tot", fontName="Helvetica-Bold", fontSize=9.5, textColor=TABLE_BLUE)),
          Paragraph(format_pt_price(total), ParagraphStyle(
              "totv", fontName="Helvetica-Bold", fontSize=9.5, alignment=2))]],
        colWidths=[110 * mm, 42 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, TABLE_BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(totals)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("OBSERVAÇÕES:", ParagraphStyle(
        "obst", fontName="Helvetica-Bold", fontSize=11, textColor=TABLE_BLUE)))
    story.append(Spacer(1, 2 * mm))
    for obs in OBSERVACOES:
        story.append(Paragraph(obs, obs_style))

    doc.build(story)
    return buf.getvalue()
