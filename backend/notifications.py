"""Notificações persistentes — o registo de cada evento (db.notifications)
fica gravado antes de qualquer tentativa de envio, para nunca depender só
da entrega ao dispositivo: mesmo que o push falhe, o dispositivo esteja
sem notificações ativas, ou simplesmente offline, o evento continua
visível no Centro de Operações assim que a app for aberta — não
desaparece sozinho, só sai por leitura/arquivo explícitos.

`create_notification` é o único ponto de entrada: todo o código que hoje
avisa o utilizador (email novo, orçamento do fornecedor, tarefa urgente,
...) passa a chamar esta função, nunca `push_notifications` diretamente.
Isto dá, de borla, deduplicação (por `dedup_key`), histórico e repetição
automática em falhas de entrega.

Estados do ciclo de vida de uma notificação (substituem o antigo
unread/read/archived, mais simples): "new" (nova, nunca vista) -> "seen"
(vista) -> opcionalmente "tracking" (em acompanhamento manual) ou
"snoozed" (adiada) -> "resolved" (a situação já não se aplica, automática
ou manualmente) -> "archived" (arquivada, terminal). Uma categoria
"evolutiva" (EVOLVING_CATEGORIES) pode reabrir uma notificação já fora de
vista para "new" quando a mesma situação volta a acontecer — ver
`_evolve`."""

import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone

try:
    import push_notifications
    import app_settings
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from . import push_notifications
    from . import app_settings

# Sincronização em tempo real (GET /notifications/stream, server.py) — um
# "hub" simples em memória: cada separador aberto tem a sua própria fila,
# e qualquer alteração (criar, ler, arquivar, entregar) é publicada a
# todas. Seguro porque o deploy é um único processo backend (ver
# deploy/docker-compose.yml, sem réplicas) — com múltiplas réplicas, isto
# passaria a precisar de Mongo change streams ou Redis.
_subscribers = set()


def subscribe():
    queue = asyncio.Queue(maxsize=100)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue):
    _subscribers.discard(queue)


# "Silêncio operacional": eventos que tendem a chegar em rajada sobre a
# MESMA notificação (uma situação a evoluir/ser resolvida em cascata em
# poucos segundos) são agrupados numa única emissão, para o painel não
# "piscar" a cada mudança interna. Eventos de transição discreta que o
# operador espera ver de imediato (criada, resolvida, arquivada, fixada,
# adiada, acordada) nunca esperam.
BROADCAST_DEBOUNCE_SECONDS = 2
_COALESCE_EVENTS = {"updated", "reopened"}
_pending_broadcasts = {}  # notification_id -> asyncio.Task


def _broadcast_now(event_type, notification_id):
    event = {"type": event_type, "id": notification_id}
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass  # separador lento — perde um evento de sincronização, não a notificação em si (essa continua em db.notifications)


def _broadcast(event_type, notification_id):
    if event_type not in _COALESCE_EVENTS:
        _broadcast_now(event_type, notification_id)
        return
    existing = _pending_broadcasts.get(notification_id)
    if existing and not existing.done():
        return  # já há uma emissão agendada para esta notificação nesta janela

    async def _emit():
        await asyncio.sleep(BROADCAST_DEBOUNCE_SECONDS)
        _broadcast_now(event_type, notification_id)
        _pending_broadcasts.pop(notification_id, None)

    _pending_broadcasts[notification_id] = asyncio.create_task(_emit())


# Prioridade fixa por categoria — não configurável, para não virar mais 50
# campos de definições. `create_notification(..., priority=...)` permite a
# um chamador específico escalar/desescalar caso a caso (ex.: um problema
# de qualidade "warning" é menos grave que um "error").
CATEGORY_PRIORITY = {
    "quote_quality_issue": "critica",
    "urgent": "critica",
    "task_urgent": "critica",
    "client": "alta",
    "quote_changed": "alta",
    "waiting_supplier": "alta",
    "task_reminder": "alta",
    "tasks_overdue_digest": "alta",
    "supplier": "media",
    "forgotten": "media",
    "reminder_overdue": "media",
    "deadline_approaching": "media",
    "processing_error": "media",
    "client_new_note": "media",
    "bricoaval_backfill": "media",
    "unmatched": "baixa",
}

