"""Centro de Validação Automática do orçamento do fornecedor.

Sempre em cima do dicionário devolvido por `quote_pdf.parse_supplier_pdf`
(ou do `supplier_quote` já guardado no pedido, que tem os mesmos campos
mais os de preço):

- `build_quality_report`: confere se a leitura do PDF está completa e
  coerente (imagens, preços, descrições, medidas, numeração, totais) —
  cada verificação é "ok", "warning" (informativo, não bloqueia) ou
  "error" (algo que quase de certeza precisa de correção manual).
- `confidence_score`: resume esse relatório num número (0-100).
- `duplicate_medidas`: artigos com a mesma medida no mesmo orçamento.
- `diff_quote_versions`: compara duas versões dos itens do mesmo
  orçamento (reimportação de um PDF corrigido) e assinala artigos
  adicionados, removidos ou alterados.
- `detect_urgency_signals`: deteção simples por palavras-chave no texto
  do pedido/orçamento.

Nada aqui decide sozinho enviar, bloquear ou mudar prioridades — só
produz informação para a pessoa decidir, tal como o resto da app.
"""

import unicodedata

_PRICE_TOLERANCE = 0.005
_TOTAL_TOLERANCE = 0.05


def _check(checks, id_, label, ok, detail="", severity="error"):
    checks.append({
        "id": id_, "label": label,
        "status": "ok" if ok else severity,
        "detail": detail if not ok else "",
    })


def build_quality_report(quote):
    """`quote` é o dicionário de `parse_supplier_pdf` (ou um supplier_quote
    guardado, que tem os mesmos campos). Devolve
    {"status": "ok"|"warning"|"error", "checks": [...]}."""
    checks = []
    items = quote.get("items") or []

    _check(checks, "items_present", "Linhas de artigos encontradas", bool(items),
           "Nenhuma linha de caixilho foi lida do PDF.", "error")

    if items:
        missing_images = [i.get("n") for i in items if not i.get("image_b64")]
        _check(checks, "images", "Imagens dos artigos extraídas", not missing_images,
               f"Falta a imagem do(s) artigo(s) nº {', '.join(map(str, missing_images))}.",
               "warning")

        missing_price = [i.get("n") for i in items if not i.get("supplier_unit_price")]
        _check(checks, "prices", "Preços de custo lidos", not missing_price,
               f"Falta o preço no(s) artigo(s) nº {', '.join(map(str, missing_price))}.",
               "error")

        missing_desc = [i.get("n") for i in items if not (i.get("description") or "").strip()]
        _check(checks, "descriptions", "Descrições lidas", not missing_desc,
               f"Falta a descrição no(s) artigo(s) nº {', '.join(map(str, missing_desc))}.",
               "error")

        missing_medida = [i.get("n") for i in items if not (i.get("medida") or "").strip()]
        _check(checks, "medidas", "Medidas (LxA) identificadas", not missing_medida,
               f"Falta a medida no(s) artigo(s) nº {', '.join(map(str, missing_medida))}.",
               "warning")

        ns = sorted(i.get("n") for i in items if i.get("n") is not None)
        expected = list(range(1, len(items) + 1))
        _check(checks, "sequence", "Numeração dos artigos sem falhas", ns == expected,
               f"Numeração inesperada ({ns}) — esperava-se 1 a {len(items)} seguidos.",
               "warning")

        total_bruto = quote.get("total_bruto")
        if total_bruto is not None:
            sum_items = sum((i.get("supplier_total") or 0) for i in items)
            totals_ok = abs(total_bruto - sum_items) < _TOTAL_TOLERANCE
            _check(checks, "totals_match", "Total do fornecedor confere com a soma das linhas", totals_ok,
                   f"TOTAL BRUTO do PDF ({total_bruto:.2f} €) não bate com a soma das linhas "
                   f"({sum_items:.2f} €).", "warning")

    _check(checks, "quote_number", "Número de orçamento identificado", bool(quote.get("quote_number")),
           "Não foi possível ler o número do orçamento.", "error")

    statuses = [c["status"] for c in checks]
    overall = "error" if "error" in statuses else ("warning" if "warning" in statuses else "ok")
    return {"status": overall, "checks": checks}


