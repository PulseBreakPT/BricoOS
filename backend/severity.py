"""Classificação de gravidade partilhada entre Correio Semanal e
Anexos_Edição — Crítico / Urgente / Importante / Informação / Arquivo.
Determinística: combina a categoria (já classificada por
classification_rules), sinais explícitos no texto e proximidade de um
prazo, quando existir. Nunca lê o layout, só o conteúdo."""

import unicodedata

LEVELS = ("critico", "urgente", "importante", "informacao", "arquivo")
LEVEL_LABELS = {
    "critico": "Crítico", "urgente": "Urgente", "importante": "Importante",
    "informacao": "Informação", "arquivo": "Arquivo",
}
LEVEL_RANK = {lvl: i for i, lvl in enumerate(LEVELS)}

_CRITICAL_KEYWORDS = ("critico", "bloqueio de venda", "recolha", "seguranca alimentar", "risco grave")
_URGENT_KEYWORDS = ("urgente", "com urgencia", "resposta imediata", "de imediato")

ACTIONABLE_CATEGORIES = {"nota_encomenda", "incidencia", "campanha", "lista_limpeza"}
INFO_CATEGORIES = {"catalogo", "dossier_gama", "planograma", "informativo", "tecnico", "tabela_precos"}

# Para tarefas sugeridas (server.py) — mantém a escala já usada em tasks.priority.
LEVEL_TO_TASK_PRIORITY = {
    "critico": "alta", "urgente": "alta", "importante": "media",
    "informacao": "baixa", "arquivo": "baixa",
}


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower()


def classify_severity(category, text="", deadline_days=None, requires_adhesion=False):
    """deadline_days: nº de dias até ao prazo mais próximo mencionado (ou
    None se não houver nenhum). category: uma das categorias devolvidas por
    classification_rules.classify (ou "outro")."""
    folded = _fold(text)
    if category == "incidencia" and any(kw in folded for kw in _CRITICAL_KEYWORDS):
        return "critico"
    if any(kw in folded for kw in _URGENT_KEYWORDS):
        return "urgente"
    if deadline_days is not None:
        if deadline_days <= 2:
            return "urgente"
        if deadline_days <= 14:
            return "importante"
    if requires_adhesion:
        return "importante"
    if category in ACTIONABLE_CATEGORIES:
        return "importante"
    if category in INFO_CATEGORIES:
        return "informacao"
    if category == "outro":
        return "arquivo"
    return "informacao"