# Escala de prioridade de NOTIFICAÇÕES (baixa=0..critica=3) — deliberadamente
# NÃO chamada PRIORITY_RANK: server.py já tem uma constante com esse nome
# para prioridade de PEDIDOS, com escala invertida e labels diferentes
# (urgente=0..baixa=3). Usar o mesmo nome aqui, com sentido oposto, seria
# uma armadilha para quem ler o código mais tarde.
NOTIF_PRIORITY_RANK = {"baixa": 0, "media": 1, "alta": 2, "critica": 3}
NOTIF_PRIORITY_BY_RANK = {v: k for k, v in NOTIF_PRIORITY_RANK.items()}

# Categorias cujo dedup_key é estável e reutilizável ao longo do tempo (uma
# chave por SITUAÇÃO, não por ocorrência) — só estas "evoluem" (atualizam a
# notificação existente) num hit de dedup_key; as restantes têm dedup_key
# único por ocorrência (file_id/email_id/contagem embutida na própria
# chave) — "evoluir" aí não corresponde à mesma situação, seria sempre uma
# ocorrência nova a criar.
EVOLVING_CATEGORIES = {
    "task_reminder", "tasks_overdue_digest", "processing_error",
}

# Texto fixo por categoria — o "Motivo" mostrado no card (regra que gerou a
# notificação, não a instância concreta — essa é o body).
CATEGORY_REASON = {
    "waiting_supplier": "Regra: pedido em «Aguarda fornecedor» há mais dias do que o prazo (SLA) definido.",
    "deadline_approaching": "Regra: faltam poucos dias para o prazo (SLA) do pedido terminar.",
    "forgotten": "Regra: pedido parado, sem avançar de estado, há mais dias do que o prazo definido.",
    "urgent": "Regra: pedido marcado com prioridade urgente.",
    "reminder_overdue": "Regra: tarefa com lembrete cuja data limite já passou.",
    "task_urgent": "Regra: tarefa criada/confirmada com prioridade alta.",
    "task_reminder": "Regra: o lembrete configurado na tarefa atingiu a hora definida.",
    "tasks_overdue_digest": "Regra: existem tarefas com data limite ultrapassada, por concluir.",
    "quote_quality_issue": "Regra: a leitura automática do PDF do fornecedor encontrou inconsistências.",
    "quote_changed": "Regra: o orçamento do fornecedor mudou desde a versão anterior.",
    "processing_error": "Regra: falha ao processar um PDF recebido por email.",
    "bricoaval_backfill": "Regra: encontrado histórico de emails com o mesmo nº BricoAval do pedido.",
    "client_new_note": "Regra: um cliente enviou um novo pedido por email.",
    "client": "Regra: novo email recebido, identificado como resposta de cliente.",
    "supplier": "Regra: novo email recebido, identificado como resposta de fornecedor.",
    "unmatched": "Regra: novo email recebido sem associação automática a um pedido/fornecedor.",
}

# Dias até uma notificação efémera expirar sozinha (arquivo automático) —
# só categorias cujo valor informativo cai naturalmente com o tempo.
EXPIRES_AFTER_DAYS = {
    "task_reminder": 3, "tasks_overdue_digest": 2,
    "bricoaval_backfill": 30,
}

# Backoff entre tentativas de entrega (minutos) — 1, 5, 15, 60, 120, 240;
# ao fim de 6 tentativas falhadas essa entrega fica "failed" em definitivo
# (só a entrega àquele dispositivo, nunca a notificação em si).
RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 120, 240]
MAX_DELIVERY_ATTEMPTS = len(RETRY_BACKOFF_MINUTES)

_TERMINAL = {"resolved", "archived"}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def priority_for(category, override=None):
    return override or CATEGORY_PRIORITY.get(category, "media")


async def _eligible_devices(db):
    """Dispositivos que podem mesmo receber um push agora: subscrição
    técnica válida, intenção ligada (push_enabled) e sessão ativa (não
    bloqueados/sem PIN — ver server.py: POST /auth/lock). Notificações
    desligadas por omissão em cada dispositivo — só entram aqui depois de
    o próprio utilizador ativar nesse aparelho (ou remotamente, na página
    Dispositivos)."""
    return await db.auth_devices.find(
        {"push_subscription": {"$exists": True}, "push_enabled": True,
         "session_active": {"$ne": False}},
        {"_id": 0}).to_list(200)


