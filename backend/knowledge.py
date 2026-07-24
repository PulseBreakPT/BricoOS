"""Centro de Conhecimento — cada edição do Correio Semanal fica guardada
como um artigo permanente (db.knowledge_articles), independente do email
que a trouxe: secções agrupadas por assunto, ações ligadas a tarefas,
histórico de leitura e uma timeline de atividade. O módulo de Correio
(server.py: _process_correio_semanal, Emails.jsx) continua exatamente
como está — isto só acrescenta, no fim do processamento semanal, a
criação automática do artigo correspondente (ver server.py:
poll_supplier_replies, logo a seguir a `db.received_emails.insert_one`).

Só cobre `article_type="correio_semanal"` por agora — o campo já existe
para o futuro (outros tipos de documento), mas não há carregamento
manual nesta fase."""

import base64
import unicodedata
import uuid
from datetime import datetime, timezone

try:
    import notifications
    import severity as severity_engine
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from . import notifications
    from . import severity as severity_engine


# Data da última alteração relevante ao motor de extração/classificação/
# agrupamento — texto (não número), para se perceber de imediato "quando"
# um artigo foi processado e comparar ao longo do tempo. Incrementada à
# mão sempre que o motor mudar de forma que valha a pena reprocessar
# edições antigas (não há deteção automática — é uma decisão humana ao
# editar este ficheiro, como as outras migrações desta sessão).
ENGINE_VERSION = "2026.07.24-legibilidade"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _fold(text):
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c)).lower().strip()


# Agrupa a taxonomia já existente (classification_rules.classify) nas 7
# secções pedidas — camada de apresentação, não altera a classificação
# em si nem o que é guardado por extract_structured.
_CATEGORY_TO_BUCKET = {
    "campanha": "campanhas", "catalogo": "campanhas",
    "tabela_precos": "precos",
    "dossier_gama": "produtos", "nota_encomenda": "produtos",
    "lista_limpeza": "procedimentos", "planograma": "procedimentos",
    "tecnico": "procedimentos", "informativo": "procedimentos",
    "incidencia": "procedimentos", "outro": "procedimentos",
}
BUCKET_META = {
    "campanhas": {"emoji": "📢", "label": "Campanhas e promoções"},
    "precos": {"emoji": "💰", "label": "Alterações de preços e margens"},
    "produtos": {"emoji": "📦", "label": "Novos produtos e gamas"},
    "procedimentos": {"emoji": "🏪", "label": "Procedimentos da loja"},
    "acoes": {"emoji": "⚠️", "label": "Ações obrigatórias"},
    "datas": {"emoji": "📅", "label": "Datas importantes"},
    "anexos": {"emoji": "📎", "label": "Documentos anexados"},
}
SEVERE_LEVELS = ("critico", "urgente", "importante")


def _assign_action_ids(sections):
    """Uma secção "é" uma ação obrigatória quando tem uma marcação (A
    Encomendar/A Fazer) ou pede resposta de adesão — ganha aqui um
    `action_id` estável, usado depois para ligar tarefas específicas
    (POST /knowledge/articles/{id}/create-task) e calcular o estado de
    implementação por ação."""
    out = []
    for section in sections:
        s = dict(section)
        if s.get("checked_actions") or s.get("requires_adhesion_email"):
            s["action_id"] = str(uuid.uuid4())
        out.append(s)
    return out


def group_sections_by_bucket(sections, deadlines_calendar, attachment_count):
    grouped = {"campanhas": [], "precos": [], "produtos": [], "procedimentos": [], "acoes": []}
    for section in sections:
        bucket = _CATEGORY_TO_BUCKET.get(section.get("category"), "procedimentos")
        grouped[bucket].append(section)
        if section.get("action_id"):
            grouped["acoes"].append(section)
    result = []
    for key in ("campanhas", "precos", "produtos", "procedimentos", "acoes"):
        if grouped[key]:
            result.append({"key": key, **BUCKET_META[key], "items": grouped[key]})
    if deadlines_calendar:
        result.append({"key": "datas", **BUCKET_META["datas"], "items": deadlines_calendar})
    if attachment_count:
        result.append({"key": "anexos", **BUCKET_META["anexos"], "count": attachment_count})
    return result


