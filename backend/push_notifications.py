"""Notificações push (Web Push) — primitivas de baixo nível para avisar o
telemóvel/computador, mesmo com a app fechada ou o ecrã bloqueado. Usa o
protocolo Web Push standard (RFC 8030 + VAPID), suportado nativamente pelo
browser, sem depender de nenhum serviço de terceiros (Firebase, etc.).

Este módulo só sabe enviar para UM dispositivo (send_to_device) e gerir as
chaves VAPID — a decisão de A QUEM enviar (preferências por categoria,
dispositivo elegível, registo persistente, repetição em falhas) está em
notifications.py (create_notification), o único ponto de entrada usado
pelo resto da aplicação.

Cada dispositivo já verificado por PIN (db.auth_devices) pode subscrever-se
a partir das definições; a subscrição fica gravada no próprio registo do
dispositivo (campo push_subscription). Uma subscrição que o browser já
invalidou (410/404) é removida automaticamente, sem intervenção manual."""

import asyncio
import base64
import json
import logging

from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import webpush, WebPushException

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
