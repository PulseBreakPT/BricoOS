"""Normalização e resumos do esquema de caixilharia v2.

Um pedido contém elementos (vãos) independentes. Cada elemento partilha produto
e medidas, mas pode ter várias opções de fabrico para comparação de preço.
"""

import uuid


OPTION_FIELDS = (
    "familia", "sistema", "material", "material_ref", "cor_aro", "cor_folha",
    "fechadura", "muletas", "estore", "quadricula", "quadricula_cor", "observacoes",
)

LEGACY_OPENING_TYPES = {
    "De correr": "correr", "Oscilo-batente": "oscilo_batente",
    "Basculante": "basculante", "Fixa": "fixa",
}


def _identifier(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _option(raw):
    return {
        "id": raw.get("id") or _identifier("opt"),
        **{field: raw.get(field, "") or "" for field in OPTION_FIELDS},
    }


def _line(raw):
    options = raw.get("opcoes") or []
    direction = raw.get("sentido_abertura", "") or ""
    opening_type = raw.get("tipo_abertura", "") or ""
    if not opening_type and direction in LEGACY_OPENING_TYPES:
        opening_type = LEGACY_OPENING_TYPES[direction]
        direction = ""
    leaves = raw.get("numero_folhas")
    return {
        "id": raw.get("id") or _identifier("elem"),
        "nome": raw.get("nome", "") or "",
        "produto": raw.get("produto", "janela") or "janela",
        "quantidade": int(raw.get("quantidade") or 1),
        "largura_mm": int(raw.get("largura_mm") or 0),
        "altura_mm": int(raw.get("altura_mm") or 0),
        "unidade_entrada": raw.get("unidade_entrada") if raw.get("unidade_entrada") in ("mm", "cm") else "mm",
        "tipo_abertura": opening_type,
        "numero_folhas": int(leaves) if str(leaves or "").isdigit() else None,
        "sentido_abertura": direction,
        "opcoes": [_option(option) for option in options],
        "observacoes": raw.get("observacoes", "") or "",
    }


def normalize_caixilharia_spec(raw):
    """Converte tanto o esquema antigo como o v2 na representação canónica."""
    raw = raw or {}
    if raw.get("linhas"):
        lines = [_line(line) for line in raw["linhas"]]
    else:
        legacy_option = {field: raw.get(field, "") or "" for field in OPTION_FIELDS}
        lines = []
        for item in raw.get("itens") or []:
            lines.append(_line({
                "produto": raw.get("produto", "janela"),
                "quantidade": item.get("quantidade", 1),
                "largura_mm": item.get("largura_mm", 0),
                "altura_mm": item.get("altura_mm", 0),
                "unidade_entrada": "mm",
                "sentido_abertura": item.get("sentido_abertura", ""),
                "opcoes": [legacy_option],
            }))

    return {
        "schema_version": 2,
        "tipo_pedido": raw.get("tipo_pedido", "orcamento") or "orcamento",
        "linhas": lines,
        "observacoes": raw.get("observacoes", "") or "",
        "data_entrega": raw.get("data_entrega", "") or "",
    }


def _plural_product(label, count):
    if count == 1:
        return label
    plurals = {
        "Janela": "Janelas", "Porta": "Portas", "Portada": "Portadas",
        "Rede mosquiteira": "Redes mosquiteiras",
    }
    return plurals.get(label, f"{label}s")


def caixilharia_summary(raw, products, families):
    spec = normalize_caixilharia_spec(raw)
    lines = spec["linhas"]
    product_counts = {}
    family_labels = []
    system_labels = []
    line_summaries = []

    for line in lines:
        product = products.get(line["produto"], line["produto"])
        product_counts[product] = product_counts.get(product, 0) + line["quantidade"]
        options = []
        for option in line["opcoes"]:
            family = families.get(option["familia"], {})
            family_label = family.get("label", option["familia"])
            system_label = (family.get("sistemas") or {}).get(option["sistema"], option["sistema"])
            if family_label and family_label not in family_labels:
                family_labels.append(family_label)
            if system_label and system_label not in system_labels:
                system_labels.append(system_label)
            options.append({
                "id": option["id"], "familia": family_label, "sistema": system_label,
                "label": " — ".join(v for v in (family_label, system_label) if v),
            })
        line_summaries.append({
            "id": line["id"], "nome": line["nome"], "produto": product,
            "quantidade": line["quantidade"], "largura_mm": line["largura_mm"],
            "altura_mm": line["altura_mm"], "unidade_entrada": line["unidade_entrada"],
            "tipo_abertura": line["tipo_abertura"], "numero_folhas": line["numero_folhas"],
            "sentido_abertura": line["sentido_abertura"],
            "opcoes": options,
        })

    product_label = " + ".join(
        f"{count} {_plural_product(label, count)}" for label, count in product_counts.items()
    ) or "Caixilharia"
    total = sum(line["quantidade"] for line in lines)
    option_count = sum(len(line["opcoes"]) for line in lines)
    comparison_count = sum(1 for line in lines if len(line["opcoes"]) > 1)
    return {
        "produto": product_label,
        "familia": " + ".join(family_labels),
        "sistema": " + ".join(system_labels),
        "total_un": total,
        "element_count": len(lines),
        "option_count": option_count,
        "comparison_count": comparison_count,
        "lines": line_summaries,
    }


def _centimetres(mm):
    value = mm / 10
    return str(int(value)) if value.is_integer() else f"{value:.1f}".replace(".", ",")


def caixilharia_email_lines(
    raw, products, families, materials=None, locks=None, handles=None, shutters=None,
    models=None, opening_types=None, quadrilles=None, warning="",
):
    """Renderiza a secção variável do email e devolve também o resumo."""
    materials = materials or {}
    locks = locks or {}
    handles = handles or {}
    shutters = shutters or {}
    models = models or {}
    opening_types = opening_types or {}
    quadrilles = quadrilles or {}
    spec = normalize_caixilharia_spec(raw)
    display = caixilharia_summary(spec, products, families)
    lines = [f"Elementos ({display['total_un']} un no total):"]
    if warning:
        lines.append(f"({warning})")
    lines.append("")

    for line_index, line in enumerate(spec["linhas"], 1):
        product = products.get(line["produto"], line["produto"])
        name = f" · {line['nome']}" if line.get("nome") else ""
        row = (f"{line_index}. {product}{name} — {line['quantidade']} un — "
               f"{line['largura_mm']} x {line['altura_mm']} mm "
               f"({_centimetres(line['largura_mm'])} x {_centimetres(line['altura_mm'])} cm; L x A)")
        if line.get("tipo_abertura"):
            row += f" — Tipo: {opening_types.get(line['tipo_abertura'], line['tipo_abertura'])}"
        if line.get("numero_folhas"):
            row += f" — {line['numero_folhas']} folha(s)"
        if line.get("sentido_abertura"):
            row += f" — Lado: {line['sentido_abertura']}"
        lines.append(row)
        if len(line["opcoes"]) > 1:
            lines.append("   Cotar separadamente as seguintes opções:")
        for option_index, option in enumerate(line["opcoes"], 1):
            family = families.get(option["familia"], {})
            family_label = family.get("label", option["familia"])
            system_label = (family.get("sistemas") or {}).get(option["sistema"], option["sistema"])
            option_label = chr(64 + option_index) if option_index <= 26 else str(option_index)
            lines.append(f"   Opção {option_label}: {family_label} — {system_label}")
            model = models.get(option["sistema"])
            if model:
                lines.append(f"     Modelo: {model['name']} · {model['category_label']}")
                lines.append(f"     Descrição: {model['description']}")
                reference = []
                if model.get("leaves"):
                    reference.append(f"{min(model['leaves'])}–{max(model['leaves'])} folhas")
                if model.get("glass_limit_mm"):
                    reference.append(f"vidro até {model['glass_limit_mm']} mm")
                if reference:
                    lines.append(f"     Caracterização de referência: {' · '.join(reference)}")
                classifications = " · ".join(
                    f"{key}: {value}" for key, value in model.get("classification", {}).items()
                )
                if classifications:
                    lines.append(f"     Classificação publicada (ensaio/configuração de referência): {classifications}")
            if option.get("material"):
                material = materials.get(option["material"], option["material"])
                material_ref = f" (Ref.: {option['material_ref']})" if option.get("material_ref") else ""
                lines.append(f"     Vidro / painéis: {material}{material_ref}")
            if option.get("quadricula"):
                quadrille = quadrilles.get(option["quadricula"], option["quadricula"])
                color = f" · Cor: {option['quadricula_cor']}" if option.get("quadricula_cor") else ""
                lines.append(f"     Quadrícula: {quadrille}{color}")
            if option.get("cor_aro") or option.get("cor_folha"):
                lines.append(f"     Perfil / cor: Aro: {option.get('cor_aro') or '—'} · Folha: {option.get('cor_folha') or '—'}")
            if option.get("fechadura"):
                lines.append(f"     Fechadura: {locks.get(option['fechadura'], option['fechadura'])}")
            if option.get("muletas"):
                lines.append(f"     Muletas: {handles.get(option['muletas'], option['muletas'])}")
            if option.get("estore"):
                lines.append(f"     Estore: {shutters.get(option['estore'], option['estore'])}")
            if option.get("observacoes"):
                lines.append(f"     Observações da opção: {option['observacoes']}")
        if line.get("observacoes"):
            lines.append(f"   Observações do elemento: {line['observacoes']}")
        lines.append("")
    if display["comparison_count"]:
        lines += [
            "Nota: nos elementos com várias opções, agradeço valores separados por opção para permitir a comparação.",
            "",
        ]
    if any(models.get(option.get("sistema")) for line in spec["linhas"] for option in line["opcoes"]):
        lines += [
            "Nota técnica: as classificações acima são referências publicadas para configurações ensaiadas; "
            "agradeço confirmação dos valores aplicáveis às medidas e composição pedidas.",
            "",
        ]
    return lines, display
