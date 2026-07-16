"""Motor auditável de análise técnica do catálogo BandAlumínios.

Este módulo nunca transforma ausência, conflito ou uma classe histórica numa
estimativa. As pontuações são índices Brico2 transparentes, não certificações.
"""

from __future__ import annotations

from copy import deepcopy
from itertools import combinations
from urllib.parse import urlparse

try:
    from bandaluminios_catalog import (
        MANUFACTURER_SOURCES,
        MODEL_EVIDENCE,
        MODELS,
        QUADRILLE_INFO,
        SOURCE_CONFLICTS,
    )
except ImportError:  # pragma: no cover - caminho usado ao importar como package
    from .bandaluminios_catalog import (
        MANUFACTURER_SOURCES,
        MODEL_EVIDENCE,
        MODELS,
        QUADRILLE_INFO,
        SOURCE_CONFLICTS,
    )


MISSING = "Dados não encontrados em fontes oficiais."
METHOD_VERSION = "Brico2 Technical Overall 1.0"
OFFICIAL_SOURCE_HOSTS = {
    "www.bandaluminios.com",
    "www.rehau.com",
    "www.ift-rosenheim.de",
    "knowledge.bsigroup.com",
    "www.dinmedia.de",
    "www.iso.org",
    "www.vdi.de",
    "eur-lex.europa.eu",
    "single-market-economy.ec.europa.eu",
}


def is_official_source(url):
    """Política fechada: uma fonte fora destes organismos nunca suporta score."""
    if not url:
        return False
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in OFFICIAL_SOURCE_HOSTS


