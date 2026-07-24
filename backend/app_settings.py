"""Definições da aplicação, agrupadas — mesmo padrão já usado em
db.settings para o PIN de acesso e as chaves VAPID (ver server.py:
_get_pin_doc, push_notifications.get_vapid_keys), generalizado para não
repetir 9 vezes quase o mesmo par de funções "carregar/gravar um
documento".

Cada grupo é UM documento em db.settings (chave = o nome do grupo),
semeado com os valores predefinidos abaixo na primeira leitura — os
mesmos valores que já estavam hardcoded no código antes desta alteração
(margens, limites de upload, cadência do IMAP, etc.). Uma cache em
memória por grupo evita ir à base de dados em cada pedido nos sítios
"quentes" (o ciclo de verificação do IMAP, por exemplo); a cache é
sempre atualizada no próprio PUT (write-through), nunca por expiração —
uma alteração fica sempre visível de imediato, mesmo antes do próximo
`get_group`."""

from datetime import datetime, timezone

SETTINGS_DEFAULTS = {
    "notification_prefs": {
        "supplier": True, "client": True, "correio_semanal": True, "unmatched": True,
        "waiting_supplier": True, "forgotten": True, "urgent": True, "reminder_overdue": True,
        "quote_quality_issue": True, "quote_changed": True, "anexos_incidencia_critica": True,
        "client_new_note": True, "task_urgent": True, "deadline_approaching": True,
        "processing_error": True, "document_read_failure": True, "price_change": True,
        "task_reminder": True, "tasks_overdue_digest": True,
        "knowledge_new_article": True, "knowledge_engine_updated": True,
        "bricoaval_backfill": True,
    },
    "material_margins": {
        "pvc": 15.0, "aluminio": 18.0, "portada": 18.0, "rede": 18.0, "desconhecido": 20.0,
    },
    "price_rounding": {
        "limit_1": 100, "limit_2": 500, "limit_3": 5000, "limit_4": 20000,
        "step_0": 1, "step_1": 5, "step_2": 5, "step_3": 10, "step_4": 50,
    },
    "automation_prefs": {
        "imap_poll_minutes": 5, "auto_close_months": 6, "default_sla_days": 2,
        "reminder_interval_days": 3, "category_suggestion_threshold": 2,
        "supplier_quote_history_limit": 5, "deadline_warning_days": 1,
        "price_change_alert_pct": 15, "notification_scan_minutes": 5,
        "auto_process_correio_semanal": True,
    },
    "security_prefs": {
        "pin_max_attempts": 3, "pin_lock_minutes": 10, "auto_lock_minutes": 0,
    },
    "upload_limits": {
        "max_supplier_pdf_mb": 15, "max_anexos_zip_mb": 30,
        "max_email_attachment_total_mb": 20, "max_attachments_per_email": 5,
    },
    "defaults_prefs": {
        "default_note_category": "construcao", "default_task_priority": "media",
        "default_task_repeat": "none",
    },
    "email_prefs": {
        "include_signature": True, "auto_greeting": True,
        "correio_semanal_sender": "pdv11880@mousquetaires.com",
    },
    "desktop_widget_limits": {
        "agenda_limit": 4, "pedidos_limit": 3, "correio_limit": 3,
    },
}

# Limites sensatos para a validação do PUT — só os campos onde um valor
# absurdo (negativo, zero num divisor, etc.) partiria alguma coisa a
# sério. Percentagens de margem usam MAX_MARGIN_PCT (quote_pdf.py),
# verificado à parte em server.py por já lá estar calculado a partir do
# IVA.
NUMERIC_BOUNDS = {
    "price_rounding": {k: (0, 1_000_000) for k in SETTINGS_DEFAULTS["price_rounding"]},
    "automation_prefs": {
        "imap_poll_minutes": (0, 1440), "auto_close_months": (1, 60),
        "default_sla_days": (1, 365), "reminder_interval_days": (1, 90),
        "category_suggestion_threshold": (1, 20), "supplier_quote_history_limit": (1, 50),
        "deadline_warning_days": (1, 30), "price_change_alert_pct": (1, 100),
        "notification_scan_minutes": (1, 1440),
    },
    "security_prefs": {
        "pin_max_attempts": (1, 20), "pin_lock_minutes": (1, 1440), "auto_lock_minutes": (0, 1440),
    },
    "upload_limits": {
        "max_supplier_pdf_mb": (1, 200), "max_anexos_zip_mb": (1, 200),
        "max_email_attachment_total_mb": (1, 200), "max_attachments_per_email": (1, 50),
    },
    "desktop_widget_limits": {k: (1, 20) for k in SETTINGS_DEFAULTS["desktop_widget_limits"]},
}

_cache = {}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def get_group(db, group):
    """Devolve o dicionário do grupo (sempre com todos os campos —
    completado com os valores predefinidos se o documento gravado for de
    uma versão anterior com menos campos)."""
    if group not in SETTINGS_DEFAULTS:
        raise KeyError(f"Grupo de definições desconhecido: {group}")
    if group in _cache:
        return _cache[group]
    doc = await db.settings.find_one({"key": group}, {"_id": 0})
    values = {**SETTINGS_DEFAULTS[group], **(doc.get("values") if doc else {})}
    if not doc:
        await db.settings.update_one(
            {"key": group},
            {"$setOnInsert": {"key": group, "values": values, "created_at": _now_iso()}},
            upsert=True)
    _cache[group] = values
    return values


async def update_group(db, group, patch):
    """Atualiza só os campos indicados (os restantes ficam como estavam).
    Ignora silenciosamente chaves que não pertençam ao grupo — nunca deixa
    gravar um campo desconhecido."""
    current = await get_group(db, group)
    known = SETTINGS_DEFAULTS[group]
    updated = dict(current)
    for k, v in patch.items():
        if k not in known:
            continue
        bounds = NUMERIC_BOUNDS.get(group, {}).get(k)
        if bounds is not None:
            v = max(bounds[0], min(bounds[1], v))
        updated[k] = v
    await db.settings.update_one(
        {"key": group},
        {"$set": {"values": updated, "updated_at": _now_iso()}},
        upsert=True)
    _cache[group] = updated
    return updated


def all_groups():
    return list(SETTINGS_DEFAULTS)
