"""Catálogo técnico público da BandAlumínios, normalizado para o Brico2.

Os valores abaixo são referências publicadas pelo fabricante. As classes de
desempenho pertencem às configurações ensaiadas indicadas nas fichas e não
devem ser apresentadas ao cliente como garantia de qualquer vão diferente.
"""

CATALOG_META = {
    "name": "Catálogo técnico BandAlumínios",
    "source_url": "https://www.bandaluminios.com/pt3/catalogo.html",
    "checked_at": "2026-07-16",
    "notice": (
        "Dados de referência publicados pela BandAlumínios. O desempenho final depende das medidas, "
        "vidro, ferragens e configuração; confirmar sempre na proposta do fornecedor."
    ),
}


OPENING_TYPES = {
    "": "Por definir",
    "abrir_batente": "Abrir / batente",
    "correr": "Correr",
    "oscilo_batente": "Oscilo-batente",
    "basculante": "Basculante",
    "fixa": "Fixa",
    "portada": "Portada",
    "rede": "Rede mosquiteira",
}


GLASS_TYPES = {
    "vidro": {
        "label": "Vidro — tipo por definir",
        "benefit": "Composição e acabamento a confirmar.",
        "typical_use": "Quando o cliente ainda não escolheu o tipo de vidro.",
    },
    "vidro_incolor": {
        "label": "Vidro incolor",
        "benefit": "Máxima entrada de luz e aspeto neutro.",
        "typical_use": "Vãos onde se pretende luminosidade e vista desimpedida.",
    },
    "vidro_fosco": {
        "label": "Vidro crepe / fosco",
        "benefit": "Privacidade sem eliminar a luz natural.",
        "typical_use": "Casas de banho, halls, portas interiores e zonas reservadas.",
    },
    "vidro_baixo_emissivo": {
        "label": "Vidro baixo emissivo (low-e)",
        "benefit": "Melhora o desempenho térmico e a eficiência energética.",
        "typical_use": "Habitação, reabilitação energética e vãos com exigência térmica.",
    },
    "vidro_laminado": {
        "label": "Vidro laminado",
        "benefit": "Segurança reforçada e melhor atenuação acústica.",
        "typical_use": "Portas, montras, guardas e vãos próximos de circulação.",
    },
    "paineis": {
        "label": "Painéis",
        "benefit": "Solução opaca; composição a definir na referência.",
        "typical_use": "Portas ou zonas sem envidraçado integral.",
    },
}


QUADRILLE_OPTIONS = {
    "sem": "Sem quadrícula",
    "25_aluminio": "Quadrícula decorativa 25 mm · alumínio",
    "25_pvc": "Quadrícula decorativa 25 mm · PVC",
    "outra_sob_consulta": "Outra largura · sob consulta",
}

QUADRILLE_INFO = {
    "name": "Quadrícula decorativa 25 mm",
    "description": (
        "Elemento decorativo aplicado ao vidro para dar ritmo e um aspeto mais clássico ou trabalhado ao vão."
    ),
    "characteristics": {
        "Largura standard": "25 mm",
        "Materiais": "Alumínio ou PVC",
        "Cores": "Diversas cores, sob consulta",
        "Outras larguras": "Sujeitas a avaliação de viabilidade técnica",
    },
    "source_url": "https://www.bandaluminios.com/pt3/quadricula-decorativa-25mm.html",
}