async def _log(db, notif_id, event, detail=""):
    await db.notification_logs.insert_one({
        "notification_id": notif_id, "event": event, "device_id": None,
        "at": _now_iso(), "detail": detail})


async def create_notification(db, *, dedup_key, category, title, body, url="/",
                                note_id=None, task_id=None, priority=None):
    """Idempotente por `dedup_key`: uma segunda chamada com a mesma chave
    nunca duplica. Para categorias evolutivas (EVOLVING_CATEGORIES), em vez
    de simplesmente ignorar a repetição, ATUALIZA a notificação existente
    (ver `_evolve`) — para as restantes, comportamento inalterado: devolve
    o id já existente sem tocar em nada. Respeita `notification_prefs` —
    uma categoria desligada nem sequer fica registada. Devolve o id da
    notificação, ou None se a categoria estiver desligada."""
    existing = await db.notifications.find_one({"dedup_key": dedup_key}, {"_id": 0})
    if existing:
        if category not in EVOLVING_CATEGORIES:
            return existing["id"]
        return await _evolve(db, existing, category, title, body, priority)

    prefs = await app_settings.get_group(db, "notification_prefs")
    if not prefs.get(category, True):
        return None

    notif_id = str(uuid.uuid4())
    now = _now_iso()
    devices = await _eligible_devices(db)
    deliveries = [{
        "device_id": d["id"], "status": "pending", "attempts": 0,
        "next_retry_at": now, "delivered_at": None, "error": None,
        "ack_token": secrets.token_urlsafe(16),
    } for d in devices]
    expires_at = None
    if category in EXPIRES_AFTER_DAYS:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=EXPIRES_AFTER_DAYS[category])).isoformat()
    doc = {
        "id": notif_id, "dedup_key": dedup_key, "category": category,
        "priority": priority_for(category, priority),
        "title": title, "body": body, "url": url,
        "note_id": note_id, "task_id": task_id, "email_id": None, "supplier_id": None,
        "status": "new", "created_at": now, "updated_at": now, "read_at": None, "archived_at": None,
        "occurrence_count": 1, "pinned": False, "snoozed_until": None,
        "resolved_at": None, "resolved_by": None,
        "reason": CATEGORY_REASON.get(category, body),
        "expires_at": expires_at,
        "has_pending_delivery": bool(deliveries),
        "deliveries": deliveries,
    }
    try:
        await db.notifications.insert_one(dict(doc))
    except Exception:
        # Corrida entre dois pedidos com o mesmo dedup_key — o índice único
        # já garantiu que só um ficou gravado; devolve esse.
        existing = await db.notifications.find_one({"dedup_key": dedup_key}, {"_id": 0, "id": 1})
        return existing["id"] if existing else None

    await _log(db, notif_id, "created", f"{len(devices)} dispositivo(s) elegível(eis)")
    _broadcast("created", notif_id)

    if devices:
        vapid_keys = await push_notifications.get_vapid_keys(db)
        for device, delivery in zip(devices, deliveries):
            await _attempt_delivery(db, notif_id, doc, device, delivery, vapid_keys)
    return notif_id