_SEVERITY_SCORE = {"ok": 1.0, "warning": 0.5, "error": 0.0}


def confidence_score(quality_report):
    """Resume o quality_report num número (0-100) para ordenar ou destacar
    orçamentos que precisam de mais atenção sem ter de ler a check-list
    inteira. Um "error" pesa o dobro de um "warning" (ex.: falta o preço
    de um artigo é mais grave do que faltar a medida)."""
    checks = quality_report.get("checks") or []
    if not checks:
        return 0
    total = sum(_SEVERITY_SCORE.get(c["status"], 0) for c in checks)
    return round(total / len(checks) * 100)


def duplicate_medidas(items):
    """Artigos com a mesma medida (LxA) dentro do mesmo orçamento. Não é
    necessariamente um erro — o cliente pode querer duas janelas iguais —
    mas vale a pena confirmar que não é um artigo duplicado por engano."""
    by_medida = {}
    for i in items or []:
        m = (i.get("medida") or "").strip()
        if not m:
            continue
        by_medida.setdefault(m, []).append(i.get("n"))
    return [{"medida": m, "items": ns} for m, ns in by_medida.items() if len(ns) > 1]


_DIFF_FIELDS = (
    ("qty", "quantidade"),
    ("supplier_unit_price", "preço de custo"),
    ("medida", "medida"),
    ("description", "descrição"),
)


def _first_line(text):
    return (text or "").strip().split("\n")[0]


def diff_quote_versions(old_items, new_items):
    """Compara os itens de duas versões do mesmo orçamento (reimportação de
    um PDF corrigido pelo fornecedor). Junta por número de linha (nº) — é o
    identificador estável entre reenvios do mesmo orçamento."""
    old_by_n = {i.get("n"): i for i in (old_items or [])}
    new_by_n = {i.get("n"): i for i in (new_items or [])}

    added, removed, changed = [], [], []
    for n, ni in new_by_n.items():
        oi = old_by_n.get(n)
        if oi is None:
            added.append({"n": n, "description": _first_line(ni.get("description"))})
            continue
        fields = {}
        for field, label in _DIFF_FIELDS:
            ov, nv = oi.get(field), ni.get(field)
            if field == "description":
                ov, nv = _first_line(ov), _first_line(nv)
                if ov != nv:
                    fields[field] = {"label": label, "old": ov, "new": nv}
            elif field == "supplier_unit_price":
                if (ov is None) != (nv is None) or (
                        ov is not None and nv is not None and abs(ov - nv) > _PRICE_TOLERANCE):
                    fields[field] = {"label": label, "old": ov, "new": nv}
            elif ov != nv:
                fields[field] = {"label": label, "old": ov, "new": nv}
        if fields:
            changed.append({"n": n, "description": _first_line(ni.get("description")), "fields": fields})

    for n, oi in old_by_n.items():
        if n not in new_by_n:
            removed.append({"n": n, "description": _first_line(oi.get("description"))})

    return {"added": added, "removed": removed, "changed": changed,
            "has_changes": bool(added or removed or changed)}


def diff_summary_text(diff):
    parts = []
    if diff.get("added"):
        parts.append(f"{len(diff['added'])} artigo(s) adicionado(s)")
    if diff.get("removed"):
        parts.append(f"{len(diff['removed'])} artigo(s) removido(s)")
    if diff.get("changed"):
        parts.append(f"{len(diff['changed'])} artigo(s) alterado(s)")
    if not parts:
        return "Orçamento do fornecedor reimportado sem alterações nos artigos."
    return "Orçamento do fornecedor alterado desde a versão anterior: " + ", ".join(parts) + "."


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


_URGENCY_KEYWORDS = (
    "urgente", "urgencia", "para ontem", "o mais rapido possivel",
    "o quanto antes", "com urgencia", "extrema urgencia",
)


def detect_urgency_signals(*texts):
    """Deteção simples por palavras-chave no texto do pedido/orçamento —
    nunca muda a prioridade sozinha, só assinala para uma pessoa confirmar
    (ver _apply_supplier_pdf em server.py, que só acrescenta uma etiqueta
    e regista na cronologia)."""
    combined = _fold(" ".join(t for t in texts if t))
    return [kw for kw in _URGENCY_KEYWORDS if kw in combined]