def _exec_item_text(key, n):
    """Frase de um item do Resumo Executivo para um bucket com `n`
    elementos — só chamada para buckets não vazios (n > 0), nunca inventa
    um número que não esteja já contado noutro sítio (`important_count`,
    `action_count`, `attachment_count`, ou a própria contagem do bucket)."""
    if key == "campanhas":
        return f"{n} {'tema' if n == 1 else 'temas'} de campanhas e promoções"
    if key == "precos":
        return f"{n} {'alteração' if n == 1 else 'alterações'} de preços e margens"
    if key == "produtos":
        return f"{n} {'produto ou gama nova' if n == 1 else 'produtos e gamas novas'}"
    if key == "procedimentos":
        return f"{n} {'procedimento' if n == 1 else 'procedimentos'} da loja"
    if key == "acoes":
        return f"{n} {'ação obrigatória' if n == 1 else 'ações obrigatórias'}"
    if key == "datas":
        return f"{n} {'data importante' if n == 1 else 'datas importantes'}"
    if key == "anexos":
        return f"{n} {'documento anexado' if n == 1 else 'documentos anexados'}"
    return None


def _exec_period_text(article):
    calendar = article.get("deadlines_calendar") or []
    dates = [d.get("date") for d in calendar if d.get("date")]
    if len(dates) >= 2:
        return f"Período com prazos entre {dates[0]} e {dates[-1]}"
    if dates:
        return f"Prazos a partir de {dates[0]}"
    if article.get("week_label"):
        return f"Edição {article['week_label']}"
    if article.get("issue_date"):
        return f"Edição de {article['issue_date']}"
    return None


def build_executive_summary(article):
    """Até 5 frases geradas a partir de campos já guardados no artigo —
    nunca IA, nunca inventa números (só conta o que já está calculado).
    Um item por bucket não vazio (mesma ordem/chaves de
    `group_sections_by_bucket`), com `bucket_key` para o frontend poder
    fazer scroll até essa secção ao tocar no item (Resumo Executivo
    clicável); quando sobra espaço, completa com um item de período e um
    de novidades desde a edição anterior — esses dois sem `bucket_key`
    (não correspondem a nenhuma secção específica). Calculado a pedido, a
    partir do artigo já carregado — não depende de reprocessamento."""
    grouped = group_sections_by_bucket(
        article.get("sections") or [], article.get("deadlines_calendar") or [],
        article.get("attachment_count") or 0)
    items = []
    for bucket in grouped:
        if len(items) >= 5:
            break
        key = bucket["key"]
        if key == "anexos":
            count = bucket.get("count") or 0
        elif key == "datas":
            count = sum(len(d.get("items") or []) for d in bucket.get("items") or [])
        else:
            count = len(bucket.get("items") or [])
        if not count:
            continue
        items.append({"text": _exec_item_text(key, count), "bucket_key": key})

    if len(items) < 5:
        period = _exec_period_text(article)
        if period:
            items.append({"text": period, "bucket_key": None})
    if len(items) < 5:
        added = (article.get("diff_since_previous") or {}).get("added_sections") or []
        if added:
            n = len(added)
            noun = "novidade" if n == 1 else "novidades"
            items.append({"text": f"{n} {noun} desde a edição anterior", "bucket_key": None})
    return items[:5]


def _top_highlights(sections, limit=3):
    ranked = sorted(
        (s for s in sections if s.get("severity") in SEVERE_LEVELS),
        key=lambda s: severity_engine.LEVEL_RANK.get(s.get("severity"), 99))
    return [s["title"] for s in ranked[:limit]]