MODELS = {
    "confort_correr": {
        "name": "Confort",
        "family": "aluminio_sem_corte",
        "material": "Alumínio",
        "category": "correr",
        "category_label": "Série de correr",
        "products": ["janela", "porta"],
        "description": (
            "Série tradicional de correr, de gama média, para janelas e portas com vidro duplo ou simples "
            "em arquitetura urbana e residencial."
        ),
        "leaves": [2, 3, 4, 6],
        "characteristics": {
            "Profundidade do aro": "70,5–73,5 mm",
            "Profundidade da folha": "24,8–27,8 mm",
            "Vidro duplo": "Até 18 mm",
            "Vidro simples": "4–6 mm",
        },
        "reference_glass": "4+10+4",
        "glass_limit_mm": 18,
        "classification": {
            "Ar": "Classe 34*",
            "Água": "Classe 7A",
            "Vento": "Classe B2",
            "Térmica": "Uw 3,9–4,3 W/(m²K) · Uf 7 W/(m²K)",
            "Acústica": "Rw 25–26 dB",
        },
        "tests": [
            {"sample": "Janela 1600×2030 mm", "glass": "4+10+4", "uw": "3,9", "rw": "25 (-1;-3) dB"},
            {"sample": "Janela 1800×1200 mm", "glass": "4+10+4", "uw": "4,3", "rw": "26 (-1;-3) dB"},
        ],
        "profiles": [
            "PO 4169", "PO 4170", "PO 4173", "PO 4179", "PO 4176", "PO 4177", "PO 4178",
            "PO 4993", "PO 4381", "PO 5250", "PO 5251", "PO 5252",
        ],
        "data_notes": [
            "A ficha publica literalmente «Classe 34» para permeabilidade ao ar; confirmar a classe correta no orçamento."
        ],
        "source_url": "https://www.bandaluminios.com/pt3/confort.html",
    },
    "sb_batente": {
        "name": "Batente SB",
        "family": "aluminio_sem_corte",
        "material": "Alumínio",
        "category": "abrir_batente",
        "category_label": "Série de abrir / batente",
        "products": ["janela", "porta"],
        "description": (
            "Série de abrir com várias soluções estéticas e funcionais, orientada para uma relação qualidade/preço equilibrada."
        ),
        "leaves": [1, 2, 3, 4],
        "characteristics": {
            "Profundidade do aro": "38–70 mm",
            "Profundidade da folha": "45 mm",
            "Vidro": "4–20 mm",
            "Solução da folha": "Redonda",
        },
        "reference_glass": "4+12+4",
        "glass_limit_mm": 20,
        "classification": {"Ar": "Classe 4", "Água": "Classe 8A", "Vento": "Classe C3"},
        "tests": [],
        "profiles": [
            "SB 00", "SB 06", "SB 07", "SB 08", "SB 09", "SB 13", "SB 20", "SB 36",
            "SB 52", "SB 63", "SB 64", "SD 01", "SD 13", "SD 31", "SD 85", "SD 88", "SA 32", "KW 92",
        ],
        "data_notes": [],
        "source_url": "https://www.bandaluminios.com/pt3/batente-sb.html",
    },
    "thermostop_batente": {
        "name": "Thermostop",
        "family": "aluminio_corte_termico",
        "material": "Alumínio com corte térmico",
        "category": "abrir_batente",
        "category_label": "Série de abrir / batente",
        "products": ["janela", "porta"],
        "description": (
            "Série de batente com corte térmico por barras de poliamida de 14,8 mm reforçadas com fibra de vidro."
        ),
        "leaves": [1, 2, 3, 4],
        "characteristics": {
            "Barra de poliamida": "14,8 mm",
            "Profundidade do aro": "45,2 mm",
            "Profundidade da folha": "52,4 mm",
            "Vidro duplo": "Até 22 mm",
        },
        "reference_glass": "6+12+4",
        "glass_limit_mm": 22,
        "classification": {
            "Ar": "Classe 4", "Água": "Classe 9A", "Vento": "Classe C3",
            "Térmica": "Uw 3,0–3,2 W/(m²K) · Uf 3,5 W/(m²K)", "Acústica": "Rw 36 dB",
        },
        "tests": [
            {"sample": "Janela 2 folhas 1230×1480 mm", "glass": "6+14+4*", "uw": "3,2", "rw": "36 (-2;-4) dB"},
            {"sample": "Janela 2 folhas 1800×2100 mm", "glass": "6+14+4*", "uw": "3,0", "rw": "36 (-2;-4) dB"},
        ],
        "profiles": ["TS 0001", "TS 0004", "TS 0006", "TS 0007", "TS 0009", "TS 0011", "TS 0013", "PO 3659", "AT95", "AT92"],
        "data_notes": [
            "A ficha do modelo indica vidro máximo de 22 mm mas lista 6+14+4 (24 mm) nos ensaios. "
            "A tabela de vidros da Band indica 6+12+4 (22 mm); usar esta referência e confirmar."
        ],
        "source_url": "https://www.bandaluminios.com/pt3/thermostop.html",
    },
    "thermostop24_batente": {
        "name": "Thermostop 24",
        "family": "aluminio_corte_termico",
        "material": "Alumínio com corte térmico",
        "category": "abrir_batente",
        "category_label": "Série de abrir / batente",
        "products": ["janela", "porta"],
        "description": (
            "Série de batente com corte térmico reforçado por barras de poliamida de 24 mm, orientada para conforto térmico e acústico."
        ),
        "leaves": [1, 2, 3, 4],
        "characteristics": {
            "Barra de poliamida": "24 mm",
            "Profundidade do aro": "54,4 mm",
            "Profundidade da folha": "61,6 mm",
            "Vidro duplo": "Até 30 mm",
        },
        "reference_glass": "6+20+4",
        "glass_limit_mm": 30,
        "classification": {
            "Ar": "Classe 4", "Água": "Classe 9A", "Vento": "Classe C3",
            "Térmica": "Uw 2,9–3,1 W/(m²K) · Uf 3,0–3,5 W/(m²K)", "Acústica": "Rw 37 dB",
        },
        "tests": [
            {"sample": "Janela 2 folhas 1230×1480 mm", "glass": "4+20+6", "uw": "2,9", "rw": "37 (-2;-4) dB"},
            {"sample": "Janela 2 folhas 1800×2100 mm", "glass": "4+20+6", "uw": "3,1", "rw": "37 (-2;-4) dB"},
        ],
        "profiles": ["TS 0124", "TS 0224", "TS 0424", "TS 0624", "TS 0724", "TS 0924", "TS 1124", "TS 1324", "AT95", "AT92"],
        "data_notes": [],
        "source_url": "https://www.bandaluminios.com/pt3/thermostop-24.html",
    },
    "thermoline_correr": {
        "name": "Thermoline",
        "family": "aluminio_corte_termico",
        "material": "Alumínio",
        "category": "correr",
        "category_label": "Série de correr",
        "products": ["janela", "porta"],
        "description": (
            "Série de correr para janelas e portas de vidro duplo, com solução de folha perimetral e vocação urbana/residencial."
        ),
        "leaves": [2, 3, 4, 6],
        "characteristics": {
            "Profundidade do aro": "86,6–92,4 mm",
            "Profundidade da folha": "35 mm",
            "Vidro duplo": "Até 24 mm",
            "Solução da folha": "Perimetral",
        },
        "reference_glass": "6+14+4",
        "glass_limit_mm": 24,
        "classification": {
            "Ar": "Classe 3", "Água": "Classe 7A", "Vento": "Classe C2–C5",
            "Térmica": "Uw 3,1–3,2 W/(m²K) · Uf 3,9 W/(m²K)", "Acústica": "Rw 34 dB",
        },
        "tests": [
            {"sample": "Janela 2 folhas 1230×1480 mm", "glass": "4+14+6", "wind": "C5", "uw": "3,1", "rw": "34 (-2;-3) dB"},
            {"sample": "Janela 2 folhas 1800×2100 mm", "glass": "4+14+6", "wind": "C2", "uw": "3,2", "rw": "34 (-2;-3) dB"},
        ],
        "profiles": ["TL 0001", "TL 0003", "TL 0009", "TL 0015", "TL 0099", "PO 9007", "PVC 207"],
        "data_notes": [],
        "source_url": "https://www.bandaluminios.com/pt3/thermoline.html",
    },
    "eurodesign70_batente": {
        "name": "Euro-Design 70",
        "family": "pvc",
        "material": "PVC",
        "category": "abrir_batente",
        "category_label": "Série de abrir / batente",
        "products": ["janela", "porta"],
        "description": (
            "Sistema de abrir em RAU-PVC 1406, com 70 mm de profundidade e três câmaras, focado em isolamento e economia de energia."
        ),
        "leaves": [],
        "characteristics": {
            "Profundidade construtiva": "70 mm",
            "Capacidade teórica de vidro": "Até 41 mm",
            "Configuração Band publicada": "Até 24 mm",
            "Número de câmaras": "3",
            "Profundidade de aros": "68–76 mm",
        },
        "reference_glass": "6+14+4",
        "glass_limit_mm": 24,
        "profile_glass_limit_mm": 41,
        "classification": {
            "Ar": "Classe C (DIN 18055)", "Água": "Classe C (DIN 18055)",
            "Térmica": "Uf 1,3 W/(m²K)", "Acústica": "Até classe 4 (VDI 2719)",
            "Energia": "Poupança publicada até 56%*",
        },
        "tests": [],
        "profiles": ["Aro 68", "Aro 76", "Travessa 86", "Folha Z 60", "Folha Z 86", "Batente"],
        "data_notes": [
            "A ficha do perfil refere capacidade até 41 mm; a tabela de vidros usada pela Band publica 6+14+4 (24 mm)."
        ],
        "source_url": "https://www.bandaluminios.com/pt3/pvc-eurodesign.html",
    },
    "slinova_correr": {
        "name": "Slinova",
        "family": "pvc",
        "material": "PVC",
        "category": "correr",
        "category_label": "Série de correr",
        "products": ["janela", "porta"],
        "description": (
            "Sistema moderno de correr em RAU-PVC, com 80 mm de base construtiva, estabilidade elevada e isolamento térmico/acústico melhorado."
        ),
        "leaves": [],
        "characteristics": {
            "Parede do perfil": "Classe B (DIN EN 12608)",
            "Juntas": "Junta de escova",
            "Profundidade aro / folha": "80–173 mm / 54 mm",
            "Capacidade teórica de vidro": "4–32 mm",
            "Configuração Band publicada": "Até 24 mm",
            "Peso máximo da folha": "140 kg",
        },
        "reference_glass": "6+14+4",
        "glass_limit_mm": 24,
        "profile_glass_limit_mm": 32,
        "max_dimensions": {
            "white": {"width_mm": 2000, "height_mm": 2600, "label": "Folha branca"},
            "foiled": {"width_mm": 1500, "height_mm": 2450, "label": "Folha folheada"},
        },
        "classification": {
            "Ar": "Classe 4 (DIN EN 12207)", "Água": "Classe 7A (DIN EN 12208)",
            "Vento": "Até A2/B2 (DIN EN 12210)", "Térmica": "Uf até 1,7 W/(m²K)",
            "Acústica": "Rw,P até 33 dB", "Segurança": "RC2 (DIN EN 1627)*",
        },
        "tests": [],
        "profiles": ["Aro 1575602", "Aro 155603", "Folha 1575305", "Batente 1575506", "Batente 1575507", "Bite 560580"],
        "data_notes": [
            "A ficha do perfil admite 4–32 mm; a tabela de vidros usada pela Band publica 6+14+4 (24 mm)."
        ],
        "source_url": "https://www.bandaluminios.com/pt3/serie-de-correr-slinova.html",
    },
}