async def _evolve(db, existing, category, title, body, priority):
    """Uma segunda ocorrência da MESMA situação (dedup_key repetido,
    categoria evolutiva) atualiza a notificação existente em vez de a
    ignorar: novo título/corpo, contador de ocorrências, timestamp bumped —
    e, se a pessoa já tinha visto/adiado/resolvido/arquivado, reabre para
    "new" porque a situação voltou a acontecer e merece atenção outra vez."""
    notif_id = existing["id"]
    update = {"title": title, "body": body, "updated_at": _now_iso(),
              "occurrence_count": existing.get("occurrence_count", 1) + 1}
    was_out_of_sight = existing["status"] != "new"
    if existing["status"] in ("seen", "tracking", "resolved", "archived"):
        update.update({"status": "new", "read_at": None, "resolved_at": None,
                        "resolved_by": None, "archived_at": None, "snoozed_until": None})
    elif existing["status"] == "snoozed":
        update.update({"status": "new", "snoozed_until": None})
    if priority:
        update["priority"] = priority_for(category, priority)
    await db.notifications.update_one({"id": notif_id}, {"$set": update})
    await _log(db, notif_id, "updated", f"ocorrência #{update['occurrence_count']}")
    if was_out_of_sight:
        await _log(db, notif_id, "reopened", "")
    _broadcast("updated", notif_id)

    # Reenvia push só se tinha saído de vista — evita spam a cada ciclo do
    # scan periódico (5 min) enquanto o utilizador já a tem aberta como "new".
    if was_out_of_sight:
        doc = await db.notifications.find_one({"id": notif_id}, {"_id": 0})
        devices = await _eligible_devices(db)
        if devices:
            vapid_keys = await push_notifications.get_vapid_keys(db)
            new_deliveries = [{
                "device_id": d["id"], "status": "pending", "attempts": 0,
                "next_retry_at": _now_iso(), "delivered_at": None, "error": None,
                "ack_token": secrets.token_urlsafe(16),
            } for d in devices]
            await db.notifications.update_one({"id": notif_id}, {"$set": {
                "deliveries": new_deliveries, "has_pending_delivery": True}})
            for device, delivery in zip(devices, new_deliveries):
                await _attempt_delivery(db, notif_id, doc, device, delivery, vapid_keys)
    return notif_id


async def _attempt_delivery(db, notif_id, doc, device, delivery, vapid_keys):
    payload = {
        "title": doc["title"], "body": doc["body"], "url": doc["url"],
        "tag": doc["category"], "notification_id": notif_id,
        "ack": delivery["ack_token"], "priority": doc["priority"],
    }
    ok = await push_notifications.send_to_device(db, device, payload, vapid_keys)
    attempts = delivery["attempts"] + 1
    if ok:
        status, next_retry, error = "sent", None, None
    elif attempts >= MAX_DELIVERY_ATTEMPTS:
        status, next_retry, error = "failed", None, "limite de tentativas excedido"
    else:
        wait = RETRY_BACKOFF_MINUTES[min(attempts - 1, len(RETRY_BACKOFF_MINUTES) - 1)]
        status = "pending"
        next_retry = (datetime.now(timezone.utc) + timedelta(minutes=wait)).isoformat()
        error = "falha de envio, nova tentativa agendada"
    await db.notifications.update_one(
        {"id": notif_id, "deliveries.device_id": device["id"]},
        {"$set": {
            "deliveries.$.status": status, "deliveries.$.attempts": attempts,
            "deliveries.$.next_retry_at": next_retry, "deliveries.$.error": error,
        }})
    await _log(db, notif_id, "sent" if ok else "send_attempt", error or "")
    await _refresh_pending_flag(db, notif_id)


async def _refresh_pending_flag(db, notif_id):
    doc = await db.notifications.find_one({"id": notif_id}, {"_id": 0, "deliveries": 1})
    if not doc:
        return
    pending = any(d["status"] == "pending" for d in doc.get("deliveries") or [])
    await db.notifications.update_one({"id": notif_id}, {"$set": {"has_pending_delivery": pending}})


async def retry_pending_deliveries(db, limit=50):
    """Chamado pelo laço de fundo (_notification_retry_loop, server.py) a
    cada poucos minutos: repete só as entregas ainda pendentes cujo
    próximo instante de tentativa já passou. Um dispositivo que deixou de
    ser elegível entretanto (revogado, desligado, bloqueado) não é
    reenviado — fica marcado "failed" nessa entrega, sem gastar mais
    tentativas num alvo que já sabemos que não vai receber."""
    now = _now_iso()
    retried = 0
    vapid_keys = None
    async for doc in db.notifications.find({"has_pending_delivery": True}, {"_id": 0}).limit(limit):
        due = [d for d in doc.get("deliveries") or []
               if d["status"] == "pending" and (d.get("next_retry_at") or "") <= now]
        if not due:
            continue
        device_ids = [d["device_id"] for d in due]
        devices_by_id = {d["id"]: d async for d in db.auth_devices.find(
            {"id": {"$in": device_ids}}, {"_id": 0})}
        for delivery in due:
            device = devices_by_id.get(delivery["device_id"])
            if not device or not device.get("push_subscription") or not device.get("push_enabled") \
                    or device.get("session_active") is False:
                await db.notifications.update_one(
                    {"id": doc["id"], "deliveries.device_id": delivery["device_id"]},
                    {"$set": {"deliveries.$.status": "failed",
                              "deliveries.$.error": "dispositivo já não elegível"}})
                continue
            if vapid_keys is None:
                vapid_keys = await push_notifications.get_vapid_keys(db)
            await _attempt_delivery(db, doc["id"], doc, device, delivery, vapid_keys)
            retried += 1
        await _refresh_pending_flag(db, doc["id"])
    return retried


