"""Notificações persistentes — o registo de cada evento (db.notifications)
fica gravado antes de qualquer tentativa de envio, para nunca depender só
da entrega ao dispositivo: mesmo que o push falhe, o dispositivo esteja
sem notificações ativas, ou simplesmente offline, o evento continua
visível no Centro de Notificações assim que a app for aberta — não
desaparece sozinho, só sai por leitura/arquivo explícitos.

`create_notification` é o único ponto de entrada: todo o código que hoje
avisa o utilizador (email novo, orçamento do fornecedor, tarefa urgente,
...) passa a chamar esta função, nunca `push_notifications` diretamente.
Isto dá, de borla, deduplicação (por `dedup_key`), histórico e repetição
automática em falhas de entrega."""

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


def _broadcast(event_type, notification_id):
    event = {"type": event_type, "id": notification_id}
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass  # separador lento — perde um evento de sincronização, não a notificação em si (essa continua em db.notifications)


# Prioridade fixa por categoria — não configurável, para não virar mais 50
# campos de definições. `create_notification(..., priority=...)` permite a
# um chamador específico escalar/desescalar caso a caso (ex.: um problema
# de qualidade "warning" é menos grave que um "error").
CATEGORY_PRIORITY = {
    "anexos_incidencia_critica": "critica",
    "quote_quality_issue": "critica",
    "urgent": "critica",
    "task_urgent": "critica",
    "client": "alta",
    "quote_changed": "alta",
    "waiting_supplier": "alta",
    "document_read_failure": "alta",
    "price_change": "alta",
    "task_reminder": "alta",
    "tasks_overdue_digest": "alta",
    "supplier": "media",
    "correio_semanal": "media",
    "forgotten": "media",
    "reminder_overdue": "media",
    "deadline_approaching": "media",
    "processing_error": "media",
    "client_new_note": "media",
    "unmatched": "baixa",
}

# Backoff entre tentativas de entrega (minutos) — 1, 5, 15, 60, 120, 240;
# ao fim de 6 tentativas falhadas essa entrega fica "failed" em definitivo
# (só a entrega àquele dispositivo, nunca a notificação em si).
RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 120, 240]
MAX_DELIVERY_ATTEMPTS = len(RETRY_BACKOFF_MINUTES)


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


async def create_notification(db, *, dedup_key, category, title, body, url="/",
                                note_id=None, task_id=None, priority=None):
    """Idempotente por `dedup_key`: uma segunda chamada com a mesma chave
    nunca duplica, só devolve o id já existente. Respeita
    `notification_prefs` — uma categoria desligada nem sequer fica
    registada (evita acumular lixo de categorias que o utilizador nem quer
    ver). Devolve o id da notificação, ou None se a categoria estiver
    desligada."""
    existing = await db.notifications.find_one({"dedup_key": dedup_key}, {"_id": 0, "id": 1})
    if existing:
        return existing["id"]

    prefs = await app_settings.get_group(db, "notification_prefs")
    if not prefs.get(category, True):
        return None

    notif_id = str(uuid.uuid4())
    devices = await _eligible_devices(db)
    deliveries = [{
        "device_id": d["id"], "status": "pending", "attempts": 0,
        "next_retry_at": _now_iso(), "delivered_at": None, "error": None,
        "ack_token": secrets.token_urlsafe(16),
    } for d in devices]
    doc = {
        "id": notif_id, "dedup_key": dedup_key, "category": category,
        "priority": priority_for(category, priority),
        "title": title, "body": body, "url": url,
        "note_id": note_id, "task_id": task_id,
        "status": "unread", "created_at": _now_iso(), "read_at": None, "archived_at": None,
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

    await db.notification_logs.insert_one({
        "notification_id": notif_id, "event": "created", "device_id": None,
        "at": _now_iso(), "detail": f"{len(devices)} dispositivo(s) elegível(eis)"})
    _broadcast("created", notif_id)

    if devices:
        vapid_keys = await push_notifications.get_vapid_keys(db)
        for device, delivery in zip(devices, deliveries):
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
    await db.notification_logs.insert_one({
        "notification_id": notif_id, "event": "sent" if ok else "send_attempt",
        "device_id": device["id"], "at": _now_iso(), "detail": error or ""})
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
        await db.notification_logs.insert_one({
            "notification_id": notif_id, "event": "delivered", "device_id": None,
            "at": _now_iso(), "detail": ""})
        await _refresh_pending_flag(db, notif_id)
    return bool(result.matched_count)


async def mark_read(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id, "status": "unread"}, {"$set": {"status": "read", "read_at": _now_iso()}})
    if result.modified_count:
        await db.notification_logs.insert_one({
            "notification_id": notif_id, "event": "read", "device_id": None,
            "at": _now_iso(), "detail": ""})
        _broadcast("read", notif_id)
    return bool(result.matched_count)


async def mark_read_bulk(db, ids):
    now = _now_iso()
    result = await db.notifications.update_many(
        {"id": {"$in": ids}, "status": "unread"}, {"$set": {"status": "read", "read_at": now}})
    for notif_id in ids:
        _broadcast("read", notif_id)
    return result.modified_count


async def archive(db, notif_id):
    result = await db.notifications.update_one(
        {"id": notif_id}, {"$set": {"status": "archived", "archived_at": _now_iso()}})
    if result.matched_count:
        _broadcast("archived", notif_id)
    return bool(result.matched_count)


async def unread_count(db):
    return await db.notifications.count_documents({"status": "unread"})