_HP_COMMON = {
    "analysis_id": "portada_hp",
    "analysis_name": "Portada HP",
    "family": "portada_hp",
    "material": "Alumínio",
    "category": "portada",
    "category_label": "Série de portada",
    "products": ["portada"],
    "leaves": [1, 2, 3, 4],
    "characteristics": {
        "Aro fixo": "40 mm",
        "Aro móvel": "40 mm",
        "Aberturas": "1, 2, 3 ou 4 folhas",
        "Vedação": "Juntas EPDM",
        "Comandos": "Rodas",
        "Lâminas": "Móveis ou fixas",
    },
    "reference_glass": "",
    "glass_limit_mm": None,
    "classification": {},
    "tests": [],
    "profiles": ["PO 3994", "PO 3995", "PO 4001", "PO 4069", "P 23881", "P 23519", "P 22335"],
    "data_notes": ["A ficha pública não apresenta classes de ar, água, vento, térmica ou acústica para esta portada."],
    "source_url": "https://www.bandaluminios.com/pt3/portada-hp.html",
}

MODELS["lamina_fixa"] = {
    **_HP_COMMON,
    "name": "Portada HP · lâmina fixa",
    "description": "Portada tradicional de alumínio HP com lâminas fixas, juntas EPDM e soluções de 1 a 4 folhas.",
}
MODELS["lamina_regulavel"] = {
    **_HP_COMMON,
    "name": "Portada HP · lâmina móvel",
    "description": "Portada tradicional de alumínio HP com lâminas móveis, juntas EPDM e soluções de 1 a 4 folhas.",
}