async def recurring_themes(db, article, lookback=8):
    """Temas (por título de secção, comparado sem acentos/maiúsculas) que já
    apareceram nalguma das últimas `lookback` edições — diff_digest_versions
    só compara com a edição imediatamente anterior; isto olha mais para
    trás, para apanhar assuntos que voltam a aparecer passadas várias
    semanas, não só de uma semana para a outra."""
    prev_articles = await db.knowledge_articles.find(
        {"article_type": "correio_semanal", "id": {"$ne": article["id"]},
         "csn_number": {"$ne": article.get("csn_number")}},
        {"_id": 0, "sections.title": 1},
    ).sort("created_at", -1).limit(lookback).to_list(lookback)
    current_by_fold = {_fold(s["title"]): s["title"] for s in article.get("sections", [])}
    seen_before = set()
    for prev in prev_articles:
        for section in prev.get("sections", []):
            seen_before.add(_fold(section.get("title", "")))
    return [title for fold, title in current_by_fold.items() if fold in seen_before]


async def implementation_state(db, article):
    """Por cada secção com `action_id`: sem tarefa ligada → "não
    iniciada"; tarefa todo/in_progress → "em curso"; tarefa done →
    "concluída". Calculado a pedido (não guardado) porque muda sempre que
    uma tarefa ligada muda de estado, sem o artigo ter de saber disso."""
    action_sections = [s for s in article.get("sections", []) if s.get("action_id")]
    if not action_sections:
        return {"items": [], "percent": None}
    action_ids = [s["action_id"] for s in action_sections]
    linked = await db.tasks.find(
        {"source_article_id": article["id"], "source_action_id": {"$in": action_ids}},
        {"_id": 0, "id": 1, "source_action_id": 1, "status": 1, "done": 1},
    ).to_list(200)
    by_action = {}
    for t in linked:
        by_action.setdefault(t["source_action_id"], []).append(t)
    items = []
    done_count = 0
    for section in action_sections:
        related = by_action.get(section["action_id"], [])
        if not related:
            state = "nao_iniciada"
        elif any((t.get("status") or ("done" if t.get("done") else "todo")) == "done" for t in related):
            state = "concluida"
            done_count += 1
        else:
            state = "em_curso"
        items.append({
            "action_id": section["action_id"], "title": section["title"], "state": state,
            "task_id": related[0]["id"] if related else None,
        })
    percent = round(100 * done_count / len(action_sections))
    return {"items": items, "percent": percent}


async def log_activity(db, article_id, type_, message):
    await db.knowledge_article_history.insert_one({
        "id": str(uuid.uuid4()), "article_id": article_id, "type": type_,
        "message": message, "created_at": _now_iso()})


async def _copy_email_attachments(db, email_id, article_id, existing_filenames=()):
    """Copia os PDFs do email (db.email_attachments, ver server.py:
    poll_supplier_replies/_process_correio_semanal_email) para
    db.attachments — o artigo é permanente e tem de sobreviver
    independentemente do email que o originou. `existing_filenames` evita
    duplicar PDFs já copiados numa atualização (reprocessamento)."""
    copied = 0
    now = _now_iso()
    email_atts = await db.email_attachments.find({"email_id": email_id}, {"_id": 0}).to_list(20)
    for att in email_atts:
        filename = att.get("filename") or ""
        if not filename.lower().endswith(".pdf") or filename in existing_filenames:
            continue
        content_b64 = att.get("content_b64") or ""
        await db.attachments.insert_one({
            "id": str(uuid.uuid4()), "owner_kind": "knowledge_article", "owner_id": article_id,
            "group_id": str(uuid.uuid4()), "version": 1, "filename": filename,
            "content_type": "application/pdf", "size": len(base64.b64decode(content_b64)) if content_b64 else 0,
            "content_b64": content_b64, "created_at": now,
        })
        copied += 1
    return copied