STANDARDS = {
    "air": {
        "name": "EN 12207:2016",
        "test": "EN 1026",
        "status": "Atual; substitui a edição EN 12207:1999.",
        "scale": "Classes 1 a 4; a classe 4 tem a menor permeabilidade de referência. Classe 0 significa não ensaiado.",
        "best": "Classe 4 (classe numerada máxima).",
        "source_url": "https://www.ift-rosenheim.de/pruefung-luftdurchlaessigkeit-fenster-tueren",
        "registry_url": "https://www.dinmedia.de/en/standard/din-en-12207/255255888",
    },
    "water": {
        "name": "EN 12208:1999",
        "test": "EN 1027",
        "status": "Atual / em revisão no registo BSI.",
        "scale": "1A–9A para instalação não protegida; 1B–7B para protegida; Exxx acima de 600 Pa.",
        "best": "Não existe máximo fechado: Exxx pode superar 9A.",
        "source_url": "https://www.ift-rosenheim.de/pruefung-schlagregendichtheit-fenster-tueren",
        "registry_url": "https://knowledge.bsigroup.com/products/windows-and-doors-watertightness-classification",
    },
    "wind": {
        "name": "EN 12210:2016",
        "test": "EN 12211:2016",
        "status": "Atual; substitui EN 12210:1999.",
        "scale": "Pressão 1–5 ou Exxxx, combinada com deflexão A (<L/150), B (<L/200) ou C (<L/300).",
        "best": "Não existe máximo fechado por causa da classe E; entre as classes ordinárias, C5 domina A/B1–5.",
        "source_url": "https://www.ift-rosenheim.de/pruefung-widerstand-gegen-windlast-fenster-tueren",
        "registry_url": "https://knowledge.bsigroup.com/products/windows-and-doors-resistance-to-wind-load-classification",
    },
    "thermal": {
        "name": "EN ISO 10077-1:2017",
        "test": "EN ISO 10077-2:2017+A1:2025 para perfis",
        "status": "Atual.",
        "scale": "Uw mede o vão completo, Uf o aro e Ug o vidro, em W/(m²K); menor transmitância significa menor fluxo térmico.",
        "best": "A norma não define um valor máximo/mínimo universal nem uma escala 0–100.",
        "source_url": "https://www.iso.org/standard/67090.html",
        "registry_url": "https://knowledge.bsigroup.com/products/thermal-performance-of-windows-doors-and-shutters-calculation-of-thermal-transmittance-general",
    },
    "glass_thermal": {
        "name": "EN 673:2011 (transição para EN 673:2024)",
        "status": "O BSI indica que EN 673:2011 deve continuar a ser usada até a revisão correlacionada de EN 410 ficar aplicável.",
        "scale": "Ug é a transmitância térmica do centro do vidro.",
        "best": "Sem escala 0–100 oficial.",
        "source_url": "https://knowledge.bsigroup.com/products/glass-in-building-determination-of-thermal-transmittance-u-value-calculation-method-2",
    },
    "acoustic": {
        "name": "EN ISO 717-1:2020",
        "test": "EN ISO 10140-2:2021",
        "status": "Atual; ISO 717-1:2020 foi confirmada em 2026.",
        "scale": "Rw é um índice único em dB obtido a partir de medições por bandas; valores superiores indicam maior redução sonora.",
        "best": "A norma não define um máximo universal nem uma escala 0–100.",
        "source_url": "https://www.iso.org/standard/77435.html",
        "registry_url": "https://knowledge.bsigroup.com/products/acoustics-laboratory-measurement-of-sound-insulation-of-building-elements-measurement-of-airborne-sound-insulation-1",
    },
    "security": {
        "name": "EN 1627:2021",
        "test": "EN 1628, EN 1629 e EN 1630",
        "status": "Atual; substitui EN 1627:2011.",
        "scale": "Classes de resistência antirroubo RC1 a RC6.",
        "best": "RC6 (classe máxima da escala).",
        "source_url": "https://www.ift-rosenheim.de/pruefung-einbruchhemmung-von-bauteilen-din-en-1627",
        "registry_url": "https://knowledge.bsigroup.com/products/pedestrian-doorsets-windows-curtain-walling-grilles-and-shutters-burglar-resistance-requirements-and-classification-1",
    },
    "pvc_profiles": {
        "name": "EN 12608-1:2016+A1:2020",
        "status": "Atual / em revisão.",
        "scale": "Classifica e ensaia perfis PVC-U; uma classe de espessura de parede não é, isoladamente, um Overall do vão.",
        "best": "Sem escala global única.",
        "source_url": "https://knowledge.bsigroup.com/products/unplasticized-polyvinyl-chloride-pvc-u-profiles-for-the-fabrication-of-windows-and-doors-classification-requirements-and-test-methods-non-coated-pvc-u-profiles-with-light-coloured-surfaces",
    },
    "thermal_break": {
        "name": "EN 14024:2023",
        "status": "Atual; substitui EN 14024:2004.",
        "scale": "Avalia o desempenho mecânico de perfis metálicos com barreira térmica.",
        "best": "Não transforma a largura da poliamida numa escala universal de qualidade.",
        "source_url": "https://knowledge.bsigroup.com/products/metal-profiles-with-thermal-barrier-mechanical-performance-requirements-proof-and-tests-for-assessment-1",
    },
    "product_ce": {
        "name": "EN 14351-1:2006+A2:2016 + Regulamento (UE) 2024/3110",
        "status": "A referência harmonizada EN 14351-1 mantém rastreabilidade; o novo Regulamento dos Produtos de Construção aplica-se desde 8-01-2026.",
        "scale": "A marcação CE acompanha uma declaração de desempenho/conformidade; não é uma nota de qualidade.",
        "best": "Sem escala 0–100.",
        "source_url": "https://single-market-economy.ec.europa.eu/sectors/construction/construction-products-regulation-cpr/declaration-performance-and-ce-marking_en",
        "registry_url": "https://eur-lex.europa.eu/eli/reg/2024/3110/oj/",
    },
    "legacy_din": {
        "name": "DIN 18055:1981-10",
        "status": "Retirada. As classificações de ar/água/vento foram substituídas, entre outras, por EN 12207, EN 12208 e EN 12210; DIN 18055:2020 trata critérios de aplicação.",
        "scale": "As classes históricas não são convertidas sem tabela oficial de correspondência aplicável ao ensaio.",
        "best": "Não aplicável à classificação atual.",
        "source_url": "https://www.dinmedia.de/en/standard/din-18055/924481",
        "current_url": "https://www.dinmedia.de/de/norm/din-18055/321515051",
    },
    "vdi_acoustic": {
        "name": "VDI 2719:1987-08",
        "status": "Regra técnica ainda listada como atual; existe um projeto de revisão previsto para 2026. Não é declarada como substituída por ISO 717-1.",
        "scale": "Classes acústicas de janela; não são fundidas automaticamente com Rw em dB sem a configuração e método completos.",
        "best": "Não usada para converter os valores Band em notas sem documentação adicional.",
        "source_url": "https://www.vdi.de/en/home/vdi-standards/details/vdi-2719-sound-isolation-of-windows-and-their-auxiliary-equipment",
    },
}