# Evidência estruturada consumida pelo motor de análise. Os valores numéricos
# são apenas os que aparecem nas páginas oficiais identificadas. Qualificadores
# como ``up_to`` e conflitos são preservados para impedir comparações indevidas.
MODEL_EVIDENCE = {
    "confort_correr": {
        "air": {
            "status": "conflict",
            "display": "Classe 34 (texto publicado)",
            "declared_standard": "EN 12207",
            "note": "A escala oficial EN 12207 utiliza classes 1 a 4; «Classe 34» não pode ser interpretada sem correção da fonte.",
        },
        "water": {"status": "verified", "class": "7A", "pressure_pa": 300, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "class": "B2", "pressure_class": 2,
            "deflection_class": "B", "declared_standard": "EN 12210",
        },
        "thermal": {
            "status": "verified", "uw_values": [3.9, 4.3], "uf_values": [7.0],
            "unit": "W/(m²K)", "scope": "configuracoes_ensaiadas",
        },
        "acoustic": {
            "status": "verified", "rw_values": [25, 26], "unit": "dB",
            "scope": "configuracoes_ensaiadas",
        },
    },
    "sb_batente": {
        "air": {"status": "verified", "class": 4, "declared_standard": "EN 12207"},
        "water": {"status": "verified", "class": "8A", "pressure_pa": 450, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "class": "C3", "pressure_class": 3,
            "deflection_class": "C", "declared_standard": "EN 12210",
        },
    },
    "thermostop_batente": {
        "air": {"status": "verified", "class": 4, "declared_standard": "EN 12207"},
        "water": {"status": "verified", "class": "9A", "pressure_pa": 600, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "class": "C3", "pressure_class": 3,
            "deflection_class": "C", "declared_standard": "EN 12210",
        },
        "thermal": {
            "status": "verified", "uw_values": [3.2, 3.0], "uf_values": [3.5],
            "unit": "W/(m²K)", "scope": "configuracoes_ensaiadas",
        },
        "acoustic": {
            "status": "verified", "rw_values": [36, 36], "unit": "dB",
            "scope": "configuracoes_ensaiadas",
        },
    },
    "thermostop24_batente": {
        "air": {"status": "verified", "class": 4, "declared_standard": "EN 12207"},
        "water": {"status": "verified", "class": "9A", "pressure_pa": 600, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "class": "C3", "pressure_class": 3,
            "deflection_class": "C", "declared_standard": "EN 12210",
        },
        "thermal": {
            "status": "verified", "uw_values": [2.9, 3.1], "uf_values": [3.0, 3.5],
            "unit": "W/(m²K)", "scope": "configuracoes_ensaiadas",
        },
        "acoustic": {
            "status": "verified", "rw_values": [37, 37], "unit": "dB",
            "scope": "configuracoes_ensaiadas",
        },
    },
    "thermoline_correr": {
        "air": {"status": "verified", "class": 3, "declared_standard": "EN 12207"},
        "water": {"status": "verified", "class": "7A", "pressure_pa": 300, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "classes": ["C5", "C2"],
            "pressure_classes": [5, 2], "deflection_classes": ["C", "C"],
            "declared_standard": "EN 12210", "scope": "configuracoes_ensaiadas",
        },
        "thermal": {
            "status": "verified", "uw_values": [3.1, 3.2], "uf_values": [3.9],
            "unit": "W/(m²K)", "scope": "configuracoes_ensaiadas",
        },
        "acoustic": {
            "status": "verified", "rw_values": [34, 34], "unit": "dB",
            "scope": "configuracoes_ensaiadas",
        },
    },
    "eurodesign70_batente": {
        "air": {
            "status": "legacy_unmapped", "class": "C", "declared_standard": "DIN 18055",
            "note": "A classe histórica C não é convertida automaticamente para EN 12207.",
        },
        "water": {
            "status": "legacy_unmapped", "class": "C", "declared_standard": "DIN 18055",
            "note": "A classe histórica C não é convertida automaticamente para EN 12208.",
        },
        "thermal": {
            "status": "partial", "uf_values": [1.3], "unit": "W/(m²K)",
            "scope": "perfil", "note": "A ficha Band publica Uf, mas não publica Uw para uma configuração ensaiada.",
        },
        "acoustic": {
            "status": "partial", "display": "Até classe 4", "declared_standard": "VDI 2719",
            "scope": "sistema", "note": "Sem valor Rw em dB na ficha Band; não é comparável aos ensaios Rw dos restantes modelos.",
        },
        "energy": {
            "status": "partial", "display": "Poupança até 56%",
            "note": "A página não identifica a configuração de referência nem o método de cálculo da percentagem.",
        },
    },
    "slinova_correr": {
        "air": {"status": "verified", "class": 4, "declared_standard": "EN 12207"},
        "water": {"status": "verified", "class": "7A", "pressure_pa": 300, "declared_standard": "EN 12208"},
        "wind": {
            "status": "verified", "classes": ["A2", "B2"], "pressure_classes": [2, 2],
            "deflection_classes": ["A", "B"], "declared_standard": "EN 12210", "qualifier": "up_to",
        },
        "thermal": {
            "status": "partial", "uf_values": [1.7], "unit": "W/(m²K)",
            "scope": "perfil", "note": "A ficha Band publica Uf, mas não publica Uw para uma configuração ensaiada.",
        },
        "acoustic": {
            "status": "verified", "rw_values": [33], "unit": "dB", "qualifier": "up_to",
            "scope": "sistema",
        },
        "security": {
            "status": "verified", "class": "RC2", "class_number": 2,
            "declared_standard": "EN 1627", "qualifier": "up_to",
        },
    },
    "portada_hp": {},
}