async def upsert_article_from_correio_semanal(db, *, email_id, correio_semanal_result):
    """Chamado a partir de poll_supplier_replies (processamento automático
    de um email novo) e de _process_correio_semanal_email (botão manual,
    lote de importação/reprocessamento, verificação automática ao
    arrancar) — nunca bloqueia nem altera o processamento do Correio em
    si. Cria o artigo se for a primeira vez que esta edição (csn_number)
    é vista; caso já exista, atualiza-o no próprio lugar em vez de o
    ignorar ou duplicar — mantém `id`, favoritos, arquivo, etiquetas e
    histórico de leitura."""
    digest = (correio_semanal_result or {}).get("digest")
    if not digest or not digest.get("csn_number"):
        return None
    csn_number = digest["csn_number"]

    sections = _assign_action_ids(digest.get("sections") or [])
    important_count = sum(1 for s in sections if s.get("severity") in SEVERE_LEVELS)
    action_count = sum(1 for s in sections if s.get("action_id"))
    now = _now_iso()
    week_label = digest.get("week_label") or ""
    title = f"Correio Semanal {csn_number}" + (f" — {week_label}" if week_label else "")

    existing = await db.knowledge_articles.find_one(
        {"csn_number": csn_number, "article_type": "correio_semanal"}, {"_id": 0})

    if existing:
        article_id = existing["id"]
        existing_filenames = set()
        async for att in db.attachments.find(
                {"owner_kind": "knowledge_article", "owner_id": article_id}, {"_id": 0, "filename": 1}):
            existing_filenames.add(att.get("filename"))
        new_attachments = await _copy_email_attachments(db, email_id, article_id, existing_filenames)
        update = {
            "title": title, "week_label": week_label, "issue_date": digest.get("issue_date") or "",
            "email_id": email_id, "sections": sections,
            "deadlines_calendar": digest.get("deadlines_calendar") or [],
            "by_category": digest.get("by_category") or {}, "by_severity": digest.get("by_severity") or {},
            "important_count": important_count, "action_count": action_count,
            "attachment_count": (existing.get("attachment_count") or 0) + new_attachments,
            "highlights": _top_highlights(sections),
            "diff_since_previous": correio_semanal_result.get("diff"),
            "engine_version": ENGINE_VERSION, "last_processed_at": now,
            "reprocess_count": (existing.get("reprocess_count") or 0) + 1,
            "last_error": None, "last_error_at": None, "updated_at": now,
        }
        await db.knowledge_articles.update_one({"id": article_id}, {"$set": update})
        await log_activity(db, article_id, "reprocessed", "Artigo atualizado (reprocessado)")
        return article_id

    article_id = str(uuid.uuid4())
    attachment_count = await _copy_email_attachments(db, email_id, article_id)
    article = {
        "id": article_id, "article_type": "correio_semanal", "title": title,
        "csn_number": csn_number, "week_label": week_label,
        "issue_date": digest.get("issue_date") or "", "email_id": email_id,
        "sections": sections, "deadlines_calendar": digest.get("deadlines_calendar") or [],
        "by_category": digest.get("by_category") or {}, "by_severity": digest.get("by_severity") or {},
        "important_count": important_count, "action_count": action_count,
        "attachment_count": attachment_count, "highlights": _top_highlights(sections),
        "tags": sorted((digest.get("by_category") or {}).keys()),
        "read_count": 0, "first_read_at": None, "last_read_at": None,
        "pinned": False, "archived": False, "archived_at": None,
        "diff_since_previous": correio_semanal_result.get("diff"),
        "engine_version": ENGINE_VERSION, "last_processed_at": now, "reprocess_count": 0,
        "last_error": None, "last_error_at": None,
        "created_at": now, "updated_at": now,
    }
    await db.knowledge_articles.insert_one(dict(article))

    await log_activity(db, article_id, "received", "Correio recebido")
    await log_activity(db, article_id, "summarized", "Resumo gerado")
    await log_activity(db, article_id, "created", "Artigo criado")
    created_tasks = correio_semanal_result.get("suggested_tasks_created") or 0
    if created_tasks:
        plural = "s" if created_tasks != 1 else ""
        await log_activity(db, article_id, "tasks_created",
                            f"{created_tasks} tarefa{plural} sugerida{plural} criada{plural}")

    await notifications.create_notification(
        db, dedup_key=f"knowledge-{csn_number}", category="knowledge_new_article",
        title="Novo artigo no Centro de Conhecimento",
        body=article["title"], url=f"/conhecimento?open={article_id}")
    return article_id