FEATURES = {
    "air": {"label": "Permeabilidade ao ar", "weight": 15, "core": True},
    "water": {"label": "Estanquidade à água", "weight": 15, "core": True},
    "wind": {"label": "Resistência ao vento", "weight": 15, "core": True},
    "thermal": {"label": "Isolamento térmico", "weight": 25, "core": True},
    "acoustic": {"label": "Desempenho acústico", "weight": 15, "core": True},
    "security": {"label": "Segurança", "weight": 6, "core": False},
    "energy": {"label": "Eficiência / poupança energética", "weight": 5, "core": False},
    "durability": {"label": "Durabilidade", "weight": 4, "core": False},
    "structural": {"label": "Resistência estrutural independente", "weight": 0, "core": False},
    "glass": {"label": "Vidro compatível", "weight": 0, "core": False},
    "frame_depth": {"label": "Profundidade do aro", "weight": 0, "core": False},
    "thermal_break": {"label": "Rutura térmica", "weight": 0, "core": False},
    "material": {"label": "Material", "weight": 0, "core": False},
    "ce": {"label": "Marcação CE / declaração", "weight": 0, "core": False},
}


CATEGORY_BANDS = [
    (95, "SSS"), (90, "SS"), (85, "S"), (75, "A"),
    (65, "B"), (50, "C"), (0, "D"),
]


def _round(value):
    return round(float(value), 1)


def _source(label, url, source_type):
    return {"label": label, "url": url, "type": source_type}


def _base_feature(key, model):
    info = FEATURES[key]
    feature = {
        "key": key,
        "label": info["label"],
        "weight": info["weight"],
        "core": info["core"],
        "status": "missing",
        "value": MISSING,
        "score": None,
        "score_kind": None,
        "overall_eligible": False,
        "standard": None,
        "official_scale": None,
        "official_best": None,
        "formula": None,
        "explanation": MISSING,
        "sources": [],
    }
    if model.get("source_url"):
        feature["sources"].append(_source(f"BandAlumínios · {model['name']}", model["source_url"], "product"))
    return feature


def _apply_standard(feature, standard_key):
    standard = STANDARDS[standard_key]
    feature.update({
        "standard": standard["name"],
        "standard_status": standard["status"],
        "official_scale": standard["scale"],
        "official_best": standard["best"],
    })
    feature["sources"].append(_source(standard["name"], standard["source_url"], "standard"))
    if standard.get("registry_url"):
        feature["sources"].append(_source(f"Registo · {standard['name']}", standard["registry_url"], "registry"))
    return feature


def _air_feature(model, evidence):
    feature = _apply_standard(_base_feature("air", model), "air")
    if not evidence:
        return feature
    status = evidence.get("status")
    if status == "conflict":
        feature.update({
            "status": "conflict", "value": evidence.get("display", MISSING),
            "explanation": evidence.get("note", MISSING),
        })
        return feature
    if status == "legacy_unmapped":
        feature = _apply_standard(feature, "legacy_din")
        feature.update({
            "status": "legacy_unmapped", "value": f"Classe {evidence.get('class')} · DIN 18055",
            "explanation": evidence.get("note", MISSING),
        })
        return feature
    value = evidence.get("class")
    if status != "verified" or not isinstance(value, int) or not 1 <= value <= 4:
        return feature
    score = _round(value / 4 * 100)
    feature.update({
        "status": "scored", "value": f"Classe {value}", "score": score,
        "score_kind": "normalizacao_escala_oficial", "overall_eligible": True,
        "formula": f"{value} ÷ 4 × 100 = {score}",
        "explanation": (
            f"Classe {value} na escala EN 12207. A nota Brico2 normaliza linearmente a classe declarada "
            "pela classe numerada máxima 4; não altera nem substitui a classe oficial."
        ),
    })
    return feature


def _water_feature(model, evidence):
    feature = _apply_standard(_base_feature("water", model), "water")
    if not evidence:
        return feature
    if evidence.get("status") == "legacy_unmapped":
        feature = _apply_standard(feature, "legacy_din")
        feature.update({
            "status": "legacy_unmapped", "value": f"Classe {evidence.get('class')} · DIN 18055",
            "explanation": evidence.get("note", MISSING),
        })
        return feature
    pressure = evidence.get("pressure_pa")
    if evidence.get("status") != "verified" or not isinstance(pressure, (int, float)):
        return feature
    score = _round(min(pressure / 600 * 100, 100))
    feature.update({
        "status": "scored", "value": f"Classe {evidence['class']} · {pressure:g} Pa",
        "score": score, "score_kind": "normalizacao_pressao_9a", "overall_eligible": True,
        "raw_value": pressure, "raw_unit": "Pa", "better_direction": "higher",
        "formula": f"min({pressure:g} ÷ 600 × 100, 100) = {score}",
        "explanation": (
            "A nota usa a pressão oficial da classe e 600 Pa, correspondente a 9A, como referência 100. "
            "Não declara 9A como máximo absoluto: classes Exxx podem ultrapassar 600 Pa."
        ),
    })
    return feature