async def ack_delivery(db, notif_id, ack_token):
    """Confirmação de entrega vinda do próprio service worker — sem token
    de dispositivo (o SW não tem acesso a localStorage); o `ack_token`,
    aleatório e de uso único por entrega, já é o segredo que autoriza esta
    chamada (ver server.py: AUTH_EXEMPT_PREFIXES)."""
    result = await db.notifications.update_one(
        {"id": notif_id, "deliveries.ack_token": ack_token},
        {"$set": {"deliveries.$.status": "delivered", "deliveries.$.delivered_at": _now_iso()}})
    if result.matched_count:
        await _log(db, notif_id, "delivered", "")
        await _refresh_pending_flag(db, notif_id)
    return bool(result.matched_count)


# ---- Estados (§4) ----

async def mark_seen(db, notif_id):
    """"new" -> "seen". Endpoint mantém o nome POST /notifications/{id}/read
    por compatibilidade — só o valor gravado muda de "read" p/ "seen"."""
    result = await db.notifications.update_one(
        {"id": notif_id, "status": "new"}, {"$set": {"status": "seen", "read_at": _now_iso()}})
    if result.modified_count:
        await _log(db, notif_id, "read", "")
        _broadcast("read", notif_id)
    return bool(result.matched_count)


async def mark_seen_bulk(db, ids):
    now = _now_iso()
    result = await db.notifications.update_many(
        {"id": {"$in": ids}, "status": "new"}, {"$set": {"status": "seen", "read_at": now}})
    for notif_id in ids:
        _broadcast("read", notif_id)
    return result.modified_count


async def track(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": {"$nin": list(_TERMINAL) + ["snoozed"]}},
        {"$set": {"status": "tracking"}})
    if result.modified_count:
        await _log(db, notif_id, "tracking", "")
        _broadcast("tracking", notif_id)
    return bool(result.matched_count)


async def untrack(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": "tracking"}, {"$set": {"status": "seen"}})
    if result.modified_count:
        await _log(db, notif_id, "untracked", "")
        _broadcast("untracked", notif_id)
    return bool(result.matched_count)


async def snooze(db, notif_id, until_iso):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": {"$nin": list(_TERMINAL)}},
        {"$set": {"status": "snoozed", "snoozed_until": until_iso}})
    if result.modified_count:
        await _log(db, notif_id, "snoozed", f"até {until_iso}")
        _broadcast("snoozed", notif_id)
    return bool(result.matched_count)


async def unsnooze(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": "snoozed"}, {"$set": {"status": "seen", "snoozed_until": None}})
    if result.modified_count:
        await _log(db, notif_id, "woke", "manual")
        _broadcast("woke", notif_id)
    return bool(result.matched_count)


async def wake_snoozed(db):
    """Chamado pelo _notification_scan_loop (server.py) — devolve à vista
    qualquer notificação adiada cujo prazo já passou. Volta para "seen"
    (não "new"): a pessoa já a tinha visto antes de a adiar."""
    now = _now_iso()
    woken = [doc["id"] async for doc in db.notifications.find(
        {"status": "snoozed", "snoozed_until": {"$lte": now}}, {"_id": 0, "id": 1})]
    if woken:
        await db.notifications.update_many(
            {"id": {"$in": woken}}, {"$set": {"status": "seen", "snoozed_until": None}})
        for notif_id in woken:
            await _log(db, notif_id, "woke", "")
            _broadcast("woke", notif_id)
    return len(woken)


async def resolve(db, notif_id, by="manual"):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": {"$nin": list(_TERMINAL)}},
        {"$set": {"status": "resolved", "resolved_at": _now_iso(), "resolved_by": by}})
    if result.modified_count:
        await _log(db, notif_id, f"resolved_{by}", "")
        _broadcast("resolved", notif_id)
    return bool(result.matched_count)


