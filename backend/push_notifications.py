"""Notificações push (Web Push) — avisa o telemóvel/computador quando chega
um email novo, mesmo com a app fechada ou o ecrã bloqueado. Usa o protocolo
Web Push standard (RFC 8030 + VAPID), suportado nativamente pelo browser,
sem depender de nenhum serviço de terceiros (Firebase, etc.) — o
telemóvel só precisa de ter a app instalada (PWA, ver manifest.json) e ter
aceitado a permissão de notificações.

Cada dispositivo já verificado por PIN (db.auth_devices) pode subscrever-se
a partir do menu de sistema; a subscrição fica gravada no próprio registo
do dispositivo (campo push_subscription). Quando chega um email novo
(poll_supplier_replies em server.py), envia-se a notificação a todos os
dispositivos subscritos; uma subscrição que o browser já invalidou
(410/404) é removida automaticamente, sem intervenção manual."""

import asyncio
import base64
import json
import logging

from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import webpush, WebPushException

try:
    import app_settings
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from . import app_settings

logger = logging.getLogger(__name__)

VAPID_SETTINGS_KEY = "vapid_keys"
_GONE_STATUS = (404, 410)


def _b64url(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode()


def generate_vapid_keypair():
    """Novo par de chaves VAPID (curva P-256), em formato "raw" — só o
    escalar/ponto, base64url, sem cabeçalhos PEM/DER. É o único formato que
    o py_vapid.Vapid.from_string() (usado internamente pelo pywebpush)
    reconhece sem ambiguidade: confirmado a ler o código da biblioteca —
    from_string() trata qualquer texto PEM literal como se fosse base64,
    o que corrompe a chave em vez de a rejeitar com um erro claro."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    pub = private_key.public_key().public_numbers()
    public_raw = b"\x04" + pub.x.to_bytes(32, "big") + pub.y.to_bytes(32, "big")
    return _b64url(private_raw), _b64url(public_raw)


async def get_vapid_keys(db, claims_email=""):
    """Carrega o par de chaves da base de dados, gerando-o uma única vez se
    não existir — mesmo padrão do PIN de acesso (ver server.py:
    _get_pin_doc). Nunca muda depois de criado, para as subscrições já
    feitas pelos browsers continuarem válidas."""
    doc = await db.settings.find_one({"key": VAPID_SETTINGS_KEY}, {"_id": 0})
    if doc:
        return doc
    private_key, public_key = generate_vapid_keypair()
    doc = {"key": VAPID_SETTINGS_KEY, "private_key": private_key,
           "public_key": public_key, "claims_email": claims_email}
    await db.settings.update_one(
        {"key": VAPID_SETTINGS_KEY}, {"$setOnInsert": doc}, upsert=True)
    return await db.settings.find_one({"key": VAPID_SETTINGS_KEY}, {"_id": 0})


def _send_sync(subscription, payload, private_key, claims_email):
    # webpush() é uma chamada bloqueante (HTTP síncrono) — corre sempre em
    # thread à parte (ver send_to_device), para nunca travar o event loop.
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=private_key,
        vapid_claims={"sub": f"mailto:{claims_email or 'contacto@lusorae.pt'}"},
        ttl=60 * 30,
    )


async def send_to_device(db, device, payload, vapid_keys=None):
    """Envia para UM dispositivo (doc de db.auth_devices com
    push_subscription preenchido). Devolve True se enviado, False se a
    subscrição estava morta (nesse caso já fica removida da base de dados)
    ou se falhou por outro motivo — nunca levanta exceção."""
    sub = device.get("push_subscription")
    if not sub:
        return False
    vapid_keys = vapid_keys or await get_vapid_keys(db)
    try:
        await asyncio.to_thread(
            _send_sync, sub, payload, vapid_keys["private_key"], vapid_keys.get("claims_email", ""))
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in _GONE_STATUS:
            await db.auth_devices.update_one(
                {"id": device["id"]}, {"$unset": {"push_subscription": ""}})
            logger.info(f"Subscrição push expirada removida (device={device.get('id')})")
        else:
            logger.warning(f"Falha a enviar notificação push (device={device.get('id')}): {e}")
        return False
    except Exception as e:
        logger.warning(f"Falha a enviar notificação push (device={device.get('id')}): {e}")
        return False


async def notify_all(db, payload):
    """Envia a todos os dispositivos com subscrição ativa. Nunca levanta —
    a falha num dispositivo não pode impedir os outros de receber."""
    devices = await db.auth_devices.find(
        {"push_subscription": {"$exists": True}}, {"_id": 0}).to_list(200)
    if not devices:
        return 0
    vapid_keys = await get_vapid_keys(db)
    sent = 0
    for device in devices:
        if await send_to_device(db, device, payload, vapid_keys):
            sent += 1
    return sent


async def notify_category(db, category, title, body, url="/", tag=None):
    """Envia só se a categoria estiver ativa nas preferências de
    notificação (definições → Notificações) — cada uma das 11 categorias
    (fornecedor, cliente, Correio Semanal, pedido parado, incidência
    crítica, ...) pode ser ligada/desligada em separado."""
    prefs = await app_settings.get_group(db, "notification_prefs")
    if not prefs.get(category, True):
        return 0
    return await notify_all(db, {"title": title, "body": body, "url": url, "tag": tag or category})


async def notify_new_email(db, subject, from_label, category="unmatched"):
    """Chamado a cada email novo guardado em received_emails (ver
    poll_supplier_replies). `category` é uma das chaves de
    notification_prefs — "supplier"/"client"/"correio_semanal"/"unmatched"."""
    return await notify_category(
        db, category, "Novo email", f"{from_label}: {subject or '(sem assunto)'}", url="/emails", tag="email")
