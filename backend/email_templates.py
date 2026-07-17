"""Modelos de email previsíveis e independentes da base de dados.

As funções deste módulo são deliberadamente puras: recebem um pedido e devolvem
texto. Assim, o tom pode ser validado sem arrancar FastAPI, MongoDB ou Gmail.
"""

import re
from datetime import datetime
from zoneinfo import ZoneInfo


LISBON = ZoneInfo("Europe/Lisbon")


def business_greeting(now=None):
    """Saudação adequada ao horário comercial em Portugal continental."""
    current = now or datetime.now(LISBON)
    if current.tzinfo is None:
        current = current.replace(tzinfo=LISBON)
    else:
        current = current.astimezone(LISBON)
    return "Bom dia" if current.hour < 13 else "Boa tarde"


def _quantity(note):
    match = re.search(r"\d+", str(note.get("quantity") or ""))
    return int(match.group()) if match else 1


def supplier_quote_template(note, is_reminder=False, now=None):
    """Pedido de cotação no registo habitual do utilizador."""
    greeting = business_greeting(now)
    description = (note.get("description") or "artigo").strip()
    plural = _quantity(note) > 1
    article = "os seguintes artigos" if plural else "o seguinte artigo"

    lines = [f"{greeting} Exmos. Senhores,", ""]
    if is_reminder:
        lines.append("Venho por este meio reforçar o pedido de cotação enviado anteriormente:")
    else:
        lines.append(f"Venho por este meio solicitar um pedido de cotação para {article}:")
    lines += ["", f"Artigo: {description}"]

    product_reference = (note.get("reference") or "").strip()
    if product_reference:
        lines.append(f"Código EAN13: {product_reference}")
    for field, label in (
        ("measurements", "Medidas"),
        ("quantity", "Quantidade"),
        ("color", "Cor / acabamento"),
        ("details", "Observações"),
    ):
        value = str(note.get(field) or "").strip()
        if value:
            lines.append(f"{label}: {value}")

    lines += [
        "",
        "Com os melhores cumprimentos,",
        "Tiago Jesus",
        "Bricomarché Faro",
    ]
    prefix = "Lembrete · " if is_reminder else ""
    subject = f"{prefix}Pedido de cotação — {description}"
    return {"subject": subject, "body": "\n".join(lines)}


def client_quote_template(note, now=None):
    """Mensagem para acompanhar o PDF do orçamento enviado ao cliente."""
    greeting = business_greeting(now)
    description = (note.get("description") or "artigo solicitado").strip()
    subject = f"Orçamento solicitado — {description}"
    body = "\n".join([
        f"{greeting} caro cliente,",
        "",
        "Segue em anexo o orçamento solicitado para a sua apreciação.",
        "",
        "Fico a aguardar a sua confirmação ou qualquer questão adicional.",
        "",
        "Informo que o valor apresentado já inclui IVA.",
        "O prazo de entrega encontra-se indicado no orçamento em anexo.",
        "",
        "Com os melhores cumprimentos,",
        "Tiago Jesus",
        "Bricomarché Faro",
    ])
    return {"subject": subject, "body": body}