async def pin(db, notif_id, pinned=True):
    result = await db.notifications.update_one({"id": notif_id}, {"$set": {"pinned": pinned}})
    if result.matched_count:
        await _log(db, notif_id, "pinned" if pinned else "unpinned", "")
        _broadcast("pinned" if pinned else "unpinned", notif_id)
    return bool(result.matched_count)


async def archive(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id}, {"$set": {"status": "archived", "archived_at": _now_iso()}})
    if result.matched_count:
        await _log(db, notif_id, "archived", "")
        _broadcast("archived", notif_id)
    return bool(result.matched_count)


async def sweep_expired(db):
    """(§18) Arquiva sozinho o que passou o expires_at — regista o motivo
    no log antes de arquivar, para a Linha Temporal mostrar "expirou", não
    um arquivamento mudo."""
    now = _now_iso()
    ids = [d["id"] async for d in db.notifications.find(
        {"expires_at": {"$ne": None, "$lte": now}, "status": {"$ne": "archived"}}, {"_id": 0, "id": 1})]
    for notif_id in ids:
        await _log(db, notif_id, "expired", "")
        await archive(db, notif_id)
    return len(ids)


async def unread_count(db):
    return await db.notifications.count_documents({"status": "new"})


# ---- Operações em lote (§15) ----

async def archive_bulk(db, ids):
    now = _now_iso()
    result = await db.notifications.update_many({"id": {"$in": ids}}, {"$set": {"status": "archived", "archived_at": now}})
    for i in ids:
        await _log(db, i, "archived", "")
        _broadcast("archived", i)
    return result.modified_count


async def resolve_bulk(db, ids, by="manual"):
    result = await db.notifications.update_many(
        {"id": {"$in": ids}, "status": {"$nin": list(_TERMINAL)}},
        {"$set": {"status": "resolved", "resolved_at": _now_iso(), "resolved_by": by}})
    for i in ids:
        await _log(db, i, f"resolved_{by}", "")
        _broadcast("resolved", i)
    return result.modified_count


async def pin_bulk(db, ids, pinned=True):
    result = await db.notifications.update_many({"id": {"$in": ids}}, {"$set": {"pinned": pinned}})
    for i in ids:
        _broadcast("pinned" if pinned else "unpinned", i)
    return result.modified_count


async def snooze_bulk(db, ids, until_iso):
    result = await db.notifications.update_many(
        {"id": {"$in": ids}, "status": {"$nin": list(_TERMINAL)}},
        {"$set": {"status": "snoozed", "snoozed_until": until_iso}})
    for i in ids:
        await _log(db, i, "snoozed", f"até {until_iso}")
        _broadcast("snoozed", i)
    return result.modified_count


# ---- Pontuação de impacto / prioridade dinâmica (§3, §23) ----
#
# Decomposta em componentes nomeados (em vez de uma fórmula monolítica) para
# ser fácil de ajustar um fator no futuro sem reescrever tudo. O valor final
# é um único número 0-100, nunca mostrado na UI — só alimenta ordenação,
# agrupamento e destaques; a UI só vê o rótulo derivado (computed_priority).

def _priority_component(doc):
    return NOTIF_PRIORITY_RANK.get(doc["priority"], 1) * 20  # 0/20/40/60


def _age_component(doc, now):
    created = datetime.fromisoformat(doc["created_at"])
    age_hours = (now - created).total_seconds() / 3600
    return min(age_hours / 24 * 5, 25)  # até +25, 5 pontos por dia


def _blocking_component(note, task):
    score = 0.0
    if note:
        if note.get("is_overdue"):
            score += 15
        if note.get("priority") == "urgente":
            score += 20
        if note.get("client_callback_due") or note.get("supplier_callback_due"):
            score += 10
    if task and task.get("priority") == "alta":
        score += 10
    return score


def _activity_component(doc):
    if doc.get("occurrence_count", 1) <= 1:
        return 0.0
    return min((doc["occurrence_count"] - 1) * 3, 15)  # situação repetida (evoluiu)


def _dependency_component(note):
    return 3.0 if note and note.get("bricoaval_number") else 0.0