def _wind_feature(model, evidence):
    feature = _apply_standard(_base_feature("wind", model), "wind")
    if not evidence or evidence.get("status") != "verified":
        return feature
    pressure_classes = evidence.get("pressure_classes") or [evidence.get("pressure_class")]
    deflection_classes = evidence.get("deflection_classes") or [evidence.get("deflection_class")]
    pairs = [(p, d) for p, d in zip(pressure_classes, deflection_classes) if isinstance(p, int) and d in "ABC"]
    if not pairs:
        return feature
    deflection_score = {"A": 100 / 3, "B": 200 / 3, "C": 100}

    def pair_score(pair):
        pressure, deflection = pair
        return min(pressure / 5 * 100, deflection_score[deflection])

    conservative = min(pairs, key=pair_score)
    pressure, deflection = conservative
    score = _round(pair_score(conservative))
    classes = evidence.get("classes") or [evidence.get("class")]
    qualifier = evidence.get("qualifier")
    feature.update({
        "status": "scored_conditional" if qualifier else "scored",
        "value": ("Até " if qualifier == "up_to" else "") + " / ".join(value for value in classes if value),
        "score": score, "score_kind": "indice_conservador_duas_escalas",
        "overall_eligible": not qualifier,
        "raw_value": score, "raw_unit": "pontos normalizados", "better_direction": "higher",
        "formula": (
            f"min(pressão {pressure} ÷ 5 × 100; deflexão {deflection} = "
            f"{_round(deflection_score[deflection])}) = {score}"
        ),
        "explanation": (
            "A EN 12210 tem dois eixos. O índice usa o menor dos dois subíndices e, quando há várias "
            "configurações, a classe publicada mais conservadora. Classes E continuam fora do teto ordinário."
        ),
    })
    return feature


def _security_feature(model, evidence):
    feature = _apply_standard(_base_feature("security", model), "security")
    if not evidence or evidence.get("status") != "verified":
        return feature
    value = evidence.get("class_number")
    if not isinstance(value, int) or not 1 <= value <= 6:
        return feature
    score = _round(value / 6 * 100)
    qualifier = evidence.get("qualifier")
    feature.update({
        "status": "scored_conditional" if qualifier else "scored",
        "value": ("Até " if qualifier == "up_to" else "") + evidence["class"],
        "score": score, "score_kind": "normalizacao_escala_oficial",
        "overall_eligible": not qualifier,
        "formula": f"{value} ÷ 6 × 100 = {score}",
        "explanation": (
            "A nota Brico2 normaliza a classe RC declarada pela classe máxima RC6. O qualificador "
            "«até» impede que o valor potencial seja usado no Overall de uma configuração concreta."
        ),
    })
    return feature


def _continuous_inputs(unique_models, evidence_by_id, key, value_key, required_scope=None):
    values = {}
    for model_id, model in unique_models.items():
        evidence = evidence_by_id.get(model_id, {}).get(key) or {}
        candidates = evidence.get(value_key) or []
        if evidence.get("status") != "verified" or not candidates:
            continue
        if required_scope and evidence.get("scope") != required_scope:
            continue
        normalised = [float(value) for value in candidates]
        # Para Uw usa-se o pior (maior) resultado publicado; para Rw o pior
        # resultado é o menor. A mesma regra conservadora é usada no detalhe.
        values[model_id] = max(normalised) if key == "thermal" else min(normalised)
    return values


