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


async def create_article_from_correio_semanal(db, *, email_id, correio_semanal_result):
    """Chamado a partir de poll_supplier_replies (server.py), logo a
    seguir a `db.received_emails.insert_one` — nunca bloqueia nem altera
    o processamento do Correio em si; falhas ficam só num log
    (ver o try/except no ponto de chamada)."""
    digest = (correio_semanal_result or {}).get("digest")
    if not digest or not digest.get("csn_number"):
        return None
    csn_number = digest["csn_number"]

    existing = await db.knowledge_articles.find_one(
        {"csn_number": csn_number, "article_type": "correio_semanal"}, {"_id": 0, "id": 1})
    if existing:
        return existing["id"]

    sections = _assign_action_ids(digest.get("sections") or [])
    important_count = sum(1 for s in sections if s.get("severity") in SEVERE_LEVELS)
    action_count = sum(1 for s in sections if s.get("action_id"))
    article_id = str(uuid.uuid4())
    now = _now_iso()

    # Copia os PDFs do email (db.email_attachments, ver server.py:
    # poll_supplier_replies) para db.attachments — o artigo é permanente e
    # tem de sobreviver independentemente do email que o originou.
    attachment_count = 0
    email_atts = await db.email_attachments.find({"email_id": email_id}, {"_id": 0}).to_list(20)
    for att in email_atts:
        if not (att.get("filename") or "").lower().endswith(".pdf"):
            continue
        content_b64 = att.get("content_b64") or ""
        await db.attachments.insert_one({
            "id": str(uuid.uuid4()), "owner_kind": "knowledge_article", "owner_id": article_id,
            "group_id": str(uuid.uuid4()), "version": 1, "filename": att["filename"],
            "content_type": "application/pdf", "size": len(base64.b64decode(content_b64)) if content_b64 else 0,
            "content_b64": content_b64, "created_at": now,
        })
        attachment_count += 1

    week_label = digest.get("week_label") or ""
    article = {
        "id": article_id, "article_type": "correio_semanal",
        "title": f"Correio Semanal {csn_number}" + (f" — {week_label}" if week_label else ""),
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
        "pending_actions_count": max(total_actions - done_tasks, 0), "updated_at": _now_iso(),
    }