def compute_impact_score(doc, note=None, task=None, now=None):
    now = now or datetime.now(timezone.utc)
    if doc["status"] in ("resolved", "archived"):
        return round(_priority_component(doc), 1)  # já fechada, não escala mais
    total = (_priority_component(doc) + _age_component(doc, now) + _blocking_component(note, task)
             + _activity_component(doc) + _dependency_component(note))
    return round(min(total, 100), 1)


def priority_from_score(score):
    if score >= 75:
        return "critica"
    if score >= 50:
        return "alta"
    if score >= 25:
        return "media"
    return "baixa"


def compute_priority(doc, note=None, task=None, now=None):
    return priority_from_score(compute_impact_score(doc, note, task, now))


# ---- Próxima Ação Recomendada + autoaprendizagem (§24, §25) ----
#
# Este módulo só guarda a mecânica genérica de aprendizagem (contagem por
# chave, cache em memória) — o cálculo de `context_key` (que depende de
# WAITING_SUPPLIER/FORGOTTEN_STATUSES, definidos em server.py) e a
# composição final de `next_best_action` vivem em server.py, para evitar um
# import circular. Vocabulário fechado de ações aprendíveis: "open"
# (abrir/ver), "complete_task" (concluir tarefa), "resolve" (marcar
# resolvida), "archive" (arquivar), "track" (acompanhar) — o mesmo conjunto
# usado no frontend (notificationActions.js).

DEFAULT_ACTION_BY_CATEGORY = {
    "quote_quality_issue": {"type": "open", "label": "Rever orçamento"},
    "urgent": {"type": "open", "label": "Ver pedido"},
    "task_urgent": {"type": "complete_task", "label": "Concluir tarefa"},
    "client": {"type": "open", "label": "Ver pedido"},
    "quote_changed": {"type": "open", "label": "Rever alterações"},
    "waiting_supplier": {"type": "open", "label": "Ver pedido"},
    "task_reminder": {"type": "complete_task", "label": "Concluir tarefa"},
    "tasks_overdue_digest": {"type": "open", "label": "Ver tarefas"},
    "supplier": {"type": "open", "label": "Ver pedido"},
    "forgotten": {"type": "open", "label": "Ver pedido"},
    "reminder_overdue": {"type": "complete_task", "label": "Concluir tarefa"},
    "deadline_approaching": {"type": "open", "label": "Ver pedido"},
    "processing_error": {"type": "open", "label": "Ver detalhes"},
    "client_new_note": {"type": "open", "label": "Ver pedido"},
    "bricoaval_backfill": {"type": "open", "label": "Ver pedido"},
    "unmatched": {"type": "open", "label": "Ver email"},
}

ACTION_LABELS = {
    "open": "Abrir",
    "complete_task": "Concluir tarefa",
    "resolve": "Marcar resolvida",
    "archive": "Arquivar",
    "track": "Acompanhar",
}

_learned_action_by_key = {}  # (category, context_key) -> action, cache em memória (padrão de app_settings._cache)


async def record_action(db, category, context_key, action):
    """Regista que o operador usou `action` para avançar/fechar uma
    notificação desta categoria+contexto — matéria-prima da aprendizagem.
    Sem IA: é só uma contagem. `context_key` deve ser determinístico, usar
    só estados estáveis já existentes, e ter granularidade baixa (ex.:
    "still_waiting"/"supplier_replied") — nunca um id ou timestamp embutido,
    ou as amostras nunca se acumulam o suficiente para aprender nada."""
    await db.notification_action_stats.update_one(
        {"category": category, "context_key": context_key, "action": action},
        {"$inc": {"count": 1}, "$set": {"last_used_at": _now_iso()}}, upsert=True)


async def refresh_learned_actions(db):
    """Chamado pelo _notification_scan_loop (mesma cadência). Para cada par
    (categoria, context_key) com >=5 amostras, a ação mais frequente passa
    a ser usada em vez da omissão estática."""
    global _learned_action_by_key
    agg = {}
    async for row in db.notification_action_stats.find({}, {"_id": 0}):
        agg.setdefault((row["category"], row["context_key"]), []).append(row)
    learned = {}
    for key, rows in agg.items():
        if sum(r["count"] for r in rows) >= 5:
            learned[key] = max(rows, key=lambda r: r["count"])["action"]
    _learned_action_by_key = learned


def learned_action_for(category, context_key):
    return _learned_action_by_key.get((category, context_key))