def _continuous_feature(model_id, model, evidence, key, standard_key, catalog_values, lower_is_better):
    feature = _apply_standard(_base_feature(key, model), standard_key)
    value_key = "uw_values" if key == "thermal" else "rw_values"
    symbol = "Uw" if key == "thermal" else "Rw"
    unit = "W/(m²K)" if key == "thermal" else "dB"
    values = evidence.get(value_key) or [] if evidence else []
    if not evidence or not values:
        if evidence and evidence.get("status") == "partial":
            display = evidence.get("display")
            if not display and evidence.get("uf_values"):
                display = f"Uf {max(evidence['uf_values']):g} {unit}"
            feature.update({
                "status": "partial", "value": display or MISSING,
                "explanation": evidence.get("note", MISSING),
            })
            if key == "acoustic" and evidence.get("declared_standard") == "VDI 2719":
                feature = _apply_standard(feature, "vdi_acoustic")
        return feature
    raw_value = max(float(value) for value in values) if key == "thermal" else min(float(value) for value in values)
    if model_id not in catalog_values or len(set(catalog_values.values())) < 2:
        feature.update({
            "status": "verified_no_scale", "value": f"{symbol} {raw_value:g} {unit}",
            "explanation": "Valor oficial encontrado, mas não existem pelo menos dois valores Band comparáveis para criar um índice relativo.",
        })
        return feature
    low, high = min(catalog_values.values()), max(catalog_values.values())
    if lower_is_better:
        score = (high - raw_value) / (high - low) * 100
        formula = f"({high:g} − {raw_value:g}) ÷ ({high:g} − {low:g}) × 100"
    else:
        score = (raw_value - low) / (high - low) * 100
        formula = f"({raw_value:g} − {low:g}) ÷ ({high:g} − {low:g}) × 100"
    score = _round(score)
    qualifier = evidence.get("qualifier")
    feature.update({
        "status": "scored_conditional" if qualifier else "scored",
        "value": ("Até " if qualifier == "up_to" else "") + f"{symbol} {raw_value:g} {unit}",
        "score": score, "score_kind": "indice_relativo_catalogo",
        "overall_eligible": evidence.get("scope") == "configuracoes_ensaiadas" and not qualifier,
        "raw_value": raw_value, "raw_unit": unit,
        "better_direction": "lower" if lower_is_better else "higher",
        "formula": f"{formula} = {score}",
        "catalog_reference": {"best": low if lower_is_better else high, "worst": high if lower_is_better else low},
        "explanation": (
            f"A norma não fornece escala 0–100. Este é um índice relativo min–max entre valores {symbol} "
            "oficiais e comparáveis do catálogo, usando o resultado conservador quando há várias amostras. "
            "Muda quando o catálogo muda e não é uma certificação."
        ),
    })
    return feature


def _descriptive_features(model, evidence):
    result = {}

    energy = _base_feature("energy", model)
    energy_evidence = evidence.get("energy") or {}
    if energy_evidence:
        energy.update({
            "status": "partial", "value": energy_evidence.get("display", MISSING),
            "explanation": energy_evidence.get("note", MISSING),
        })
    elif evidence.get("thermal"):
        energy.update({
            "status": "derived_not_scored", "value": "Relacionada com Uw/Uf; sem declaração energética independente.",
            "explanation": "O desempenho térmico é mostrado separadamente. Não é duplicado no Overall como «eficiência energética» sem método ou declaração própria.",
        })
    result["energy"] = energy

    result["durability"] = _base_feature("durability", model)
    structural = _apply_standard(_base_feature("structural", model), "wind")
    structural["explanation"] = (
        f"{MISSING} A resistência ao vento é analisada separadamente; não foi encontrada outra declaração estrutural independente."
    )
    result["structural"] = structural

    glass = _base_feature("glass", model)
    if model.get("glass_limit_mm"):
        theoretical = model.get("profile_glass_limit_mm")
        value = f"Configuração Band até {model['glass_limit_mm']} mm"
        if theoretical:
            value += f" · perfil até {theoretical} mm"
        glass.update({
            "status": "descriptive", "value": value, "score_kind": "not_scored",
            "explanation": "Capacidade de compatibilidade, não uma escala universal de qualidade; por isso não recebe pontos.",
        })
    elif model.get("category") == "portada":
        glass.update({
            "status": "not_applicable", "value": "Não aplicável à portada de lâminas.",
            "explanation": "Este modelo não é apresentado como sistema envidraçado.",
        })
    result["glass"] = glass

    depths = [f"{label}: {value}" for label, value in model.get("characteristics", {}).items() if "Profundidade" in label]
    depth = _base_feature("frame_depth", model)
    if depths:
        depth.update({
            "status": "descriptive", "value": " · ".join(depths), "score_kind": "not_scored",
            "explanation": "Dimensão geométrica sem direção universal melhor/pior; não é convertida em pontos.",
        })
    result["frame_depth"] = depth

    thermal_break = _apply_standard(_base_feature("thermal_break", model), "thermal_break")
    polyamide = [f"{label}: {value}" for label, value in model.get("characteristics", {}).items() if "poliamida" in label.lower()]
    if polyamide:
        thermal_break.update({
            "status": "descriptive", "value": " · ".join(polyamide), "score_kind": "not_scored",
            "explanation": "A dimensão publicada é mostrada sem assumir que maior largura equivale, por si só, a melhor qualidade.",
        })
    result["thermal_break"] = thermal_break

    material = _base_feature("material", model)
    material.update({
        "status": "descriptive", "value": model.get("material", MISSING), "score_kind": "not_scored",
        "explanation": "O material condiciona o projeto, mas não possui uma hierarquia técnica universal; não recebe pontos.",
    })
    if model.get("material") == "PVC":
        material = _apply_standard(material, "pvc_profiles")
    result["material"] = material

    ce = _apply_standard(_base_feature("ce", model), "product_ce")
    ce["explanation"] = (
        f"{MISSING} Foi encontrada informação geral de ensaios/norma em páginas Band, mas não uma Declaração de Desempenho "
        "ou marcação CE rastreável e específica desta configuração."
    )
    result["ce"] = ce
    return result


