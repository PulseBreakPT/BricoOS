"""Resumo único de uma edição — combina o que o correio_semanal.py extraiu
do boletim com o que o anexos_edicao.py extraiu do zip (qualquer um dos
dois pode faltar; chegam no mesmo email mas nem sempre os dois) num único
resultado, no formato pedido: nº de documentos analisados, assuntos
novos, alterações, tarefas criadas, campanhas iniciadas/terminadas,
prazos desta semana, incidências críticas, documentos informativos e
erros de processamento — mais a ligação entre fornecedores, campanhas e
produtos mencionados na mesma edição."""

from datetime import date, timedelta

try:
    import anexos_edicao as anexos_mod
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from . import anexos_edicao as anexos_mod

_WEEK_WINDOW_DAYS = 7


def _parse_iso(d):
    try:
        return date.fromisoformat(d)
    except (TypeError, ValueError):
        return None


def _deadlines_this_week(digest):
    """Conta os itens da agenda de prazos do Correio Semanal cujo dia caia
    nos próximos 7 dias a partir da data de emissão do boletim (ou de hoje,
    se a data de emissão não tiver sido reconhecida)."""
    if not digest:
        return 0
    anchor = _parse_iso(digest.get("issue_date")) or date.today()
    horizon = anchor + timedelta(days=_WEEK_WINDOW_DAYS)
    count = 0
    for day in digest.get("deadlines_calendar") or []:
        d = _parse_iso(day.get("date_iso"))
        if d and anchor <= d <= horizon:
            count += len(day.get("items") or [])
    return count


def build_summary(digest, anexos, digest_diff, anexos_diff, prev_digest=None, prev_anexos=None):
    """digest = correio_semanal.extract_structured(...) ou None.
    anexos = anexos_edicao.process_zip(...) ou None.
    digest_diff = correio_semanal.diff_digest_versions(...) ou None.
    anexos_diff = anexos_edicao.diff_edicao_versions(...) ou None.
    prev_digest/prev_anexos = os mesmos resultados da edição anterior — só
    aqui para "campanhas terminadas" poder confirmar que um assunto que
    desapareceu era mesmo uma campanha (essa informação só existe do lado
    de quem já não está presente nesta edição)."""
    sections = (digest or {}).get("sections") or []
    files = (anexos or {}).get("files") or []

    documentos_analisados = len(sections) + len(files)

    assuntos_novos = 0
    if digest_diff:
        assuntos_novos += len(digest_diff.get("added_sections") or [])
    if anexos_diff:
        assuntos_novos += len(anexos_diff.get("new_files") or [])

    alteracoes = 0
    if digest_diff:
        alteracoes += len(digest_diff.get("removed_sections") or [])
        alteracoes += len(digest_diff.get("department_changes") or {})
    if anexos_diff:
        alteracoes += len(anexos_diff.get("updated_files") or [])
        alteracoes += anexos_diff.get("price_changes_count") or 0
        alteracoes += len(anexos_diff.get("removed_files") or [])

    campanhas_iniciadas = 0
    campanhas_terminadas = 0
    if digest_diff:
        prev_titles = set(digest_diff.get("removed_sections") or [])
        new_titles = set(digest_diff.get("added_sections") or [])
        camp_titles = {s["title"] for s in sections if s.get("category") == "campanha"}
        prev_camp_titles = {s["title"] for s in (prev_digest or {}).get("sections") or []
                             if s.get("category") == "campanha"}
        campanhas_iniciadas += len(new_titles & camp_titles)
        campanhas_terminadas += len(prev_titles & prev_camp_titles)
    if anexos_diff:
        camp_names = {f["path"].rsplit("/", 1)[-1] for f in files if f.get("category") == "campanha"}
        prev_camp_names = {f["path"].rsplit("/", 1)[-1] for f in (prev_anexos or {}).get("files") or []
                            if f.get("category") == "campanha"}
        new_names = {p.rsplit("/", 1)[-1] for p in (anexos_diff.get("new_files") or [])}
        removed_names = {p.rsplit("/", 1)[-1] for p in (anexos_diff.get("removed_files") or [])}
        campanhas_iniciadas += len(new_names & camp_names)
        campanhas_terminadas += len(removed_names & prev_camp_names)

    prazos_esta_semana = _deadlines_this_week(digest)

    incidencias_criticas = sum(
        1 for s in sections if s.get("category") == "incidencia" and s.get("severity") == "critico")
    incidencias_criticas += sum(
        1 for f in files if f.get("category") == "incidencia" and f.get("severity") == "critico")

    documentos_informativos = sum(1 for s in sections if s.get("severity") == "informacao")
    documentos_informativos += sum(1 for f in files if f.get("severity") == "informacao")

    erros_processamento = (anexos or {}).get("error_count") or 0

    tarefas_criadas = 0  # preenchido por server.py depois de criar as tarefas sugeridas

    stats = {
        "documentos_analisados": documentos_analisados,
        "assuntos_novos": assuntos_novos,
        "alteracoes": alteracoes,
        "tarefas_criadas": tarefas_criadas,
        "campanhas_iniciadas": campanhas_iniciadas,
        "campanhas_terminadas": campanhas_terminadas,
        "prazos_esta_semana": prazos_esta_semana,
        "incidencias_criticas": incidencias_criticas,
        "documentos_informativos": documentos_informativos,
        "erros_processamento": erros_processamento,
    }
    return {"stats": stats, "related_entities": related_entities(digest, anexos)}


def related_entities(digest, anexos):
    """Fornecedores, campanhas e produtos mencionados na mesma edição —
    ligação simples por chave partilhada (nome de marca, EAN/ITM, título de
    campanha), não um grafo completo: o suficiente para responder "que
    campanhas/fornecedores apareceram nesta edição" sem duplicar trabalho."""
    fornecedores = set()
    campanhas = set()
    for f in (anexos or {}).get("files") or []:
        if f.get("category") == "campanha":
            campanhas.add(f["path"].rsplit("/", 1)[-1])
        for sheet in f.get("extracted", {}).get("sheets", []):
            columns, labels = sheet.get("columns", {}), sheet.get("column_labels", {})
            marca_cols = [c for c, fs in columns.items() if "marca" in fs]
            if not marca_cols:
                continue
            marca_label = labels[marca_cols[0]]
            for row in sheet.get("rows", []):
                v = row.get(marca_label)
                if v:
                    fornecedores.add(str(v).strip())
    for s in (digest or {}).get("sections") or []:
        if s.get("category") == "campanha":
            campanhas.add(s["title"])

    produtos = set(anexos_mod.price_index(anexos).keys()) if anexos else set()

    return {
        "fornecedores": sorted(fornecedores)[:100],
        "campanhas": sorted(campanhas)[:100],
        "produtos_count": len(produtos),
    }


def render_text(stats):
    """Texto simples no formato pedido pelo utilizador, pronto a mostrar."""
    lines = [
        f"{stats['documentos_analisados']} documentos analisados.",
        f"{stats['assuntos_novos']} assuntos novos.",
        f"{stats['alteracoes']} alterações.",
        f"{stats['tarefas_criadas']} tarefas criadas.",
        f"{stats['campanhas_iniciadas']} campanhas iniciadas.",
        f"{stats['campanhas_terminadas']} campanhas terminadas.",
        f"{stats['prazos_esta_semana']} prazos esta semana.",
        f"{stats['incidencias_criticas']} incidência(s) crítica(s).",
        f"{stats['documentos_informativos']} documentos apenas informativos.",
        f"{stats['erros_processamento']} erros de processamento.",
    ]
    return "\n".join(lines)