MANUFACTURER_SOURCES = {
    "eurodesign70_batente": [
        {
            "label": "REHAU · Euro-Design 70",
            "url": "https://www.rehau.com/pt-pt/profissionais/carpintaria-e-sistemas-pvc/perfis-pvc-janelas/janelas-euro-design-70",
            "scope": "Desempenho potencial do sistema; não confirma a configuração fabricada pela BandAlumínios.",
            "published": {
                "Uf": "até 1,3 W/(m²K)", "Rw": "45 dB", "Segurança": "até RC3",
                "Ar": "Classe 4", "Água": "Classe 9A", "Vento": "Classe C5",
                "Câmaras": "5", "Vidro": "até 41 mm",
            },
        }
    ],
    "slinova_correr": [
        {
            "label": "REHAU · apresentação oficial SLINOVA",
            "url": "https://www.rehau.com/pt-pt/rehau-apresenta-slinova-o-mais-novo-em-correderas",
            "scope": "Desempenho potencial do sistema; não substitui os resultados das configurações Band.",
            "published": {
                "Uw": "até 1,3 W/(m²K)", "Uf": "1,7 W/(m²K)", "Acústica": "até 33 dB",
                "Material reciclado": "mínimo 40% no núcleo central",
            },
        }
    ],
}


SOURCE_CONFLICTS = {
    "confort_correr": [
        {
            "field": "Permeabilidade ao ar",
            "summary": "A Band publica «Classe 34», mas a EN 12207 só prevê classes 1 a 4.",
            "sources": [
                "https://www.bandaluminios.com/pt3/confort.html",
                "https://www.ift-rosenheim.de/pruefung-luftdurchlaessigkeit-fenster-tueren",
            ],
        }
    ],
    "thermostop_batente": [
        {
            "field": "Espessura de vidro",
            "summary": "A ficha do modelo indica máximo de 22 mm, mas a composição de ensaio 6+14+4 totaliza 24 mm; a tabela Band indica 6+12+4.",
            "sources": [
                "https://www.bandaluminios.com/pt3/thermostop.html",
                "https://www.bandaluminios.com/pt3/vidros-para-caixilharia.html",
            ],
        }
    ],
    "eurodesign70_batente": [
        {
            "field": "Número de câmaras",
            "summary": "A página Band publica 3 câmaras; a página atual do fabricante REHAU publica 5. Não são fundidas numa única declaração.",
            "sources": [
                "https://www.bandaluminios.com/pt3/pvc-eurodesign.html",
                "https://www.rehau.com/pt-pt/profissionais/carpintaria-e-sistemas-pvc/perfis-pvc-janelas/janelas-euro-design-70",
            ],
        },
        {
            "field": "Classes de desempenho",
            "summary": "A Band publica classes históricas DIN 18055; a REHAU publica máximos atuais EN. A configuração Band não é assumida como equivalente ao máximo do sistema.",
            "sources": [
                "https://www.bandaluminios.com/pt3/pvc-eurodesign.html",
                "https://www.rehau.com/pt-pt/profissionais/carpintaria-e-sistemas-pvc/perfis-pvc-janelas/janelas-euro-design-70",
            ],
        },
    ],
}