def _category(score):
    return next(label for minimum, label in CATEGORY_BANDS if score >= minimum)


def _unique_models(models):
    unique = {}
    aliases = {}
    for key, model in models.items():
        analysis_id = model.get("analysis_id", key)
        aliases[key] = analysis_id
        if analysis_id not in unique:
            stored = deepcopy(model)
            stored["name"] = model.get("analysis_name", model["name"])
            unique[analysis_id] = stored
    return unique, aliases


def _recommendations(model, features):
    published_text = f"{model.get('description', '')} {model.get('category_label', '')}".lower()
    results = []
    uses = [
        "Moradias", "Apartamentos", "Edifícios altos", "Zona costeira", "Ambientes industriais",
        "Comércio", "Escritórios", "Climas frios", "Climas quentes",
    ]
    for use in uses:
        item = {"use": use, "status": "not_determined", "reason": MISSING}
        if use in {"Moradias", "Apartamentos"} and ("residencial" in published_text or "habitação" in published_text):
            item.update({
                "status": "published_use", "reason": "A própria descrição oficial Band enquadra a série em arquitetura urbana/residencial.",
            })
        elif use == "Climas frios" and (features["thermal"].get("score") or 0) >= 75:
            item.update({
                "status": "relative_candidate",
                "reason": "Candidato relativo: está no quartil superior do índice Uw do catálogo. A adequação final depende do vidro, área, clima e instalação.",
            })
        elif use == "Edifícios altos":
            item["reason"] = (
                "Não é emitida recomendação automática: a classe necessária depende da altura, localização, zona de vento, terreno, dimensões e fixação."
            )
        elif use == "Zona costeira":
            item["reason"] = (
                "Não é emitida recomendação automática: organismos de ensaio indicam que exposição costeira exige seleção por localização e projeto."
            )
        elif use == "Climas quentes":
            item["reason"] = (
                "Sem fator solar g, orientação, sombreamento e ventilação não é tecnicamente correto recomendar para sobreaquecimento."
            )
        results.append(item)
    return results


def _strengths_and_limits(features, conflicts):
    scored = [feature for feature in features.values() if feature.get("score") is not None]
    strengths = [
        f"{feature['label']}: {feature['score']:g}/100 ({feature['value']})"
        for feature in sorted(scored, key=lambda item: item["score"], reverse=True)
        if feature["score"] >= 75
    ]
    relative_lows = [
        f"{feature['label']}: {feature['score']:g}/100 ({feature['value']})"
        for feature in sorted(scored, key=lambda item: item["score"])
        if feature["score"] <= 50
    ]
    gaps = [
        feature["label"] for feature in features.values()
        if feature["status"] in {"missing", "partial", "legacy_unmapped", "conflict"}
    ]
    limitations = [conflict["summary"] for conflict in conflicts]
    if gaps:
        limitations.append("Lacunas documentais: " + ", ".join(gaps) + ".")
    return {
        "strengths": strengths or ["Nenhum ponto forte pontuado com a cobertura oficial atual."],
        "relative_lows": relative_lows or ["Nenhum desempenho relativo baixo identificado nos dados pontuáveis."],
        "limitations": limitations or ["Sem conflitos documentais identificados nas fontes consultadas."],
    }


def _enforce_source_policy(feature):
    """Remove uma nota se alguma fonte que a sustenta sair da lista oficial."""
    if feature.get("score") is None:
        return feature
    sources = feature.get("sources") or []
    if sources and all(is_official_source(source.get("url")) for source in sources):
        return feature
    feature.update({
        "status": "blocked_source_policy", "score": None, "overall_eligible": False,
        "formula": None,
        "explanation": f"{MISSING} A evidência não cumpre a lista fechada de fontes oficiais.",
    })
    return feature


