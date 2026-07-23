"""Padrões de extração partilhados entre correio_semanal.py e
anexos_edicao.py — datas, referências, EAN/ITM, preços, descontos,
contactos, locais, links e documentos associados. A mesma função serve
texto de PDF (Correio Semanal, dossiers, planogramas) e o texto/cabeçalhos
de uma folha Excel, para não haver duas versões da mesma deteção."""

import re

_EAN_RE = re.compile(r"\bEAN\s*[:#]?\s*(\d{8,13})\b", re.IGNORECASE)
_ITM_RE = re.compile(r"\b(?:ITM|ITEM|C[oó]d(?:igo)?\.?)\s*[:#]?\s*(\d{4,10})\b", re.IGNORECASE)
_PRICE_RE = re.compile(r"(?:€|EUR)\s*(\d+[.,]\d{2})|(\d+[.,]\d{2})\s*(?:€|EUR)", re.IGNORECASE)
_DISCOUNT_RE = re.compile(
    r"(desconto|rappel|reducao|rabais|remise)[^\d%]{0,20}(\d{1,3}(?:[.,]\d+)?)\s*%"
    r"|(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:de\s+)?(desconto|rappel)",
    re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"\b(?:\+351\s?)?2\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b")
_URL_RE = re.compile(r"https?://[^\s,;)\]]+")
_LOCATION_RE = re.compile(
    r"\b((?i:loja|pdv|armazem|direcao regional|centro de distribuicao|entreposto))"
    r"\s+([A-ZÀ-Ú][\wÀ-ú\-]*(?:\s+[A-ZÀ-Ú][\wÀ-ú\-]*){0,2})")
_ASSOC_DOC_RE = re.compile(
    r"\b(ver\s+anexo\s*[\w.\-]*|doc\.?\s*n[ºo°]?\s*[\w./\-]+|processo\s*n[ºo°]?\s*[\w./\-]+|"
    r"refer[eê]ncia\s*[:#]?\s*[\w./\-]+)",
    re.IGNORECASE)
_REF_CODE_RE = re.compile(
    r"\b(?:ref(?:er[eê]ncia)?\.?)\s*[:#]\s*([\w./\-]{3,20})\b", re.IGNORECASE)


def _dedup(items):
    seen, out = set(), []
    for it in items:
        cleaned = it.strip().rstrip(".,;:")
        key = cleaned.lower()
        if key and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out


def extract_facts(text):
    """Devolve um dicionário só com os campos que encontrar algo — nunca
    inventa chaves vazias, para não sujar o resultado com listas vazias em
    todos os documentos. Cada valor é uma lista já sem duplicados."""
    if not text:
        return {}
    out = {}
    ean = _dedup(_EAN_RE.findall(text))
    if ean:
        out["ean"] = ean
    itm = _dedup(_ITM_RE.findall(text))
    if itm:
        out["itm"] = itm
    precos = _dedup(a or b for a, b in _PRICE_RE.findall(text))
    if precos:
        out["precos"] = precos
    descontos = []
    for m in _DISCOUNT_RE.finditer(text):
        pct = m.group(2) or m.group(3)
        if pct:
            descontos.append(f"{pct}%")
    descontos = _dedup(descontos)
    if descontos:
        out["descontos"] = descontos
    contactos_email = _dedup(_EMAIL_RE.findall(text))
    contactos_tel = _dedup(_PHONE_RE.findall(text))
    if contactos_email or contactos_tel:
        out["contactos"] = contactos_email + contactos_tel
    links = _dedup(_URL_RE.findall(text))
    if links:
        out["links"] = links
    locais = _dedup(f"{a.strip()} {b.strip()}" for a, b in _LOCATION_RE.findall(text))
    if locais:
        out["locais"] = locais
    docs_associados = _dedup(_ASSOC_DOC_RE.findall(text))
    if docs_associados:
        out["documentos_associados"] = docs_associados
    referencias = _dedup(_REF_CODE_RE.findall(text))
    if referencias:
        out["referencias"] = referencias
    return out