async def mark_processing_error(db, email_id, message):
    """Chamado por _process_correio_semanal_email (server.py) quando o
    processamento de um email falha — grava no email (para o badge em
    Emails.jsx) e, se já existir artigo, também nele (para
    KnowledgeArticleDialog), sem as duas superfícies se terem de cruzar."""
    now = _now_iso()
    await db.received_emails.update_one(
        {"id": email_id},
        {"$set": {"correio_semanal_process_error": message, "correio_semanal_process_error_at": now},
         "$inc": {"correio_semanal_process_error_count": 1}})
    await db.knowledge_articles.update_one(
        {"email_id": email_id}, {"$set": {"last_error": message, "last_error_at": now}})


def processing_status(email_doc, article):
    """Um só sítio a decidir o estado — reaproveitado pelo endpoint de
    estado (Emails.jsx/Knowledge.jsx) e por get_stats."""
    error = (email_doc or {}).get("correio_semanal_process_error")
    error_at = (email_doc or {}).get("correio_semanal_process_error_at")
    if error and (not article or (error_at or "") >= (article.get("last_processed_at") or "")):
        return "erro"
    if not article:
        return "nao_processado"
    if (article.get("engine_version") or "") != ENGINE_VERSION:
        return "desatualizado"
    return "processado"


async def register_open(db, article_id):
    article = await db.knowledge_articles.find_one({"id": article_id}, {"_id": 0, "read_count": 1})
    if not article:
        return False
    now = _now_iso()
    update = {"$set": {"last_read_at": now}, "$inc": {"read_count": 1}}
    if not article.get("read_count"):
        update["$set"]["first_read_at"] = now
        await log_activity(db, article_id, "read", "Marcado como lido")
    await db.knowledge_articles.update_one({"id": article_id}, update)
    return True


def build_task_from_action(article, action_id):
    """Campos para criar uma tarefa a partir de uma ação específica do
    artigo (POST /knowledge/articles/{id}/create-task) — distinto das
    tarefas sugeridas automáticas do Correio (essas continuam a existir
    tal e qual, criadas por server.py: _process_correio_semanal)."""
    section = next((s for s in article.get("sections", []) if s.get("action_id") == action_id), None)
    if not section:
        return None
    priority = severity_engine.LEVEL_TO_TASK_PRIORITY.get(section.get("severity"), "media")
    action_text = ", ".join(section.get("checked_actions") or []) or "Responder por email"
    return {
        "title": f"[{article.get('title')}] {action_text}: {section['title']}",
        "priority": priority, "category": "construcao",
        "source_article_id": article["id"], "source_action_id": action_id,
    }


async def get_stats(db):
    last_list = await db.knowledge_articles.find(
        {"article_type": "correio_semanal"}, {"_id": 0, "created_at": 1},
    ).sort("created_at", -1).limit(1).to_list(1)
    last_edition_at = last_list[0]["created_at"] if last_list else None
    unread_count = await db.knowledge_articles.count_documents(
        {"archived": {"$ne": True}, "read_count": {"$in": [0, None]}})
    total_articles = await db.knowledge_articles.count_documents({"archived": {"$ne": True}})
    # Ações pendentes: aproximação barata (nº de ações registadas menos
    # tarefas concluídas ligadas a artigos) — o cálculo exato por artigo
    # é implementation_state(), caro de somar em todos os artigos só para
    # um número no Dashboard.
    total_actions = 0
    async for a in db.knowledge_articles.find({"archived": {"$ne": True}}, {"_id": 0, "action_count": 1}):
        total_actions += a.get("action_count") or 0
    done_tasks = await db.tasks.count_documents({"source_article_id": {"$ne": ""}, "status": "done"})
    return {
        "last_edition_at": last_edition_at, "unread_count": unread_count,
        "total_articles": total_articles, "engine_version": ENGINE_VERSION,
        "pending_actions_count": max(total_actions - done_tasks, 0), "updated_at": _now_iso(),
    }