def _comparison(left, right):
    axes = []
    superior, inferior, equal = [], [], []
    for key in FEATURES:
        a, b = left["features"][key], right["features"][key]
        if a.get("score") is None or b.get("score") is None or a.get("score_kind") != b.get("score_kind"):
            continue
        delta = _round(a["score"] - b["score"])
        percent = None
        formula = None
        if a.get("raw_value") is not None and b.get("raw_value") is not None and b["raw_value"]:
            if a.get("better_direction") == "lower":
                percent = _round((b["raw_value"] - a["raw_value"]) / b["raw_value"] * 100)
                formula = "(valor B − valor A) ÷ valor B × 100"
            elif a.get("better_direction") == "higher":
                percent = _round((a["raw_value"] - b["raw_value"]) / b["raw_value"] * 100)
                formula = "(valor A − valor B) ÷ valor B × 100"
        winner = "equal"
        if delta > 0.05:
            winner = "left"
            superior.append(a["label"])
        elif delta < -0.05:
            winner = "right"
            inferior.append(a["label"])
        else:
            equal.append(a["label"])
        axes.append({
            "key": key, "label": a["label"], "left_score": a["score"], "right_score": b["score"],
            "delta_points": abs(delta), "difference_percent": abs(percent) if percent is not None else None,
            "percentage_formula": formula, "winner": winner,
        })
    return {
        "id": f"{left['id']}__{right['id']}", "left_id": left["id"], "right_id": right["id"],
        "superior_left": superior, "inferior_left": inferior, "equal": equal, "axes": axes,
    }