FAMILIES = {
    "aluminio_sem_corte": {
        "label": "Alumínio · gama standard",
        "produtos": ["janela", "porta"],
        "sistemas": {"confort_correr": "Confort · correr", "sb_batente": "Batente SB · abrir"},
    },
    "aluminio_corte_termico": {
        "label": "Alumínio · desempenho térmico",
        "produtos": ["janela", "porta"],
        "sistemas": {
            "thermostop_batente": "Thermostop · abrir",
            "thermostop24_batente": "Thermostop 24 · abrir",
            "thermoline_correr": "Thermoline · correr",
        },
    },
    "portada_hp": {
        "label": "Alumínio · Portada HP",
        "produtos": ["portada"],
        "sistemas": {"lamina_fixa": "HP · lâmina fixa", "lamina_regulavel": "HP · lâmina móvel"},
    },
    "pvc": {
        "label": "PVC",
        "produtos": ["janela", "porta"],
        "sistemas": {
            "eurodesign70_batente": "Euro-Design 70 · abrir",
            "slinova_correr": "Slinova · correr",
        },
    },
    "redes": {
        "label": "Redes mosquiteiras",
        "produtos": ["rede_mosquiteira"],
        "sistemas": {
            "rede_fixa": "Fixa", "rede_enrolavel": "Enrolável",
            "rede_correr": "De correr", "rede_plissada": "Plissada",
        },
    },
}


def material_labels():
    return {key: value["label"] for key, value in GLASS_TYPES.items()}


def model_reference_summary(model):
    """Resumo compacto para emails; não converte resultados de ensaio em requisitos."""
    if not model:
        return ""
    parts = []
    if model.get("leaves"):
        leaves = model["leaves"]
        parts.append(f"{min(leaves)}–{max(leaves)} folhas")
    if model.get("glass_limit_mm"):
        parts.append(f"vidro até {model['glass_limit_mm']} mm")
    return " · ".join(parts)


def model_classification_summary(model):
    if not model:
        return ""
    return " · ".join(f"{key}: {value}" for key, value in model.get("classification", {}).items())