def build_catalog_analysis(models=None):
    """Recalcula todo o catálogo em cada chamada, incluindo futuras entradas."""
    models = models or MODELS
    unique_models, aliases = _unique_models(models)
    evidence_by_id = {model_id: deepcopy(MODEL_EVIDENCE.get(model_id, {})) for model_id in unique_models}
    thermal_values = _continuous_inputs(
        unique_models, evidence_by_id, "thermal", "uw_values", required_scope="configuracoes_ensaiadas"
    )
    acoustic_values = _continuous_inputs(unique_models, evidence_by_id, "acoustic", "rw_values")

    analyses = []
    for model_id, model in unique_models.items():
        evidence = evidence_by_id.get(model_id, {})
        features = {
            "air": _air_feature(model, evidence.get("air")),
            "water": _water_feature(model, evidence.get("water")),
            "wind": _wind_feature(model, evidence.get("wind")),
            "thermal": _continuous_feature(
                model_id, model, evidence.get("thermal") or {}, "thermal", "thermal", thermal_values, True
            ),
            "acoustic": _continuous_feature(
                model_id, model, evidence.get("acoustic") or {}, "acoustic", "acoustic", acoustic_values, False
            ),
            "security": _security_feature(model, evidence.get("security")),
        }
        features.update(_descriptive_features(model, evidence))
        features = {key: _enforce_source_policy(feature) for key, feature in features.items()}
        conflicts = deepcopy(SOURCE_CONFLICTS.get(model_id, []))
        core_ready = all(features[key].get("overall_eligible") for key, info in FEATURES.items() if info["core"])
        analyses.append({
            "id": model_id,
            "name": model["name"],
            "material": model.get("material"),
            "category": model.get("category"),
            "category_label": model.get("category_label"),
            "description": model.get("description"),
            "source_url": model.get("source_url"),
            "features": features,
            "core_ready": core_ready,
            "overall": {
                "score": None, "category": None, "rank": None, "percentile": None, "medal": None,
                "coverage_percent": _round(sum(
                    info["weight"] for key, info in FEATURES.items() if features[key].get("overall_eligible")
                )),
                "status": "pending_common_axes" if core_ready else "insufficient_evidence",
                "explanation": MISSING,
            },
            "manufacturer_sources": deepcopy(MANUFACTURER_SOURCES.get(model_id, [])),
            "conflicts": conflicts,
            "recommendations": _recommendations(model, features),
            "price_quality": {"status": "missing", "value": MISSING, "explanation": "Não foi encontrado preço público oficial por modelo."},
            "evidence_gate": "eligible" if core_ready else "blocked",
        })

    eligible = [analysis for analysis in analyses if analysis["core_ready"]]
    active_axes = [
        key for key, info in FEATURES.items() if info["weight"] > 0 and eligible
        and all(model["features"][key].get("overall_eligible") for model in eligible)
    ]
    active_weight = sum(FEATURES[key]["weight"] for key in active_axes)
    for analysis in eligible:
        if active_weight < 70 or not all(key in active_axes for key, info in FEATURES.items() if info["core"]):
            analysis["overall"]["status"] = "insufficient_common_coverage"
            continue
        weighted = sum(
            analysis["features"][key]["score"] * FEATURES[key]["weight"] for key in active_axes
        ) / active_weight
        score = _round(weighted)
        analysis["overall"].update({
            "score": score, "category": _category(score), "coverage_percent": _round(active_weight),
            "status": "scored",
            "formula": " + ".join(
                f"{FEATURES[key]['label']} {analysis['features'][key]['score']:g}×{FEATURES[key]['weight']}"
                for key in active_axes
            ) + f" ÷ {active_weight} = {score}",
            "explanation": (
                "Média ponderada apenas sobre os mesmos eixos oficiais disponíveis para todos os modelos elegíveis. "
                "Um eixo em falta nunca é convertido em zero nem removido só para um modelo."
            ),
        })

    ranked = sorted(
        [analysis for analysis in analyses if analysis["overall"]["score"] is not None],
        key=lambda item: (-item["overall"]["score"], item["name"]),
    )
    medal_labels = ["Ouro", "Prata", "Bronze"]
    previous_score = None
    previous_rank = 0
    for index, analysis in enumerate(ranked):
        score = analysis["overall"]["score"]
        rank = previous_rank if score == previous_score else index + 1
        percentile = _round(sum(item["overall"]["score"] <= score for item in ranked) / len(ranked) * 100)
        analysis["overall"].update({
            "rank": rank, "percentile": percentile,
            "medal": medal_labels[rank - 1] if rank <= 3 else None,
        })
        previous_score, previous_rank = score, rank

    for analysis in analyses:
        analysis.update(_strengths_and_limits(analysis["features"], analysis["conflicts"]))

    comparisons = [_comparison(left, right) for left, right in combinations(analyses, 2)]
    winners = {}
    winner_labels = {
        "thermal": "Melhor isolamento", "wind": "Melhor resistência",
        "energy": "Melhor eficiência energética", "acoustic": "Melhor desempenho acústico",
    }
    for key, label in winner_labels.items():
        candidates = [analysis for analysis in analyses if analysis["features"][key].get("score") is not None]
        if not candidates:
            winners[key] = {"label": label, "status": "missing", "value": MISSING, "model_ids": []}
            continue
        best = max(candidate["features"][key]["score"] for candidate in candidates)
        best_models = [candidate for candidate in candidates if candidate["features"][key]["score"] == best]
        winners[key] = {
            "label": label, "status": "scored", "score": best,
            "value": " / ".join(candidate["name"] for candidate in best_models),
            "model_ids": [candidate["id"] for candidate in best_models],
        }
    winners["quality_price"] = {
        "label": "Melhor relação qualidade/preço", "status": "missing", "value": MISSING,
        "model_ids": [], "explanation": "Não foi encontrado preço público oficial por modelo.",
    }

    quadrille_analysis = {
        "id": "quadricula_25", "name": QUADRILLE_INFO["name"], "type": "accessory",
        "overall": {"score": None, "status": "not_applicable"},
        "explanation": "Acessório decorativo, sem escala de desempenho comparável a uma janela, porta ou portada.",
        "source_url": QUADRILLE_INFO["source_url"],
    }
    research_queue = [
        {"model_id": analysis["id"], "name": analysis["name"], "reason": analysis["overall"]["explanation"]}
        for analysis in analyses if analysis["evidence_gate"] == "blocked"
    ]
    return {
        "methodology": {
            "name": METHOD_VERSION,
            "notice": "Pontuações Brico2 auditáveis; não são classes oficiais, certificados nem declarações de desempenho.",
            "missing_text": MISSING,
            "weights": {key: info["weight"] for key, info in FEATURES.items() if info["weight"]},
            "core_features": [key for key, info in FEATURES.items() if info["core"]],
            "active_features": active_axes,
            "minimum_common_coverage": 70,
            "category_bands": [{"minimum": minimum, "category": label} for minimum, label in CATEGORY_BANDS],
            "ranking_rule": "Só entram modelos com os cinco eixos centrais e cobertura comum mínima de 70%.",
            "update_rule": (
                "A análise e o ranking são recalculados em cada leitura do catálogo. Uma referência nova aparece "
                "automaticamente, mas fica fora do ranking até possuir evidência oficial estruturada."
            ),
            "official_source_hosts": sorted(OFFICIAL_SOURCE_HOSTS),
        },
        "standards": deepcopy(STANDARDS),
        "models": analyses,
        "model_index": {analysis["id"]: analysis for analysis in analyses},
        "aliases": aliases,
        "ranking": [analysis["id"] for analysis in ranked],
        "comparisons": comparisons,
        "winners": winners,
        "accessories": [quadrille_analysis],
        "research_queue": research_queue,
        "stats": {
            "catalog_models": len(analyses), "ranked_models": len(ranked),
            "models_with_conflicts": sum(bool(analysis["conflicts"]) for analysis in analyses),
            "accessories": 1,
        },
    }


CATALOG_ANALYSIS = build_catalog_analysis()
