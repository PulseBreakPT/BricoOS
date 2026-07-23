from fastapi import FastAPI, APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import hashlib
import secrets
import os
import re
import unicodedata
import difflib
import json as _json
import logging
import uuid
import base64
import imaplib
import smtplib
import warnings
import mimetypes
import urllib.parse
import email as email_lib
import nh3
from email import encoders as email_encoders
from email.header import decode_header
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.utils import parseaddr, make_msgid, parsedate_to_datetime
from html import escape as html_escape, unescape as html_unescape
from pathlib import Path
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText

try:
    from email_templates import (
        business_greeting, client_quote_template, supplier_quote_template,
    )
    from caixilharia_logic import caixilharia_email_lines, caixilharia_summary, normalize_caixilharia_spec
    from bandaluminios_analysis import build_catalog_analysis
    from bandaluminios_catalog import (
        CATALOG_META as CAIXILHARIA_CATALOG_META,
        FAMILIES as CAIXILHARIA_FAMILIAS,
        GLASS_TYPES as CAIXILHARIA_VIDROS,
        MODELS as CAIXILHARIA_MODELOS,
        OPENING_TYPES as CAIXILHARIA_TIPOS_ABERTURA,
        QUADRILLE_INFO as CAIXILHARIA_QUADRICULA_INFO,
        QUADRILLE_OPTIONS as CAIXILHARIA_QUADRICULAS,
        material_labels as caixilharia_material_labels,
    )
    from quote_pdf import (
        IVA_RATE, MAX_MARGIN_PCT, build_client_pdf, coefficient_for_margin,
        detect_material, margin_for_material, material_label, parse_supplier_pdf,
        suggest_client_price,
    )
    from quote_validation import (
        build_quality_report, confidence_score, detect_urgency_signals,
        diff_quote_versions, diff_summary_text, duplicate_medidas,
    )
    import correio_semanal
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from .email_templates import (
        business_greeting, client_quote_template, supplier_quote_template,
    )
    from .caixilharia_logic import caixilharia_email_lines, caixilharia_summary, normalize_caixilharia_spec
    from .bandaluminios_analysis import build_catalog_analysis
    from .bandaluminios_catalog import (
        CATALOG_META as CAIXILHARIA_CATALOG_META,
        FAMILIES as CAIXILHARIA_FAMILIAS,
        GLASS_TYPES as CAIXILHARIA_VIDROS,
        MODELS as CAIXILHARIA_MODELOS,
        OPENING_TYPES as CAIXILHARIA_TIPOS_ABERTURA,
        QUADRILLE_INFO as CAIXILHARIA_QUADRICULA_INFO,
        QUADRILLE_OPTIONS as CAIXILHARIA_QUADRICULAS,
        material_labels as caixilharia_material_labels,
    )
    from .quote_pdf import (
        IVA_RATE, MAX_MARGIN_PCT, build_client_pdf, coefficient_for_margin,
        detect_material, margin_for_material, material_label, parse_supplier_pdf,
        suggest_client_price,
    )
    from .quote_validation import (
        build_quality_report, confidence_score, detect_urgency_signals,
        diff_quote_versions, diff_summary_text, duplicate_medidas,
    )
    from . import correio_semanal

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL', '').rstrip('/')
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
REDIRECT_URI = f"{PUBLIC_BASE_URL}/api/oauth/gmail/callback"

# Envio por SMTP com palavra-passe de aplicação do Gmail — alternativa mais
# simples ao OAuth (sem Cloud Console, nunca expira). Quando configurado,
# tem prioridade sobre a Gmail API. Os espaços da palavra-passe (formato de
# apresentação da Google, "xxxx xxxx xxxx xxxx") são removidos.
GMAIL_SMTP_USER = os.environ.get('GMAIL_SMTP_USER', '').strip()
GMAIL_SMTP_APP_PASSWORD = os.environ.get('GMAIL_SMTP_APP_PASSWORD', '').replace(" ", "").strip()
SMTP_CONFIGURED = bool(GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD)
# Intervalo (minutos) da verificação automática de respostas na caixa de
# entrada, por IMAP em modo só-leitura. 0 desliga a verificação automática.
IMAP_POLL_MINUTES = int(os.environ.get('IMAP_POLL_MINUTES', '5') or 0)

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
AI_MODEL = os.environ.get('AI_MODEL', 'gpt-5.4')

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send", "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

AUTHOR = "Chefe de Loja"
DEFAULT_SLA_DAYS = 2
VALID_CATEGORIES = ["construcao", "bricolage", "decoracao", "jardim"]
TASK_PRIORITIES = ["nenhuma", "baixa", "media", "alta"]
TASK_PRIORITY_RANK = {"alta": 0, "media": 1, "baixa": 2, "nenhuma": 3}
TASK_REPEATS = ["none", "daily", "weekly", "monthly"]
EMAIL_PRIORITIES = ["alta", "normal", "baixa"]
EMAIL_PRIORITY_RANK = {"alta": 0, "normal": 1, "baixa": 2}
EMAIL_CATEGORIES = ["orcamento", "reclamacao", "duvida", "urgente", "outro"]
EMAIL_RULE_FIELDS = ["subject", "body", "from_email", "category"]
EMAIL_RULE_OPS = ["contains", "equals"]
EMAIL_RULE_ACTION_TYPES = ["priority"]
STATUSES = [
    "novo", "pendente", "em_preparacao", "enviado_fornecedor", "aguarda_fornecedor",
    "orcamento_recebido", "aguarda_cliente", "aprovado", "rejeitado", "encomendado",
    "concluido", "cancelado",
]
CLOSED_STATUSES = {"concluido", "cancelado", "rejeitado"}
ARCHIVE_STATUSES = {"concluido", "cancelado"}
WAITING_SUPPLIER = {"enviado_fornecedor", "aguarda_fornecedor"}
WAITING_CLIENT = {"aguarda_cliente"}
FORGOTTEN_STATUSES = {"novo", "pendente", "em_preparacao"}
AUTO_CLOSE_MONTHS = int(os.environ.get("AUTO_CLOSE_MONTHS", "6"))
PRIORITIES = ["urgente", "alta", "media", "baixa"]
PRIORITY_RANK = {"urgente": 0, "alta": 1, "media": 2, "baixa": 3}
STATUS_LABEL = {
    "novo": "Novo", "pendente": "Pendente", "em_preparacao": "Em preparação",
    "enviado_fornecedor": "Enviado ao fornecedor", "aguarda_fornecedor": "À espera do fornecedor",
    "orcamento_recebido": "Orçamento recebido", "aguarda_cliente": "À espera do cliente",
    "aprovado": "Aprovado", "rejeitado": "Rejeitado", "encomendado": "Encomendado",
    "concluido": "Concluído", "cancelado": "Cancelado",
}
NEXT_ACTION = {
    "novo": "Preparar pedido e escolher fornecedor",
    "pendente": "Definir detalhes e avançar para preparação",
    "em_preparacao": "Enviar pedido de orçamento ao fornecedor",
    "enviado_fornecedor": "Aguardar resposta do fornecedor",
    "aguarda_fornecedor": "Enviar lembrete ao fornecedor",
    "orcamento_recebido": "Contactar o cliente com o preço",
    "aguarda_cliente": "Confirmar a decisão do cliente",
    "aprovado": "Encomendar ao fornecedor",
    "rejeitado": "Arquivar ou propor alternativa",
    "encomendado": "Confirmar entrega e concluir",
    "concluido": "Concluído", "cancelado": "Cancelado",
}
NEXT_STATUS = {
    "novo": "em_preparacao", "pendente": "em_preparacao", "em_preparacao": "enviado_fornecedor",
    "enviado_fornecedor": "aguarda_fornecedor", "aguarda_fornecedor": "orcamento_recebido",
    "orcamento_recebido": "aguarda_cliente", "aguarda_cliente": "aprovado",
    "aprovado": "encomendado", "encomendado": "concluido",
}
NEXT_ACTION_MODE = {
    # Estes passos exigem uma ação real; nunca devem ser convertidos num mero
    # clique que avança o estado sem enviar/registar nada.
    "em_preparacao": "compose_supplier_email",
    "aguarda_fornecedor": "record_quote",
    "orcamento_recebido": "reply_to_client",
    "aguarda_cliente": "record_client_decision",
}
PREDEFINED_LABELS = [
    "À medida", "Cliente VIP", "Stock loja", "Encomenda especial", "Garantia", "Reclamação", "Promoção",
    "Cliente não atendeu", "Fornecedor não atendeu", "Aguarda stock", "Pronto p/ levantamento", "Cliente avisado",
]

# Registos rápidos: um toque regista o que aconteceu (chamada falhada, aviso ao
# cliente, stock…) na cronologia, atualiza etiquetas e contadores de tentativas.
QUICK_LOG_EVENTS = {
    "cliente_nao_atendeu": {
        "message": "Cliente não atendeu a chamada", "type": "contact_attempt",
        "label": "Cliente não atendeu", "counter": "client_no_answer_count",
        "attempt_field": "last_client_attempt_at",
    },
    "cliente_deixou_mensagem": {
        "message": "Deixada mensagem / SMS ao cliente", "type": "contact_attempt",
        "counter": "client_no_answer_count", "attempt_field": "last_client_attempt_at",
    },
    "cliente_atendeu": {
        "message": "Falei com o cliente por telefone", "type": "client_contact",
        "touch_client": True, "clear_labels": ["Cliente não atendeu"],
        "reset_counter": "client_no_answer_count",
    },
    "fornecedor_nao_atendeu": {
        "message": "Fornecedor não atendeu a chamada", "type": "contact_attempt",
        "label": "Fornecedor não atendeu", "counter": "supplier_no_answer_count",
        "attempt_field": "last_supplier_attempt_at",
    },
    "fornecedor_atendeu": {
        "message": "Falei com o fornecedor por telefone", "type": "supplier_contact",
        "clear_labels": ["Fornecedor não atendeu"], "reset_counter": "supplier_no_answer_count",
    },
    "aguarda_stock": {
        "message": "Artigo a aguardar reposição de stock", "type": "comment",
        "label": "Aguarda stock",
    },
    "pronto_levantamento": {
        "message": "Encomenda pronta para levantamento em loja", "type": "comment",
        "label": "Pronto p/ levantamento", "clear_labels": ["Aguarda stock"],
    },
    "cliente_avisado": {
        "message": "Cliente avisado de que pode levantar a encomenda", "type": "client_contact",
        "touch_client": True, "label": "Cliente avisado",
        "clear_labels": ["Cliente não atendeu"], "reset_counter": "client_no_answer_count",
    },
}

# ---------- Caixilharia à medida (fornecedor: BandAluminios) ----------
# Estrutura fiel à ficha oficial de orçamento/encomenda da BandAluminios
# (www.bandaluminios.com) + redes mosquiteiras vendidas à medida pela loja.
CAIXILHARIA_SUPPLIER = {
    "name": "BandAluminios",
    "email": "geral@bandaluminios.com",
    "phone": "+351219265110",
    "category": "construcao",
    "notes": "Comércio de PVC e alumínios — caixilharia à medida. "
             "Estrada da Granja do Marquês, Lote 6, 2725-118 Algueirão, Sintra. "
             "Seg-Sex 9:00-12:30 / 14:00-17:30 · www.bandaluminios.com",
}

CAIXILHARIA_PRODUTOS = {
    "janela": "Janela",
    "porta": "Porta",
    "portada": "Portada",
    "rede_mosquiteira": "Rede mosquiteira",
}

CAIXILHARIA_SENTIDOS = ["Direita", "Esquerda", "Sem preferência"]
CAIXILHARIA_FECHADURAS = {"1_ponto": "1 ponto", "3_pontos": "3 pontos"}
CAIXILHARIA_MULETAS = {"interior": "Interior", "exterior": "Exterior", "interior_exterior": "Interior + Exterior"}
CAIXILHARIA_ESTORES = {"com_estore": "Com estore", "sem_estore": "Sem estore"}
CAIXILHARIA_MATERIAIS = caixilharia_material_labels()
CAIXILHARIA_AVISO = "Vãos sempre vistos por dentro"

app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


async def log_activity(note_id, type_, message, meta=None):
    await db.activities.insert_one({
        "id": str(uuid.uuid4()), "note_id": note_id, "type": type_, "message": message,
        "author": AUTHOR, "created_at": now_iso(), "meta": meta or {}})


# Depois de uma chamada falhada, só volta a pedir nova tentativa passado este
# intervalo — evita alertar quem acabou de desligar o telefone.
CALLBACK_RETRY_HOURS = 2


def callback_due(note, now, side):
    """side: "client" ou "supplier". True quando há tentativas falhadas
    pendentes e a última já foi há tempo suficiente para voltar a tentar."""
    count = note.get(f"{side}_no_answer_count", 0) or 0
    if count <= 0 or note.get("archived") or note.get("status") in CLOSED_STATUSES:
        return False
    last = parse_dt(note.get(f"last_{side}_attempt_at"))
    return last is None or (now - last) >= timedelta(hours=CALLBACK_RETRY_HOURS)


def _priority_score(note):
    """Motor de prioridades: um número (não guardado, recalculado sempre
    que o pedido passa por enrich_note — ou seja, sempre que é lido) que
    combina a prioridade escolhida pela pessoa com sinais objetivos
    (atraso, tempo de espera, problemas de leitura no último orçamento
    importado). Serve só para ordenar (sort=urgency) — nunca substitui ou
    sobrepõe a prioridade manual guardada em note.priority."""
    score = (3 - PRIORITY_RANK.get(note.get("priority"), 2)) * 30.0
    if note.get("is_overdue"):
        score += 50
    score += min(note.get("waiting_days", 0) or 0, 30)
    sq = note.get("supplier_quote") or {}
    qr = sq.get("quality_report") or {}
    if qr.get("status") == "error":
        score += 15
    elif qr.get("status") == "warning":
        score += 5
    diff = sq.get("diff_since_previous")
    if diff and diff.get("has_changes"):
        score += 10
    return round(score, 1)


def enrich_note(note, now=None):
    now = now or datetime.now(timezone.utc)
    status = note.get("status", "novo")
    note["next_action"] = NEXT_ACTION.get(status, "")
    note["next_status"] = NEXT_STATUS.get(status)
    note["next_status_label"] = STATUS_LABEL.get(NEXT_STATUS.get(status), "")
    note["next_action_mode"] = NEXT_ACTION_MODE.get(status, "status")
    note["status_label"] = STATUS_LABEL.get(status, status)
    sla = note.get("sla_days") or DEFAULT_SLA_DAYS
    ref = parse_dt(note.get("status_updated_at") or note.get("updated_at") or note.get("created_at"))
    days = max((now - ref).days, 0) if ref else 0
    note["waiting_days"] = days
    note["is_overdue"] = (status in WAITING_SUPPLIER or status in FORGOTTEN_STATUSES) and days >= sla
    # Prazo previsto de resposta: mesma referência usada para "waiting_days"
    # (o SLA conta a partir da última mudança de estado), só que como data
    # concreta em vez de "há X dias" — mais fácil de mostrar num calendário
    # ou de comparar com "hoje".
    note["expected_reply_date"] = (ref + timedelta(days=sla)).date().isoformat() if ref else None
    note["priority_score"] = _priority_score(note)
    sup = parse_dt(note.get("last_supplier_sent_at"))
    cli = parse_dt(note.get("last_client_contact_at"))
    note["days_since_supplier"] = (now - sup).days if sup else None
    note["days_since_client"] = (now - cli).days if cli else None
    # ---- Assistant computed fields ----
    note["waiting_on"] = compute_waiting_on(status)
    note["reminder_count"] = note.get("reminder_count", 0) or 0
    ri = note.get("reminder_interval_days") or 3
    dsup = note["days_since_supplier"]
    note["reminder_due"] = bool(status in WAITING_SUPPLIER and dsup is not None and dsup >= ri)
    pt = detect_product_type(note)
    note["product_type"] = pt
    note["product_label"] = PRODUCT_TYPES.get(pt, {}).get("label") if pt else None
    note["measurement_warnings"] = measurement_warnings(note)
    note["client_waiting_days"] = (note["days_since_client"] if status in ("aguarda_cliente", "orcamento_recebido") else None)
    # ---- Recontactos (registo rápido) ----
    note["client_no_answer_count"] = note.get("client_no_answer_count", 0) or 0
    note["supplier_no_answer_count"] = note.get("supplier_no_answer_count", 0) or 0
    note["client_callback_due"] = callback_due(note, now, "client")
    note["supplier_callback_due"] = callback_due(note, now, "supplier")
    note["needs_callback"] = note["client_callback_due"] or note["supplier_callback_due"]
    note.pop("_id", None)
    return note


def compute_waiting_on(status):
    if status in CLOSED_STATUSES:
        return "none"
    if status in WAITING_SUPPLIER:
        return "supplier"
    if status in WAITING_CLIENT:
        return "client"
    return "me"


async def compute_response():
    acts = await db.activities.find({"type": {"$in": ["email_sent", "quote_added"]}}, {"_id": 0}).to_list(30000)
    sent, sent_sup, recv = {}, {}, {}
    for a in acts:
        dt = parse_dt(a.get("created_at"))
        if not dt:
            continue
        nid = a.get("note_id")
        if a["type"] == "email_sent":
            if nid not in sent or dt < sent[nid]:
                sent[nid] = dt
                sent_sup[nid] = (a.get("meta") or {}).get("supplier_name")
        else:
            if nid not in recv or dt < recv[nid]:
                recv[nid] = dt
    diffs, per_sup = [], {}
    for nid, s in sent.items():
        if nid in recv and recv[nid] >= s:
            hours = (recv[nid] - s).total_seconds() / 3600
            diffs.append(hours)
            name = sent_sup.get(nid)
            if name:
                per_sup.setdefault(name, []).append(hours)
    avg = round(sum(diffs) / len(diffs), 1) if diffs else None
    per_sup_avg = {k: round(sum(v) / len(v), 1) for k, v in per_sup.items()}
    fastest = sorted([{"supplier": k, "avg_hours": v, "count": len(per_sup[k])} for k, v in per_sup_avg.items()],
                     key=lambda x: x["avg_hours"])[:5]
    return avg, fastest, per_sup_avg, sent


# ---------- Assistant: product intelligence & learning ----------
PRODUCT_TYPES = {
    "janela": {"label": "Janela",
               "keywords": ["janela", "janelas", "sótão", "sotao", "oscilo", "batente"],
               "checklist": ["Medidas (largura × altura)", "Tipo de abertura (batente/correr/oscilo-batente)",
                             "Lado de abertura (direita/esquerda)", "Cor / acabamento",
                             "Tipo de vidro (simples/duplo)", "Com ou sem corte térmico"]},
    "porta": {"label": "Porta",
              "keywords": ["porta", "portas", "portão", "portao"],
              "checklist": ["Medidas (largura × altura)", "Sentido de abertura", "Material",
                            "Cor / acabamento", "Fechadura / puxador incluído?"]},
    "madeira": {"label": "Madeira",
                "keywords": ["madeira", "tábua", "tabua", "bancada", "prateleira", "viga", "mdf", "contraplacado"],
                "checklist": ["Dimensões (comprimento × largura × espessura)", "Tipo de madeira",
                              "Tratamento / acabamento", "Quantidade"]},
    "sanitario": {"label": "Sanitário",
                  "keywords": ["wc", "sanita", "duche", "cabine", "torneira", "lavatório", "lavatorio",
                               "tampa", "banheira", "chuveiro", "base de duche", "autoclismo"],
                  "checklist": ["Medidas", "Cor / acabamento", "Referência / modelo", "Quantidade"]},
    "tinta": {"label": "Tinta",
              "keywords": ["tinta", "verniz", "primário", "primario", "esmalte"],
              "checklist": ["Cor / código", "Acabamento (mate/acetinado/brilhante)",
                            "Litros / quantidade", "Interior ou exterior"]},
    "rede": {"label": "Rede mosquiteira",
             "keywords": ["rede", "mosquiteira", "mosquiteiro", "fole"],
             "checklist": ["Medidas (largura × altura)", "Tipo (fixa/fole/rolo)", "Cor do perfil"]},
    "jardim_prod": {"label": "Jardim / Exterior",
                    "keywords": ["churrasqueira", "planta", "rega", "relva", "vaso", "piscina", "sombra"],
                    "checklist": ["Dimensões / modelo", "Quantidade", "Material / acabamento"]},
}

DIM_RX = re.compile(r"(\d{2,7})\s*[xX×]\s*(\d{2,7})(?:\s*[xX×]\s*(\d{2,7}))?")


def detect_product_type(note):
    text = f"{note.get('description', '')} {note.get('details', '')} {note.get('reference', '')}".lower()
    for key, cfg in PRODUCT_TYPES.items():
        if any(k in text for k in cfg["keywords"]):
            return key
    return None


def parse_dims(measurements):
    dims = []
    for m in DIM_RX.finditer(measurements or ""):
        for g in m.groups():
            if g:
                dims.append(int(g))
    return dims


def measurement_warnings(note):
    warns = []
    dims = parse_dims(note.get("measurements", ""))
    for d in dims:
        if d > 6000:
            warns.append(f"Medida invulgar: {d} mm parece demasiado grande (será {d // 10} mm?).")
    if len(dims) >= 2:
        big, small = max(dims), min(dims)
        if small > 0 and big / small > 20:
            warns.append("Proporção invulgar entre as medidas — confirme os valores.")
    return warns


def normalize_text(s):
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9áàâãéèêíïóôõöúùüçñ ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def token_similarity(a, b):
    a, b = normalize_text(a), normalize_text(b)
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def ref_similarity(a, b):
    a, b = normalize_text(a), normalize_text(b)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


async def learning_profile():
    """Motor de aprendizagem: observa o histórico e deriva hábitos do chefe de loja."""
    notes = await db.notes.find({}, {"_id": 0}).to_list(5000)
    acts = await db.activities.find({"type": "email_sent"}, {"_id": 0}).to_list(20000)
    quotes = await db.quotes.find({"approved": True}, {"_id": 0}).to_list(20000)
    reqs = await db.quote_requests.find({}, {"_id": 0}).to_list(20000)
    note_by_id = {n["id"]: n for n in notes}
    by_cat, by_pt = {}, {}

    def add(d, key, name, w=1):
        if not key or not name:
            return
        d.setdefault(key, {}).setdefault(name, 0)
        d[key][name] += w

    for a in acts:
        n = note_by_id.get(a.get("note_id"))
        name = (a.get("meta") or {}).get("supplier_name")
        if n and name:
            add(by_cat, n.get("category"), name, 1)
            add(by_pt, detect_product_type(n), name, 1)
    for qd in quotes:  # approved quotes weigh more (a decision was taken)
        n = note_by_id.get(qd.get("note_id"))
        name = qd.get("supplier_name")
        if n and name:
            add(by_cat, n.get("category"), name, 2)
            add(by_pt, detect_product_type(n), name, 2)

    def rank(d):
        return {k: sorted([{"name": nm, "count": c} for nm, c in v.items()], key=lambda x: -x["count"])
                for k, v in d.items()}

    firstsend, reminder_gaps = {}, []
    for r in sorted(reqs, key=lambda x: x.get("sent_at", "")):
        nid = r.get("note_id")
        dt = parse_dt(r.get("sent_at"))
        if not dt:
            continue
        if not r.get("is_reminder"):
            firstsend.setdefault(nid, dt)
        elif nid in firstsend:
            reminder_gaps.append((dt - firstsend[nid]).days)
    avg_reminder = round(sum(reminder_gaps) / len(reminder_gaps)) if reminder_gaps else None
    slas = [n.get("sla_days") for n in notes if n.get("sla_days")]
    common_sla = max(set(slas), key=slas.count) if slas else None
    return {"by_category": rank(by_cat), "by_product_type": rank(by_pt),
            "avg_reminder_days": avg_reminder, "common_sla": common_sla}


async def auto_close_inactive():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=AUTO_CLOSE_MONTHS * 30)
    notes = await db.notes.find(
        {"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}}, {"_id": 0}).to_list(5000)
    count = 0
    for note in notes:
        ref = parse_dt(note.get("updated_at") or note.get("status_updated_at") or note.get("created_at"))
        if ref and ref < cutoff:
            await db.notes.update_one({"id": note["id"]}, {"$set": {
                "archived": True, "auto_closed": True, "updated_at": now_iso()}})
            await log_activity(note["id"], "auto_archived",
                               f"Arquivado automaticamente por inatividade (> {AUTO_CLOSE_MONTHS} meses)")
            count += 1
    return count



# ---------- Models ----------
def _check_choice(value, allowed, field_label):
    if value is not None and value not in allowed:
        raise ValueError(f"{field_label} inválido: {value}")
    return value


def _check_positive(value, field_label):
    if value is not None and value < 1:
        raise ValueError(f"{field_label} tem de ser pelo menos 1")
    return value


EMAIL_RX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_phone_loose(v):
    """Remove tudo menos dígitos (e um '+' inicial). Nunca lança erro — usar em
    pesquisas/filtros onde o valor pode estar incompleto (ex.: enquanto se digita)."""
    v = (v or "").strip()
    if not v:
        return ""
    has_plus = v.startswith("+")
    digits = re.sub(r"\D", "", v)
    return ("+" if has_plus else "") + digits


def normalize_phone(v):
    """Como normalize_phone_loose, mas valida o resultado — usar ao guardar dados."""
    v = (v or "").strip()
    if not v:
        return v
    norm = normalize_phone_loose(v)
    digits = norm.lstrip("+")
    if len(digits) < 9 or len(digits) > 15:
        raise ValueError("Telefone inválido")
    return norm


def normalize_email(v):
    v = (v or "").strip().lower()
    if not v:
        return v
    if not EMAIL_RX.match(v):
        raise ValueError("Email inválido")
    return v


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: str = ""
    phone: str = ""
    email: str = ""
    description: str = ""
    details: str = ""
    category: str = "construcao"
    measurements: str = ""
    quantity: str = ""
    color: str = ""
    reference: str = ""
    status: str = "novo"
    priority: str = "media"
    labels: List[str] = []
    supplier_id: str = ""
    sla_days: int = DEFAULT_SLA_DAYS
    reminder_interval_days: int = 3

    @field_validator("status")
    @classmethod
    def _v_status(cls, v):
        return _check_choice(v, STATUSES, "Estado")

    @field_validator("priority")
    @classmethod
    def _v_priority(cls, v):
        return _check_choice(v, PRIORITIES, "Prioridade")

    @field_validator("category")
    @classmethod
    def _v_category(cls, v):
        return _check_choice(v, VALID_CATEGORIES, "Secção")

    @field_validator("sla_days")
    @classmethod
    def _v_sla(cls, v):
        return _check_positive(v, "Prazo (SLA)")

    @field_validator("reminder_interval_days")
    @classmethod
    def _v_reminder(cls, v):
        return _check_positive(v, "Intervalo de lembrete")

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        return normalize_email(v)


class NotePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    description: Optional[str] = None
    details: Optional[str] = None
    category: Optional[str] = None
    measurements: Optional[str] = None
    quantity: Optional[str] = None
    color: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    supplier_id: Optional[str] = None
    sla_days: Optional[int] = None
    reminder_interval_days: Optional[int] = None

    @field_validator("status")
    @classmethod
    def _v_status(cls, v):
        return _check_choice(v, STATUSES, "Estado")

    @field_validator("priority")
    @classmethod
    def _v_priority(cls, v):
        return _check_choice(v, PRIORITIES, "Prioridade")

    @field_validator("category")
    @classmethod
    def _v_category(cls, v):
        return _check_choice(v, VALID_CATEGORIES, "Secção")

    @field_validator("sla_days")
    @classmethod
    def _v_sla(cls, v):
        return _check_positive(v, "Prazo (SLA)")

    @field_validator("reminder_interval_days")
    @classmethod
    def _v_reminder(cls, v):
        return _check_positive(v, "Intervalo de lembrete")

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        return normalize_email(v)


class StatusIn(BaseModel):
    status: str


class CommentIn(BaseModel):
    message: str


class DuplicateCheckIn(BaseModel):
    phone: str = ""
    customer_name: str = ""
    description: str = ""


class ContactClientIn(BaseModel):
    method: str = "telefone"
    message: str = ""


class QuickLogIn(BaseModel):
    event: str
    message: str = ""

    @field_validator("event")
    @classmethod
    def _v_event(cls, v):
        return _check_choice(v, set(QUICK_LOG_EVENTS), "Registo rápido")


class SupplierContact(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = ""
    phone: str = ""
    email: str = ""

    @field_validator("name")
    @classmethod
    def _v_name(cls, v):
        return (v or "").strip()

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        return normalize_email(v)


class SupplierIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    email: str = ""
    phone: str = ""
    category: str = ""
    notes: str = ""
    labels: List[str] = []
    contacts: List[SupplierContact] = []

    @field_validator("name")
    @classmethod
    def _v_name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("O nome do fornecedor é obrigatório")
        return v

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        return normalize_email(v)


class SubtaskItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    title: str
    done: bool = False


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    category: str = "construcao"
    done: bool = False
    priority: str = "nenhuma"
    due_date: str = ""
    repeat: str = "none"
    subtasks: List[SubtaskItem] = []
    labels: List[str] = []
    note_id: str = ""
    group_id: str = ""

    @field_validator("priority")
    @classmethod
    def _v_priority(cls, v):
        return _check_choice(v, TASK_PRIORITIES, "Prioridade")

    @field_validator("repeat")
    @classmethod
    def _v_repeat(cls, v):
        return _check_choice(v, TASK_REPEATS, "Repetição")


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    repeat: Optional[str] = None
    subtasks: Optional[List[SubtaskItem]] = None
    labels: Optional[List[str]] = None
    group_id: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _v_priority(cls, v):
        return _check_choice(v, TASK_PRIORITIES, "Prioridade")

    @field_validator("repeat")
    @classmethod
    def _v_repeat(cls, v):
        return _check_choice(v, TASK_REPEATS, "Repetição")


class TaskGroupIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str

    @field_validator("name")
    @classmethod
    def _v_name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("O nome do grupo é obrigatório")
        return v


class CaixilhariaItem(BaseModel):
    """Linha do esquema v1, mantida apenas para compatibilidade."""
    model_config = ConfigDict(extra="ignore")
    quantidade: int = 1
    largura_mm: int
    altura_mm: int
    sentido_abertura: str = ""

    @field_validator("quantidade")
    @classmethod
    def _v_qt(cls, v):
        if v < 1 or v > 999:
            raise ValueError("Quantidade tem de estar entre 1 e 999")
        return v

    @field_validator("largura_mm", "altura_mm")
    @classmethod
    def _v_mm(cls, v):
        if v < 50 or v > 10000:
            raise ValueError("Medidas em milímetros: entre 50 e 10000 mm")
        return v


class CaixilhariaOpcao(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    familia: str
    sistema: str
    material: str = ""
    material_ref: str = ""
    cor_aro: str = ""
    cor_folha: str = ""
    fechadura: str = ""
    muletas: str = ""
    estore: str = ""
    quadricula: str = ""
    quadricula_cor: str = ""
    observacoes: str = ""

    @field_validator("familia")
    @classmethod
    def _v_familia(cls, v):
        return _check_choice(v, list(CAIXILHARIA_FAMILIAS), "Material / família")

    @field_validator("material")
    @classmethod
    def _v_material(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_MATERIAIS], "Vidro / painéis")

    @field_validator("fechadura")
    @classmethod
    def _v_fechadura(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_FECHADURAS], "Fechadura")

    @field_validator("muletas")
    @classmethod
    def _v_muletas(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_MULETAS], "Muletas")

    @field_validator("estore")
    @classmethod
    def _v_estore(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_ESTORES], "Estore")

    @field_validator("quadricula")
    @classmethod
    def _v_quadricula(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_QUADRICULAS], "Quadrícula")

    @model_validator(mode="after")
    def _v_sistema(self):
        family = CAIXILHARIA_FAMILIAS[self.familia]
        if self.sistema not in family["sistemas"]:
            raise ValueError(f"O sistema escolhido não pertence à família {family['label']}")
        return self


class CaixilhariaLinha(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    nome: str = ""
    produto: str
    quantidade: int = 1
    largura_mm: int
    altura_mm: int
    unidade_entrada: str = "mm"
    tipo_abertura: str = ""
    numero_folhas: Optional[int] = None
    sentido_abertura: str = ""
    opcoes: List[CaixilhariaOpcao]
    observacoes: str = ""

    @field_validator("produto")
    @classmethod
    def _v_produto(cls, v):
        return _check_choice(v, list(CAIXILHARIA_PRODUTOS), "Produto")

    @field_validator("quantidade")
    @classmethod
    def _v_qt(cls, v):
        if v < 1 or v > 999:
            raise ValueError("Quantidade tem de estar entre 1 e 999")
        return v

    @field_validator("largura_mm", "altura_mm")
    @classmethod
    def _v_mm(cls, v):
        if v < 50 or v > 10000:
            raise ValueError("Medidas em milímetros: entre 50 e 10000 mm")
        return v

    @field_validator("unidade_entrada")
    @classmethod
    def _v_unidade(cls, v):
        return _check_choice(v, ["mm", "cm"], "Unidade de introdução")

    @field_validator("tipo_abertura")
    @classmethod
    def _v_tipo_abertura(cls, v):
        return _check_choice(v, list(CAIXILHARIA_TIPOS_ABERTURA), "Tipo de abertura")

    @field_validator("numero_folhas")
    @classmethod
    def _v_numero_folhas(cls, v):
        if v is not None and (v < 1 or v > 6):
            raise ValueError("O número de folhas tem de estar entre 1 e 6")
        return v

    @model_validator(mode="after")
    def _v_opcoes(self):
        if not self.opcoes:
            raise ValueError("Cada elemento precisa de pelo menos uma opção de fabrico")
        seen = set()
        for option in self.opcoes:
            family = CAIXILHARIA_FAMILIAS[option.familia]
            if self.produto not in family["produtos"]:
                product = CAIXILHARIA_PRODUTOS[self.produto].lower()
                raise ValueError(f"A família {family['label']} não se aplica a {product}")
            key = (option.familia, option.sistema)
            if key in seen:
                raise ValueError("O mesmo material e sistema está repetido no elemento")
            seen.add(key)
            model = CAIXILHARIA_MODELOS.get(option.sistema)
            if not model:
                continue
            if self.produto not in model.get("products", []):
                raise ValueError(f"O modelo {model['name']} não se aplica ao produto escolhido")
            category = model.get("category")
            if self.tipo_abertura == "correr" and category != "correr":
                raise ValueError(f"O modelo {model['name']} não é uma série de correr")
            if self.tipo_abertura in {"abrir_batente", "oscilo_batente", "basculante"} and category == "correr":
                raise ValueError(f"O modelo {model['name']} é de correr e não corresponde à abertura escolhida")
            if self.tipo_abertura == "portada" and category != "portada":
                raise ValueError(f"O modelo {model['name']} não é uma portada")
            leaves = model.get("leaves") or []
            if self.numero_folhas and leaves and self.numero_folhas not in leaves:
                allowed = ", ".join(str(value) for value in leaves)
                raise ValueError(f"O modelo {model['name']} admite {allowed} folha(s)")
        return self


class CaixilhariaIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    schema_version: int = 2
    tipo_pedido: str = "orcamento"
    linhas: List[CaixilhariaLinha] = []
    observacoes: str = ""
    data_entrega: str = ""

    # Campos do esquema v1. Permitem que clientes ainda não atualizados gravem
    # pedidos; o endpoint converte-os imediatamente para o esquema v2.
    produto: str = ""
    familia: str = ""
    sistema: str = ""
    material: str = ""
    material_ref: str = ""
    cor_aro: str = ""
    cor_folha: str = ""
    fechadura: str = ""
    muletas: str = ""
    estore: str = ""
    itens: List[CaixilhariaItem] = []

    @field_validator("tipo_pedido")
    @classmethod
    def _v_tipo(cls, v):
        return _check_choice(v, ["orcamento", "encomenda"], "Tipo de pedido")

    @field_validator("produto")
    @classmethod
    def _v_produto(cls, v):
        return _check_choice(v, list(CAIXILHARIA_PRODUTOS), "Produto") if v else v

    @field_validator("familia")
    @classmethod
    def _v_familia(cls, v):
        return _check_choice(v, list(CAIXILHARIA_FAMILIAS), "Sistema (família)") if v else v

    @field_validator("material")
    @classmethod
    def _v_material(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_MATERIAIS], "Material")

    @field_validator("fechadura")
    @classmethod
    def _v_fechadura(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_FECHADURAS], "Fechadura")

    @field_validator("muletas")
    @classmethod
    def _v_muletas(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_MULETAS], "Muletas")

    @field_validator("estore")
    @classmethod
    def _v_estore(cls, v):
        return _check_choice(v, ["", *CAIXILHARIA_ESTORES], "Estore")

    @model_validator(mode="after")
    def _v_coerencia(self):
        if self.linhas:
            if self.tipo_pedido == "encomenda" and any(len(line.opcoes) > 1 for line in self.linhas):
                raise ValueError("Uma encomenda não pode ter alternativas: escolha uma opção ou mude para Orçamento")
            return self
        if not self.produto or not self.familia or not self.sistema:
            raise ValueError("Adicione pelo menos um elemento com produto, medidas e opção de fabrico")
        fam = CAIXILHARIA_FAMILIAS[self.familia]
        if self.sistema not in fam["sistemas"]:
            raise ValueError(f"O sistema escolhido não pertence à família {fam['label']}")
        if self.produto not in fam["produtos"]:
            raise ValueError(f"A família {fam['label']} não se aplica a {CAIXILHARIA_PRODUTOS[self.produto].lower()}")
        if not self.itens:
            raise ValueError("Adicione pelo menos uma medida (quantidade, largura e altura)")
        return self


class QuoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str = ""
    supplier_name: str = ""
    product: str = ""
    price: float = 0.0
    currency: str = "EUR"
    notes: str = ""

    @field_validator("price")
    @classmethod
    def _v_price(cls, v):
        if v is not None and v < 0:
            raise ValueError("O preço não pode ser negativo")
        return v


class QuoteRequestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str = ""
    supplier_ids: List[str] = []
    subject: str
    body: str
    is_reminder: bool = False


# ---------- Notes ----------
async def segment_clause(segment):
    """Filtro Mongo que separa as duas áreas da app: «band» (Orçamentos Banda
    Alumínios) e «geral» (Pedidos Gerais da Loja). Um pedido pertence à Banda
    quando tem caixilharia à medida ou está associado a um fornecedor Band*.
    Cada área só vê os seus pedidos — nunca se misturam."""
    if segment not in ("band", "geral"):
        return None
    band_ids = [s["id"] async for s in db.suppliers.find(
        {"name": {"$regex": "band", "$options": "i"}}, {"_id": 0, "id": 1})]
    band_or = [{"caixilharia": {"$exists": True, "$ne": None}}, {"supplier_id": {"$in": band_ids}}]
    return {"$or": band_or} if segment == "band" else {"$nor": band_or}


@api_router.get("/notes")
async def list_notes(
    search: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None,
    category: Optional[str] = None, supplier_id: Optional[str] = None, label: Optional[str] = None,
    overdue: Optional[bool] = None, archived: Optional[bool] = None,
    waiting: Optional[str] = None, reminder_due: Optional[bool] = None, callback: Optional[bool] = None,
    segment: Optional[str] = None, sort: str = "smart", skip: int = 0, limit: int = 300,
):
    q = {}
    q["archived"] = True if archived else {"$ne": True}
    if status:
        q["status"] = {"$in": status.split(",")}
    if priority:
        q["priority"] = {"$in": priority.split(",")}
    if category:
        q["category"] = {"$in": category.split(",")}
    if supplier_id:
        q["supplier_id"] = supplier_id
    if label:
        q["labels"] = label
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"customer_name": rx}, {"description": rx}, {"phone": rx}, {"email": rx},
                    {"details": rx}, {"measurements": rx}, {"reference": rx}, {"labels": rx}]
        # Telefones: quem procura "917 100 512" ou "917-100" tem de encontrar
        # o número guardado como "917100512" — compara só os dígitos.
        digits = re.sub(r"\D", "", search)
        if len(digits) >= 3:
            q["$or"].append({"phone": {"$regex": r"\D*".join(digits)}})
    seg = await segment_clause(segment)
    if seg:
        # $and evita colisão com o $or da pesquisa.
        q = {"$and": [q, seg]}
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    now = datetime.now(timezone.utc)
    docs = [enrich_note(d, now) for d in docs]
    if overdue:
        docs = [d for d in docs if d["is_overdue"]]
    if waiting:
        docs = [d for d in docs if d["waiting_on"] == waiting]
    if reminder_due:
        docs = [d for d in docs if d.get("reminder_due")]
    if callback:
        docs = [d for d in docs if d.get("needs_callback")]
    if sort == "priority":
        docs.sort(key=lambda d: (PRIORITY_RANK.get(d.get("priority"), 2), d.get("created_at")))
    elif sort == "urgency":
        docs.sort(key=lambda d: -d.get("priority_score", 0))
    elif sort == "deadline":
        docs.sort(key=lambda d: -d.get("waiting_days", 0))
    elif sort == "customer":
        docs.sort(key=lambda d: (d.get("customer_name") or "").lower())
    elif sort == "recent":
        docs.sort(key=lambda d: d.get("created_at") or "", reverse=True)
    else:  # "smart" e qualquer valor desconhecido
        docs.sort(key=lambda d: (0 if d["is_overdue"] else 1, PRIORITY_RANK.get(d.get("priority"), 2),
                                 d.get("status_updated_at") or d.get("created_at")))
    skip = max(skip, 0)
    limit = min(max(limit, 1), 500)
    page = docs[skip:skip + limit]
    # Últimas alterações de cada pedido da página, numa única consulta —
    # aparecem no cartão da lista sem ser preciso abrir o pedido.
    ids = [d["id"] for d in page]
    if ids:
        acts = await db.activities.find(
            {"note_id": {"$in": ids}},
            {"_id": 0, "note_id": 1, "type": 1, "message": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(20000)
        recent = {}
        for a in acts:
            bucket = recent.setdefault(a["note_id"], [])
            if len(bucket) < 3:
                bucket.append(a)
        for d in page:
            d["recent_activities"] = recent.get(d["id"], [])
        photo_counts = await db.note_files.aggregate([
            {"$match": {"note_id": {"$in": ids}, "kind": "photo"}},
            {"$group": {"_id": "$note_id", "count": {"$sum": 1}}},
        ]).to_list(len(ids))
        counts_by_id = {c["_id"]: c["count"] for c in photo_counts}
        for d in page:
            d["photo_count"] = counts_by_id.get(d["id"], 0)
    return {"items": page, "total": len(docs)}


@api_router.post("/notes/check-duplicate")
async def check_duplicate(payload: DuplicateCheckIn):
    ors = []
    phone_norm = normalize_phone_loose(payload.phone)
    if phone_norm:
        ors.append({"phone": phone_norm})
    if payload.customer_name.strip():
        ors.append({"customer_name": {"$regex": re.escape(payload.customer_name.strip()), "$options": "i"}})
    if not ors:
        return {"matches": []}
    q = {"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}, "$or": ors}
    docs = await db.notes.find(q, {"_id": 0, "id": 1, "customer_name": 1, "description": 1, "status": 1, "phone": 1}).limit(5).to_list(5)
    return {"matches": docs}


@api_router.post("/notes")
async def create_note(payload: NoteIn):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_by": AUTHOR, "archived": False,
                "last_supplier_sent_at": "", "last_client_contact_at": "", "last_client_reply_at": "",
                "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
                "client_no_answer_count": 0, "supplier_no_answer_count": 0,
                "last_client_attempt_at": "", "last_supplier_attempt_at": "",
                "created_at": now_iso(), "updated_at": now_iso(), "status_updated_at": now_iso()})
    await db.notes.insert_one(dict(doc))
    await log_activity(doc["id"], "created", f"Pedido criado para {doc.get('customer_name') or 'cliente'}")
    return enrich_note(doc)


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    doc["photo_count"] = await db.note_files.count_documents({"note_id": note_id, "kind": "photo"})
    return enrich_note(doc)


def _archive_side_effects(update, new_status, current_status):
    if new_status != current_status:
        if new_status in ARCHIVE_STATUSES:
            update["archived"] = True
        elif current_status in ARCHIVE_STATUSES:
            update["archived"] = False


@api_router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NotePatch):
    current = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    if "status" in update and update["status"] != current.get("status"):
        update["status_updated_at"] = now_iso()
        _archive_side_effects(update, update["status"], current.get("status"))
        await log_activity(note_id, "status_change",
                           f"Estado: {STATUS_LABEL.get(current.get('status'))} → {STATUS_LABEL.get(update['status'])}",
                           {"from": current.get("status"), "to": update["status"]})
    if "priority" in update and update["priority"] != current.get("priority"):
        await log_activity(note_id, "priority_change", f"Prioridade alterada para {update['priority']}", {"to": update["priority"]})
    fl = {"customer_name": "cliente", "phone": "telefone", "email": "email", "description": "descrição",
          "details": "notas", "category": "secção", "measurements": "medidas", "labels": "etiquetas",
          "supplier_id": "fornecedor", "sla_days": "prazo", "reference": "referência"}
    changed = [fl[k] for k in update if k in fl and update[k] != current.get(k)]
    if changed:
        await log_activity(note_id, "updated", "Atualizado: " + ", ".join(changed))
    await db.notes.update_one({"id": note_id}, {"$set": update})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.patch("/notes/{note_id}/status")
async def change_status(note_id: str, payload: StatusIn):
    current = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Estado inválido")
    update = {"status": payload.status, "status_updated_at": now_iso(), "updated_at": now_iso()}
    _archive_side_effects(update, payload.status, current.get("status"))
    if payload.status != current.get("status"):
        await log_activity(note_id, "status_change",
                           f"Estado: {STATUS_LABEL.get(current.get('status'))} → {STATUS_LABEL.get(payload.status)}",
                           {"from": current.get("status"), "to": payload.status})
    await db.notes.update_one({"id": note_id}, {"$set": update})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.post("/notes/{note_id}/resolve")
async def resolve_note(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "concluido", "archived": True, "status_updated_at": now_iso(), "updated_at": now_iso()}})
    await log_activity(note_id, "status_change", "Pedido marcado como resolvido e arquivado", {"to": "concluido"})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.post("/notes/{note_id}/reopen")
async def reopen_note(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "pendente", "archived": False, "status_updated_at": now_iso(), "updated_at": now_iso()}})
    await log_activity(note_id, "status_change", "Pedido reaberto", {"to": "pendente"})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.post("/notes/{note_id}/contact-client")
async def contact_client(note_id: str, payload: ContactClientIn):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "aguarda_cliente", "last_client_contact_at": now_iso(),
        "status_updated_at": now_iso(), "updated_at": now_iso()}})
    msg = f"Cliente contactado ({payload.method})" + (f": {payload.message}" if payload.message else "")
    await log_activity(note_id, "client_contact", msg, {"method": payload.method})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


class ClientSendIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject: str = ""
    body: str = ""
    to: str = ""
    pdf_file_id: str = ""


@api_router.post("/notes/{note_id}/send-client-quote")
async def send_client_quote(note_id: str, payload: ClientSendIn):
    """Envio do orçamento ao cliente por email, com o PDF anexado — só corre
    depois da confirmação explícita no ecrã de revisão."""
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    to = payload.to.strip() or (n.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="O cliente não tem email — adicione-o nos Detalhes.")
    if not payload.subject.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="O assunto e a mensagem não podem estar vazios.")
    attachments = []
    file_id = payload.pdf_file_id or (n.get("pending_client_send") or {}).get("pdf_file_id") or ""
    if file_id:
        f = await db.note_files.find_one({"id": file_id, "note_id": note_id}, {"_id": 0})
        if f:
            attachments.append({"data": base64.b64decode(f["content_b64"]), "filename": f.get("filename")})
    await _send_email(to, payload.subject, payload.body, attachments,
                      note_id=note_id, kind="client", to_label=n.get("customer_name") or "", pdf_file_id=file_id)
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "aguarda_cliente", "last_client_contact_at": now_iso(),
        "status_updated_at": now_iso(), "updated_at": now_iso()},
        "$unset": {"pending_client_send": ""}})
    anexo = f" com {attachments[0]['filename']}" if attachments else ""
    await log_activity(note_id, "email_sent", f"Orçamento enviado ao cliente por email{anexo}",
                       {"to": to, "file_id": file_id})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.delete("/notes/{note_id}/pending-client-send")
async def cancel_pending_client_send(note_id: str):
    """Descarta o rascunho preparado automaticamente — nada foi enviado."""
    await db.notes.update_one({"id": note_id}, {
        "$unset": {"pending_client_send": ""}, "$set": {"updated_at": now_iso()}})
    await log_activity(note_id, "updated", "Rascunho de email ao cliente descartado (nada foi enviado)")
    return {"ok": True}


@api_router.post("/notes/{note_id}/quick-log")
async def quick_log(note_id: str, payload: QuickLogIn):
    cfg = QUICK_LOG_EVENTS[payload.event]
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    update = {"$set": {"updated_at": now_iso()}}
    if cfg.get("touch_client"):
        update["$set"]["last_client_contact_at"] = now_iso()
    if cfg.get("reset_counter"):
        update["$set"][cfg["reset_counter"]] = 0
    if cfg.get("attempt_field"):
        update["$set"][cfg["attempt_field"]] = now_iso()
    if cfg.get("counter"):
        update["$inc"] = {cfg["counter"]: 1}
    if cfg.get("label"):
        update["$addToSet"] = {"labels": cfg["label"]}
    await db.notes.update_one({"id": note_id}, update)
    clear = [lbl for lbl in cfg.get("clear_labels", []) if lbl != cfg.get("label")]
    if clear:
        await db.notes.update_one({"id": note_id}, {"$pull": {"labels": {"$in": clear}}})
    extra = payload.message.strip()
    msg = cfg["message"] + (f" — {extra}" if extra else "")
    await log_activity(note_id, cfg["type"], msg, {"event": payload.event})
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.post("/notes/{note_id}/duplicate")
async def duplicate_note(note_id: str):
    src = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    doc = {k: src.get(k, "") for k in ["customer_name", "phone", "email", "description", "details",
                                        "category", "measurements", "quantity", "color", "reference", "supplier_id"]}
    doc.update({"id": str(uuid.uuid4()), "labels": list(src.get("labels", [])), "priority": src.get("priority", "media"),
                "status": "novo", "sla_days": src.get("sla_days", DEFAULT_SLA_DAYS),
                "reminder_interval_days": src.get("reminder_interval_days", 3),
                "archived": False, "created_by": AUTHOR, "last_supplier_sent_at": "", "last_client_contact_at": "",
                "last_client_reply_at": "",
                "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
                "client_no_answer_count": 0, "supplier_no_answer_count": 0,
                "last_client_attempt_at": "", "last_supplier_attempt_at": "",
                "created_at": now_iso(), "updated_at": now_iso(), "status_updated_at": now_iso()})
    await db.notes.insert_one(dict(doc))
    await log_activity(doc["id"], "created", f"Pedido duplicado de {src.get('customer_name') or 'pedido anterior'}")
    return enrich_note(doc)


@api_router.get("/notes/{note_id}/suggest-supplier")
async def suggest_supplier(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    _, _, per_sup_avg, _ = await compute_response()
    sups = await db.suppliers.find({}, {"_id": 0}).to_list(2000)
    same = [s for s in sups if s.get("category") == n.get("category")]
    pool = same or sups

    def rank(s):
        return (0 if s.get("email") else 1, per_sup_avg.get(s.get("name"), 9999))
    pool = sorted(pool, key=rank)
    for s in pool:
        s["avg_hours"] = per_sup_avg.get(s.get("name"))
    return {"suggestions": pool[:3]}


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    """Move para a lixeira em vez de apagar — "nada se perde" (lógica base
    6): o pedido some das listas normais mas pode ser restaurado por
    inteiro. Só uma eliminação a partir da própria lixeira é definitiva
    (ver purge_note). As tarefas do pedido vão com ele; orçamentos,
    cronologia, pedidos de cotação e ficheiros ficam tal como estavam nas
    suas coleções — só voltam a ficar "vivos" quando o pedido for
    restaurado, porque nenhum outro sítio os lista sem passar pelo pedido."""
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    doc["deleted_at"] = now_iso()
    await db.notes_trash.insert_one(dict(doc))
    await db.notes.delete_one({"id": note_id})
    note_tasks_docs = await db.tasks.find({"note_id": note_id}, {"_id": 0}).to_list(500)
    if note_tasks_docs:
        for t in note_tasks_docs:
            t["deleted_at"] = now_iso()
        await db.tasks_trash.insert_many(note_tasks_docs)
        await db.tasks.delete_many({"note_id": note_id})
    return {"ok": True}


@api_router.get("/trash")
async def list_trash():
    """Lixeira unificada — pedidos, tarefas e fornecedores movidos para
    aqui, todos no mesmo sítio (lógica base 24: tudo pode ser restaurado)."""
    notes = await db.notes_trash.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)
    tasks = await db.tasks_trash.find({"note_id": {"$in": ["", None]}}, {"_id": 0}).sort("deleted_at", -1).to_list(500)
    suppliers = await db.suppliers_trash.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)
    items = (
        [{"kind": "pedido", "id": n["id"], "label": n.get("customer_name") or "Sem nome",
          "sublabel": n.get("description") or "", "deleted_at": n.get("deleted_at") or ""} for n in notes]
        + [{"kind": "tarefa", "id": t["id"], "label": t.get("title") or "Tarefa",
            "sublabel": t.get("due_date") or "", "deleted_at": t.get("deleted_at") or ""} for t in tasks]
        + [{"kind": "fornecedor", "id": s["id"], "label": s.get("name") or "Fornecedor",
            "sublabel": s.get("email") or "", "deleted_at": s.get("deleted_at") or ""} for s in suppliers]
    )
    items.sort(key=lambda x: x["deleted_at"], reverse=True)
    return {"items": items}


@api_router.get("/trash/notes")
async def list_trashed_notes():
    return await db.notes_trash.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)


@api_router.post("/trash/notes/{note_id}/restore")
async def restore_note(note_id: str):
    doc = await db.notes_trash.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na lixeira")
    doc.pop("deleted_at", None)
    await db.notes.insert_one(dict(doc))
    await db.notes_trash.delete_one({"id": note_id})
    trashed_tasks = await db.tasks_trash.find({"note_id": note_id}, {"_id": 0}).to_list(500)
    if trashed_tasks:
        for t in trashed_tasks:
            t.pop("deleted_at", None)
        await db.tasks.insert_many(trashed_tasks)
        await db.tasks_trash.delete_many({"note_id": note_id})
    await log_activity(note_id, "updated", "Pedido restaurado da lixeira")
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.delete("/trash/notes/{note_id}")
async def purge_note(note_id: str):
    """Eliminação definitiva a partir da lixeira — a única forma de apagar
    um pedido para sempre; o DELETE normal nunca apaga dados, só move para
    aqui."""
    res = await db.notes_trash.delete_one({"id": note_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na lixeira")
    await db.tasks_trash.delete_many({"note_id": note_id})
    await db.quotes.delete_many({"note_id": note_id})
    await db.activities.delete_many({"note_id": note_id})
    await db.quote_requests.delete_many({"note_id": note_id})
    await db.note_files.delete_many({"note_id": note_id})
    return {"ok": True}


@api_router.get("/notes/{note_id}/activities")
async def note_activities(note_id: str):
    return await db.activities.find({"note_id": note_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/notes/{note_id}/comment")
async def add_comment(note_id: str, payload: CommentIn):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    await log_activity(note_id, "comment", payload.message.strip())
    return {"ok": True}


@api_router.get("/labels")
async def list_labels():
    used = await db.notes.distinct("labels")
    return list(dict.fromkeys(PREDEFINED_LABELS + [u for u in used if u]))


# ---------- Suppliers ----------
async def _supplier_name_taken(name, exclude_id=None):
    q = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.suppliers.find_one(q, {"_id": 0, "id": 1})


async def _suppliers_with_stats(sups):
    if not sups:
        return sups
    ids = [s["id"] for s in sups]
    names = [s["name"] for s in sups]
    note_counts = {}
    async for n in db.notes.find({"supplier_id": {"$in": ids}}, {"_id": 0, "supplier_id": 1, "archived": 1}):
        c = note_counts.setdefault(n["supplier_id"], {"total": 0, "open": 0})
        c["total"] += 1
        if not n.get("archived"):
            c["open"] += 1
    quote_counts = {}
    async for q in db.quotes.find({"supplier_name": {"$in": names}}, {"_id": 0, "supplier_name": 1, "approved": 1}):
        c = quote_counts.setdefault(q["supplier_name"], {"total": 0, "approved": 0})
        c["total"] += 1
        if q.get("approved"):
            c["approved"] += 1
    for s in sups:
        nc = note_counts.get(s["id"], {"total": 0, "open": 0})
        qc = quote_counts.get(s["name"], {"total": 0, "approved": 0})
        s["open_notes"] = nc["open"]
        s["total_notes"] = nc["total"]
        s["quotes_given"] = qc["total"]
        s["quotes_approved"] = qc["approved"]
    return sups


@api_router.get("/suppliers")
async def list_suppliers():
    sups = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return await _suppliers_with_stats(sups)


@api_router.post("/suppliers")
async def create_supplier(payload: SupplierIn):
    if await _supplier_name_taken(payload.name):
        raise HTTPException(status_code=409, detail=f'Já existe um fornecedor chamado "{payload.name}".')
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.suppliers.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, payload: SupplierIn):
    if await _supplier_name_taken(payload.name, exclude_id=supplier_id):
        raise HTTPException(status_code=409, detail=f'Já existe um fornecedor chamado "{payload.name}".')
    res = await db.suppliers.update_one({"id": supplier_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})


@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, force: bool = False):
    open_notes = await db.notes.find(
        {"supplier_id": supplier_id, "archived": {"$ne": True}}, {"_id": 0, "id": 1, "customer_name": 1}
    ).to_list(500)
    if open_notes and not force:
        names = ", ".join(n.get("customer_name") or "cliente" for n in open_notes[:5])
        more = f" e mais {len(open_notes) - 5}" if len(open_notes) > 5 else ""
        raise HTTPException(
            status_code=409,
            detail=f"Este fornecedor está associado a {len(open_notes)} pedido(s) em aberto ({names}{more}). "
                   "Confirme novamente para desassociar e eliminar na mesma.")
    if open_notes:
        await db.notes.update_many({"supplier_id": supplier_id}, {"$set": {"supplier_id": ""}})
    doc = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if doc:
        doc["deleted_at"] = now_iso()
        await db.suppliers_trash.insert_one(dict(doc))
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True, "unlinked_notes": len(open_notes)}


@api_router.get("/trash/suppliers")
async def list_trashed_suppliers():
    return await db.suppliers_trash.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)


@api_router.post("/trash/suppliers/{supplier_id}/restore")
async def restore_supplier(supplier_id: str):
    doc = await db.suppliers_trash.find_one({"id": supplier_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado na lixeira")
    if await _supplier_name_taken(doc.get("name", "")):
        raise HTTPException(status_code=409, detail=f'Já existe um fornecedor chamado "{doc.get("name")}" — renomeia um dos dois antes de restaurar.')
    doc.pop("deleted_at", None)
    await db.suppliers.insert_one(dict(doc))
    await db.suppliers_trash.delete_one({"id": supplier_id})
    return doc


@api_router.delete("/trash/suppliers/{supplier_id}")
async def purge_supplier(supplier_id: str):
    res = await db.suppliers_trash.delete_one({"id": supplier_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado na lixeira")
    await db.attachments.delete_many({"owner_kind": "supplier", "owner_id": supplier_id})
    return {"ok": True}


# ---------- Anexos genéricos (fornecedor / tarefa) ----------
# Mesmo padrão dos anexos do pedido (note_files), numa coleção partilhada —
# "tudo pode ter anexos" (lógica base 15), não só pedidos e emails.
GENERIC_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024


def _attachment_meta(f):
    return {
        "id": f["id"], "owner_kind": f.get("owner_kind"), "owner_id": f.get("owner_id"),
        "group_id": f.get("group_id") or f["id"], "version": f.get("version") or 1,
        "filename": f.get("filename") or "ficheiro", "content_type": f.get("content_type") or "application/octet-stream",
        "size": f.get("size") or 0, "created_at": f.get("created_at"),
    }


async def _list_attachments(owner_kind: str, owner_id: str):
    """Lista só a versão mais recente de cada ficheiro — "nunca substituir
    um ficheiro" (lógica base das versões): enviar de novo com o mesmo
    group_id cria uma versão nova em vez de apagar a anterior; esta lista
    mostra sempre a atual, com o histórico completo em
    GET /attachments/{id}/versions."""
    docs = await db.attachments.find(
        {"owner_kind": owner_kind, "owner_id": owner_id}, {"_id": 0, "content_b64": 0},
    ).sort("version", 1).to_list(1000)
    latest_by_group = {}
    counts = {}
    for f in docs:
        gid = f.get("group_id") or f["id"]
        latest_by_group[gid] = f
        counts[gid] = counts.get(gid, 0) + 1
    items = sorted(latest_by_group.values(), key=lambda f: f.get("created_at") or "", reverse=True)
    result = []
    for f in items:
        meta = _attachment_meta(f)
        meta["version_count"] = counts.get(meta["group_id"], 1)
        result.append(meta)
    return result


async def _upload_attachments(owner_kind: str, owner_id: str, files: List[UploadFile], group_id: Optional[str] = None):
    saved = []
    for file in files:
        data = await file.read()
        if not data:
            continue
        if len(data) > GENERIC_ATTACHMENT_MAX_BYTES:
            raise HTTPException(status_code=400, detail=f'"{file.filename}" é demasiado grande (máx. 15 MB).')
        new_id = str(uuid.uuid4())
        gid = group_id or new_id
        version = 1 + await db.attachments.count_documents({"group_id": gid}) if group_id else 1
        doc = {
            "id": new_id, "owner_kind": owner_kind, "owner_id": owner_id, "group_id": gid, "version": version,
            "filename": file.filename or "ficheiro", "content_type": file.content_type or "application/octet-stream",
            "size": len(data), "content_b64": base64.b64encode(data).decode(), "created_at": now_iso(),
        }
        await db.attachments.insert_one(doc)
        saved.append(_attachment_meta(doc))
    return saved


@api_router.get("/attachments/{file_id}")
async def download_attachment(file_id: str):
    f = await db.attachments.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    return Response(
        content=base64.b64decode(f["content_b64"]), media_type=f.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{f.get("filename", "ficheiro")}"'})


@api_router.get("/attachments/{file_id}/versions")
async def list_attachment_versions(file_id: str):
    f = await db.attachments.find_one({"id": file_id}, {"_id": 0, "content_b64": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    gid = f.get("group_id") or file_id
    docs = await db.attachments.find({"group_id": gid}, {"_id": 0, "content_b64": 0}).sort("version", 1).to_list(200)
    return [_attachment_meta(d) for d in docs]


@api_router.get("/suppliers/{supplier_id}/files")
async def list_supplier_files(supplier_id: str):
    return await _list_attachments("supplier", supplier_id)


@api_router.post("/suppliers/{supplier_id}/files")
async def upload_supplier_files(supplier_id: str, files: List[UploadFile] = File(...)):
    if not await db.suppliers.find_one({"id": supplier_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return await _upload_attachments("supplier", supplier_id, files)


@api_router.post("/suppliers/{supplier_id}/files/{file_id}/versions")
async def upload_supplier_file_version(supplier_id: str, file_id: str, file: UploadFile = File(...)):
    existing = await db.attachments.find_one({"id": file_id, "owner_kind": "supplier", "owner_id": supplier_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    saved = await _upload_attachments("supplier", supplier_id, [file], group_id=existing.get("group_id") or file_id)
    return saved[0]


@api_router.delete("/suppliers/{supplier_id}/files/{file_id}")
async def delete_supplier_file(supplier_id: str, file_id: str):
    res = await db.attachments.delete_one({"id": file_id, "owner_kind": "supplier", "owner_id": supplier_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    return {"ok": True}


@api_router.get("/tasks/{task_id}/files")
async def list_task_files(task_id: str):
    return await _list_attachments("task", task_id)


@api_router.post("/tasks/{task_id}/files")
async def upload_task_files(task_id: str, files: List[UploadFile] = File(...)):
    if not await db.tasks.find_one({"id": task_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return await _upload_attachments("task", task_id, files)


@api_router.post("/tasks/{task_id}/files/{file_id}/versions")
async def upload_task_file_version(task_id: str, file_id: str, file: UploadFile = File(...)):
    existing = await db.attachments.find_one({"id": file_id, "owner_kind": "task", "owner_id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    saved = await _upload_attachments("task", task_id, [file], group_id=existing.get("group_id") or file_id)
    return saved[0]


@api_router.delete("/tasks/{task_id}/files/{file_id}")
async def delete_task_file(task_id: str, file_id: str):
    res = await db.attachments.delete_one({"id": file_id, "owner_kind": "task", "owner_id": task_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    return {"ok": True}


# ---------- Tasks ----------
def _with_subtask_ids(doc):
    for st in doc.get("subtasks") or []:
        if not st.get("id"):
            st["id"] = str(uuid.uuid4())
    return doc


def _next_due_date(due_date: str, repeat: str) -> Optional[str]:
    try:
        d = datetime.strptime(due_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return None
    if repeat == "daily":
        d = d + timedelta(days=1)
    elif repeat == "weekly":
        d = d + timedelta(days=7)
    elif repeat == "monthly":
        month = d.month + 1
        year = d.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                          31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        d = d.replace(year=year, month=month, day=day)
    else:
        return None
    return d.strftime("%Y-%m-%d")


async def _task_group_name_taken(name, exclude_id=None):
    q = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.task_groups.find_one(q, {"_id": 0, "id": 1})


@api_router.get("/task-groups")
async def list_task_groups():
    groups = await db.task_groups.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    counts = {}
    async for t in db.tasks.find({}, {"_id": 0, "group_id": 1}):
        gid = t.get("group_id")
        if gid:
            counts[gid] = counts.get(gid, 0) + 1
    for g in groups:
        g["tasks_count"] = counts.get(g["id"], 0)
    return groups


@api_router.post("/task-groups")
async def create_task_group(payload: TaskGroupIn):
    if await _task_group_name_taken(payload.name):
        raise HTTPException(status_code=409, detail=f'Já existe um grupo chamado "{payload.name}".')
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.task_groups.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/task-groups/{group_id}")
async def update_task_group(group_id: str, payload: TaskGroupIn):
    if await _task_group_name_taken(payload.name, exclude_id=group_id):
        raise HTTPException(status_code=409, detail=f'Já existe um grupo chamado "{payload.name}".')
    res = await db.task_groups.update_one({"id": group_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return await db.task_groups.find_one({"id": group_id}, {"_id": 0})


@api_router.delete("/task-groups/{group_id}")
async def delete_task_group(group_id: str):
    if not await db.task_groups.find_one({"id": group_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    await db.tasks.update_many({"group_id": group_id}, {"$set": {"group_id": ""}})
    await db.task_groups.delete_one({"id": group_id})
    return {"ok": True}


@api_router.get("/tasks")
async def list_tasks(note_id: Optional[str] = None, suggested: Optional[bool] = None):
    q = {}
    if note_id:
        q["note_id"] = note_id
    # Tarefas sugeridas pelo Correio Semanal ficam de fora da lista normal
    # até serem aceites — só aparecem quando pedidas explicitamente
    # (suggested=true), para não intrometer sugestões por confirmar na
    # lista de tarefas já assumidas.
    q["suggested"] = suggested if suggested is not None else {"$ne": True}
    return await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api_router.post("/tasks/{task_id}/accept-suggestion")
async def accept_task_suggestion(task_id: str):
    t = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    await db.tasks.update_one({"id": task_id}, {"$set": {"suggested": False}})
    t["suggested"] = False
    return t


@api_router.post("/tasks")
async def create_task(payload: TaskIn):
    doc = _with_subtask_ids(payload.model_dump())
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.tasks.insert_one(dict(doc))
    if doc.get("note_id"):
        await log_activity(doc["note_id"], "task_added", f"Lembrete criado: {doc['title']}")
    doc.pop("_id", None)
    return doc


@api_router.get("/notes/{note_id}/tasks")
async def note_tasks(note_id: str):
    return await db.tasks.find({"note_id": note_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/notes/{note_id}/tasks")
async def create_note_task(note_id: str, payload: TaskIn):
    doc = _with_subtask_ids(payload.model_dump())
    doc.update({"note_id": note_id, "id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.tasks.insert_one(dict(doc))
    await log_activity(note_id, "task_added", f"Lembrete criado: {doc['title']}")
    doc.pop("_id", None)
    return doc


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskPatch):
    current = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "subtasks" in update:
        update["subtasks"] = _with_subtask_ids({"subtasks": update["subtasks"]})["subtasks"]
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api_router.patch("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    new_done = not task.get("done", False)
    await db.tasks.update_one({"id": task_id}, {"$set": {"done": new_done}})
    if new_done and task.get("repeat", "none") != "none" and task.get("due_date"):
        next_date = _next_due_date(task["due_date"], task["repeat"])
        if next_date:
            next_doc = {
                "id": str(uuid.uuid4()), "title": task["title"], "category": task.get("category", "construcao"),
                "done": False, "priority": task.get("priority", "nenhuma"), "due_date": next_date,
                "repeat": task["repeat"], "note_id": task.get("note_id", ""),
                "group_id": task.get("group_id", ""), "created_at": now_iso(),
                "subtasks": [{"id": str(uuid.uuid4()), "title": st["title"], "done": False}
                             for st in task.get("subtasks", [])],
            }
            await db.tasks.insert_one(dict(next_doc))
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """Move para a lixeira em vez de apagar — ver delete_note para a mesma
    lógica aplicada aos pedidos."""
    doc = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    doc["deleted_at"] = now_iso()
    await db.tasks_trash.insert_one(dict(doc))
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


@api_router.get("/trash/tasks")
async def list_trashed_tasks():
    return await db.tasks_trash.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(500)


@api_router.post("/trash/tasks/{task_id}/restore")
async def restore_task(task_id: str):
    doc = await db.tasks_trash.find_one({"id": task_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada na lixeira")
    doc.pop("deleted_at", None)
    await db.tasks.insert_one(dict(doc))
    await db.tasks_trash.delete_one({"id": task_id})
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api_router.delete("/trash/tasks/{task_id}")
async def purge_task(task_id: str):
    res = await db.tasks_trash.delete_one({"id": task_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada na lixeira")
    return {"ok": True}


# ---------- Workspace: pesquisa global + IA contextual ----------
@api_router.get("/search")
async def global_search(q: str = ""):
    """Pesquisa unificada usada pela Área de Trabalho (Cmd+K / pesquisa
    global) — devolve os melhores resultados de cada tipo de conteúdo numa
    só chamada, para abrir o painel certo sem sair de onde se está."""
    term = (q or "").strip()
    if len(term) < 2:
        return {"notes": [], "suppliers": [], "tasks": [], "emails": []}
    rx = {"$regex": re.escape(term), "$options": "i"}
    note_or = [{"customer_name": rx}, {"description": rx}, {"phone": rx}, {"reference": rx}]
    digits = re.sub(r"\D", "", term)
    if len(digits) >= 3:
        note_or.append({"phone": {"$regex": r"\D*".join(digits)}})
    notes = await db.notes.find(
        {"$or": note_or},
        {"_id": 0, "id": 1, "customer_name": 1, "description": 1, "status": 1, "phone": 1, "archived": 1},
    ).sort("created_at", -1).limit(6).to_list(6)
    suppliers = await db.suppliers.find(
        {"$or": [{"name": rx}, {"email": rx}]},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "category": 1},
    ).limit(6).to_list(6)
    tasks = await db.tasks.find(
        {"title": rx},
        {"_id": 0, "id": 1, "title": 1, "done": 1, "due_date": 1, "note_id": 1},
    ).limit(6).to_list(6)
    emails = await db.received_emails.find(
        {"$or": [{"subject": rx}, {"from_name": rx}, {"from_email": rx}, {"supplier_name": rx}]},
        {"_id": 0, "id": 1, "subject": 1, "from_name": 1, "from_email": 1, "supplier_name": 1,
         "received_at": 1, "note_id": 1},
    ).sort("received_at", -1).limit(6).to_list(6)
    return {"notes": notes, "suppliers": suppliers, "tasks": tasks, "emails": emails}


@api_router.get("/system/status")
async def system_status():
    """Contadores em tempo real para o dock e a barra de estado — só
    contagens baratas, chamado pela app a cada 45s e ao voltar à janela."""
    pedidos = await db.notes.count_documents(
        {"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}})
    emails = await db.received_emails.count_documents({"seen": {"$ne": True}})
    tarefas = await db.tasks.count_documents({"done": {"$ne": True}})
    rascunhos = await db.notes.count_documents({"pending_client_send": {"$exists": True, "$ne": None}})
    state = await db.imap_state.find_one({"id": "inbox"}, {"_id": 0, "checked_at": 1}) or {}
    return {"pedidos_ativos": pedidos, "emails_nao_vistos": emails,
            "tarefas_pendentes": tarefas, "rascunhos": rascunhos,
            "last_sync": state.get("checked_at") or "", "now": now_iso()}


@api_router.get("/system/health")
async def system_health():
    """Painel de Saúde — visão geral do estado da app e das automações
    (equivalente a um gestor de tarefas), para responder a "está tudo a
    funcionar?" sem abrir nada. Só contagens/leituras baratas."""
    since_today = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
    pedidos_ativos = await db.notes.count_documents(
        {"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}})
    pedidos_esquecidos = await db.notes.count_documents(
        {"archived": {"$ne": True}, "status": {"$in": list(FORGOTTEN_STATUSES)}})
    emails_nao_vistos = await db.received_emails.count_documents({"seen": {"$ne": True}})
    emails_hoje = await db.received_emails.count_documents({"received_at": {"$gte": since_today}})
    tarefas_pendentes = await db.tasks.count_documents({"done": {"$ne": True}})
    rascunhos = await db.notes.count_documents({"pending_client_send": {"$exists": True, "$ne": None}})
    anexos_totais = await db.email_attachments.count_documents({})
    inbox_state = await db.imap_state.find_one({"id": "inbox"}, {"_id": 0, "checked_at": 1}) or {}
    sent_state = await db.imap_state.find_one({"id": "sent"}, {"_id": 0, "checked_at": 1}) or {}
    return {
        "pedidos_ativos": pedidos_ativos,
        "pedidos_esquecidos": pedidos_esquecidos,
        "emails_nao_vistos": emails_nao_vistos,
        "emails_hoje": emails_hoje,
        "tarefas_pendentes": tarefas_pendentes,
        "rascunhos": rascunhos,
        "anexos_totais": anexos_totais,
        "automacao": {
            "imap_configurado": SMTP_CONFIGURED,
            "imap_intervalo_min": IMAP_POLL_MINUTES,
            "ultima_verificacao_receb": inbox_state.get("checked_at") or "",
            "ultima_verificacao_env": sent_state.get("checked_at") or "",
            "ia_configurada": ai_available(),
        },
        "now": now_iso(),
    }


_DOWNLOAD_KIND_LABELS = {
    "supplier_pdf": "Orçamento do fornecedor", "client_pdf": "Orçamento ao cliente", "photo": "Foto",
}


@api_router.get("/system/downloads")
async def list_downloads(limit: int = 60):
    """Centro de Downloads — tudo o que entrou ou foi gerado (orçamentos de
    fornecedor, orçamentos ao cliente, fotos, anexos de email), por ordem
    cronológica, sem ter de percorrer pedido a pedido / email a email. Só
    metadados — o conteúdo (content_b64) fica de fora, é pesado e só é
    preciso ao descarregar de facto (endpoints já existentes)."""
    limit = min(max(limit, 1), 200)
    note_files = await db.note_files.find(
        {}, {"_id": 0, "content_b64": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    email_files = await db.email_attachments.find(
        {}, {"_id": 0, "content_b64": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    generic_files = await db.attachments.find(
        {}, {"_id": 0, "content_b64": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    note_ids = list({f.get("note_id") for f in note_files + email_files if f.get("note_id")})
    names = {}
    if note_ids:
        async for n in db.notes.find({"id": {"$in": note_ids}}, {"_id": 0, "id": 1, "customer_name": 1}):
            names[n["id"]] = n.get("customer_name") or ""
    supplier_ids = [f["owner_id"] for f in generic_files if f.get("owner_kind") == "supplier"]
    task_ids = [f["owner_id"] for f in generic_files if f.get("owner_kind") == "task"]
    owner_names = {}
    if supplier_ids:
        async for s in db.suppliers.find({"id": {"$in": supplier_ids}}, {"_id": 0, "id": 1, "name": 1}):
            owner_names[s["id"]] = s.get("name") or ""
    if task_ids:
        async for t in db.tasks.find({"id": {"$in": task_ids}}, {"_id": 0, "id": 1, "title": 1}):
            owner_names[t["id"]] = t.get("title") or ""
    items = []
    for f in note_files:
        items.append({
            "id": f["id"], "source": "note_file", "note_id": f.get("note_id") or "",
            "note_label": names.get(f.get("note_id"), ""),
            "filename": f.get("filename") or "ficheiro",
            "kind_label": _DOWNLOAD_KIND_LABELS.get(f.get("kind"), "Ficheiro"),
            "created_at": f.get("created_at") or "",
        })
    for f in email_files:
        items.append({
            "id": f["id"], "source": "email_attachment", "email_id": f.get("email_id") or "",
            "note_id": f.get("note_id") or "", "note_label": names.get(f.get("note_id"), ""),
            "filename": f.get("filename") or "ficheiro",
            "kind_label": "Anexo de email",
            "created_at": f.get("created_at") or "",
        })
    for f in generic_files:
        items.append({
            "id": f["id"], "source": "attachment", "note_id": "",
            "note_label": f'{"Fornecedor" if f.get("owner_kind") == "supplier" else "Tarefa"}: {owner_names.get(f.get("owner_id"), "")}',
            "filename": f.get("filename") or "ficheiro",
            "kind_label": "Anexo de fornecedor" if f.get("owner_kind") == "supplier" else "Anexo de tarefa",
            "created_at": f.get("created_at") or "",
        })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:limit]}


@api_router.get("/activity/global")
async def global_activity(limit: int = 40):
    """Centro de Atividade — linha do tempo única de tudo o que acontece na
    app, juntando a cronologia de todos os pedidos (activities) com os
    emails recebidos sem pedido associado (que não entram na cronologia de
    nenhum pedido e ficariam de fora)."""
    limit = min(max(limit, 1), 100)
    acts = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    note_ids = list({a.get("note_id") for a in acts if a.get("note_id")})
    names = {}
    if note_ids:
        async for n in db.notes.find({"id": {"$in": note_ids}}, {"_id": 0, "id": 1, "customer_name": 1}):
            names[n["id"]] = n.get("customer_name") or ""
    events = [{
        "at": a.get("created_at") or "", "kind": a.get("type") or "updated",
        "message": a.get("message") or "", "note_id": a.get("note_id") or "",
        "note_label": names.get(a.get("note_id"), ""),
    } for a in acts]
    unmatched = await db.received_emails.find(
        {"note_id": ""},
        {"_id": 0, "id": 1, "subject": 1, "from_name": 1, "from_email": 1,
         "supplier_name": 1, "received_at": 1},
    ).sort("received_at", -1).limit(limit).to_list(limit)
    for m in unmatched:
        who = m.get("supplier_name") or m.get("from_name") or m.get("from_email") or "?"
        events.append({
            "at": m.get("received_at") or "", "kind": "email_received",
            "message": f"Email de {who}: {m.get('subject') or '(sem assunto)'}",
            "note_id": "", "note_label": ""})
    events.sort(key=lambda e: e["at"], reverse=True)
    return {"items": events[:limit]}


# ---------- Explorador Inteligente ----------
# Não existe um sistema de ficheiros próprio — o Explorador é uma camada de
# leitura por cima dos dados que já existem (pedidos, fornecedores, emails,
# ficheiros), organizados em pastas virtuais e relações, em vez de uma
# árvore física de diretorias.
def _classify_filename(filename, content_type=""):
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    ct = (content_type or "").lower()
    if ct == "application/pdf" or ext == "pdf":
        return "pdf"
    if ct.startswith("image/") or ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"):
        return "image"
    if ext in ("xls", "xlsx", "csv") or "spreadsheet" in ct or ct == "text/csv":
        return "excel"
    return "other"


def _client_key(note):
    phone = normalize_phone_loose(note.get("phone") or "")
    if phone:
        return f"phone:{phone}"
    name = (note.get("customer_name") or "").strip().lower()
    return f"name:{name}" if name else None


@api_router.get("/explorer/files")
async def explorer_files(type: Optional[str] = None, scope: Optional[str] = None, limit: int = 200):
    """Todos os ficheiros da loja num único sítio — PDFs, imagens, Excel —
    venham eles de pedidos, emails ou fornecedores/tarefas, com a mesma
    classificação e a mesma informação de relação (pedido/fornecedor).
    PDFs de pedido (orçamento do fornecedor / orçamento ao cliente) que se
    repetem ao longo do tempo aparecem numerados como versões — nunca se
    apaga o anterior ao importar/gerar de novo, por isso o histórico já
    existe nos dados, só falta mostrá-lo."""
    limit = min(max(limit, 1), 500)
    note_files = await db.note_files.find({}, {"_id": 0, "content_b64": 0}).sort("created_at", 1).to_list(5000)
    email_files = await db.email_attachments.find({}, {"_id": 0, "content_b64": 0}).sort("created_at", -1).to_list(5000)
    generic_files = await db.attachments.find({}, {"_id": 0, "content_b64": 0}).sort("version", 1).to_list(5000)

    note_ids = list({f.get("note_id") for f in note_files + email_files if f.get("note_id")})
    notes_by_id = {}
    if note_ids:
        async for n in db.notes.find({"id": {"$in": note_ids}}, {"_id": 0, "id": 1, "customer_name": 1, "supplier_id": 1}):
            notes_by_id[n["id"]] = n
    supplier_ids = {n.get("supplier_id") for n in notes_by_id.values() if n.get("supplier_id")}
    supplier_ids |= {f["owner_id"] for f in generic_files if f.get("owner_kind") == "supplier"}
    suppliers_by_id = {}
    if supplier_ids:
        async for s in db.suppliers.find({"id": {"$in": list(supplier_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            suppliers_by_id[s["id"]] = s.get("name") or ""
    task_ids = {f["owner_id"] for f in generic_files if f.get("owner_kind") == "task"}
    tasks_by_id = {}
    if task_ids:
        async for t in db.tasks.find({"id": {"$in": list(task_ids)}}, {"_id": 0, "id": 1, "title": 1}):
            tasks_by_id[t["id"]] = t.get("title") or ""

    items = []
    note_file_groups = {}
    for f in note_files:
        note_file_groups.setdefault((f.get("note_id"), f.get("kind")), []).append(f)
    for (note_id, kind), docs in note_file_groups.items():
        total = len(docs)
        note = notes_by_id.get(note_id, {})
        for i, f in enumerate(docs):
            items.append({
                "id": f["id"], "source": "note_file", "filename": f.get("filename") or "ficheiro",
                "file_type": _classify_filename(f.get("filename"), f.get("content_type")),
                "kind_label": _DOWNLOAD_KIND_LABELS.get(kind, "Ficheiro"),
                "created_at": f.get("created_at") or "",
                "note_id": note_id or "", "note_label": note.get("customer_name") or "",
                "supplier_id": note.get("supplier_id") or "", "supplier_label": suppliers_by_id.get(note.get("supplier_id"), ""),
                "version": i + 1, "version_count": total, "is_current": i == total - 1,
            })
    for f in email_files:
        note = notes_by_id.get(f.get("note_id"), {})
        items.append({
            "id": f["id"], "source": "email_attachment", "filename": f.get("filename") or "ficheiro",
            "file_type": _classify_filename(f.get("filename"), f.get("content_type")),
            "kind_label": "Anexo de email", "created_at": f.get("created_at") or "",
            "note_id": f.get("note_id") or "", "note_label": note.get("customer_name") or "",
            "email_id": f.get("email_id") or "", "supplier_id": "", "supplier_label": "",
            "version": 1, "version_count": 1, "is_current": True,
        })
    generic_groups = {}
    for f in generic_files:
        generic_groups.setdefault(f.get("group_id") or f["id"], []).append(f)
    for group_id, docs in generic_groups.items():
        latest = docs[-1]
        owner_kind = latest.get("owner_kind")
        owner_id = latest.get("owner_id")
        items.append({
            "id": latest["id"], "source": "attachment", "filename": latest.get("filename") or "ficheiro",
            "file_type": _classify_filename(latest.get("filename"), latest.get("content_type")),
            "kind_label": "Anexo de fornecedor" if owner_kind == "supplier" else "Anexo de tarefa",
            "created_at": latest.get("created_at") or "",
            "note_id": "", "note_label": "",
            "supplier_id": owner_id if owner_kind == "supplier" else "",
            "supplier_label": suppliers_by_id.get(owner_id, "") if owner_kind == "supplier" else "",
            "task_id": owner_id if owner_kind == "task" else "",
            "task_label": tasks_by_id.get(owner_id, "") if owner_kind == "task" else "",
            "version": len(docs), "version_count": len(docs), "is_current": True,
        })

    if type and type != "all":
        items = [i for i in items if i["file_type"] == type]
    if scope:
        if scope.startswith("note:"):
            nid = scope.split(":", 1)[1]
            items = [i for i in items if i.get("note_id") == nid]
        elif scope.startswith("supplier:"):
            sid = scope.split(":", 1)[1]
            items = [i for i in items if i.get("supplier_id") == sid]
        elif scope == "week":
            since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            items = [i for i in items if i["created_at"] >= since]
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:limit]}


@api_router.get("/explorer/clients")
async def explorer_clients():
    """Agrupa pedidos por identidade de cliente (telefone, ou nome se não
    houver telefone) — não existe uma coleção de clientes própria; é
    calculada a partir dos pedidos existentes."""
    notes = await db.notes.find(
        {}, {"_id": 0, "id": 1, "customer_name": 1, "phone": 1, "email": 1, "created_at": 1, "updated_at": 1, "archived": 1},
    ).to_list(5000)
    groups = {}
    for n in notes:
        key = _client_key(n)
        if not key:
            continue
        g = groups.setdefault(key, {
            "key": key, "name": n.get("customer_name") or "Sem nome", "phone": n.get("phone") or "",
            "email": n.get("email") or "", "pedidos_count": 0, "active_count": 0, "last_activity": "",
        })
        g["pedidos_count"] += 1
        if not n.get("archived"):
            g["active_count"] += 1
        last = n.get("updated_at") or n.get("created_at") or ""
        if last > g["last_activity"]:
            g["last_activity"] = last
        if n.get("phone") and not g["phone"]:
            g["phone"] = n["phone"]
        if n.get("email") and not g["email"]:
            g["email"] = n["email"]
    items = sorted(groups.values(), key=lambda g: g["last_activity"], reverse=True)
    return {"items": items}


@api_router.get("/explorer/clients/{key}")
async def explorer_client_notes(key: str):
    notes = await db.notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    now = datetime.now(timezone.utc)
    matched = [enrich_note(n, now) for n in notes if _client_key(n) == key]
    if not matched:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"items": matched}


@api_router.get("/explorer/related")
async def explorer_related(kind: str, id: str):
    """Relacionados de qualquer entidade, num único sítio genérico — a
    mesma ideia do Sistema de Pilha do pedido, agora disponível para
    qualquer nó do Explorador."""
    if kind == "pedido":
        note = await db.notes.find_one({"id": id}, {"_id": 0})
        if not note:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")
        supplier = await db.suppliers.find_one({"id": note["supplier_id"]}, {"_id": 0}) if note.get("supplier_id") else None
        emails = await db.received_emails.find({"note_id": id}, {"_id": 0, "body": 0}).sort("received_at", -1).to_list(50)
        files_resp = await explorer_files(scope=f"note:{id}", limit=100)
        tasks = await db.tasks.find({"note_id": id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        key = _client_key(note)
        return {
            "cliente": {"key": key, "name": note.get("customer_name"), "phone": note.get("phone"), "email": note.get("email")} if key else None,
            "fornecedor": supplier, "emails": emails, "ficheiros": files_resp["items"], "notas": tasks,
        }
    if kind == "fornecedor":
        supplier = await db.suppliers.find_one({"id": id}, {"_id": 0})
        if not supplier:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
        notes = await db.notes.find({"supplier_id": id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        files_resp = await explorer_files(scope=f"supplier:{id}", limit=100)
        return {"pedidos": notes, "ficheiros": files_resp["items"]}
    if kind == "email":
        email = await db.received_emails.find_one({"id": id}, {"_id": 0})
        if not email:
            raise HTTPException(status_code=404, detail="Email não encontrado")
        note = await db.notes.find_one({"id": email["note_id"]}, {"_id": 0}) if email.get("note_id") else None
        return {"pedido": note}
    if kind == "tarefa":
        task = await db.tasks.find_one({"id": id}, {"_id": 0})
        if not task:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        note = await db.notes.find_one({"id": task["note_id"]}, {"_id": 0}) if task.get("note_id") else None
        files = await _list_attachments("task", id)
        return {"pedido": note, "ficheiros": files}
    raise HTTPException(status_code=400, detail="Tipo desconhecido")


class AiAskIn(BaseModel):
    question: str
    note_id: str = ""


@api_router.post("/ai/ask")
async def ai_ask(payload: AiAskIn):
    """IA contextual de acesso rápido (painel flutuante) — responde a
    perguntas livres, opcionalmente com o contexto do pedido atualmente
    em foco na Área de Trabalho."""
    if not ai_available():
        raise HTTPException(status_code=400, detail="Integração OpenAI não configurada.")
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Escreva uma pergunta.")
    ctx = ""
    if payload.note_id:
        n = await db.notes.find_one({"id": payload.note_id}, {"_id": 0})
        if n:
            en = enrich_note(dict(n))
            ctx = (
                f"Contexto atual — pedido de {n.get('customer_name') or 'cliente'}:\n"
                f"Artigo: {n.get('description') or '—'}; Medidas: {n.get('measurements') or '—'}; "
                f"Estado: {en.get('status_label')}; Próxima ação: {en.get('next_action')}\n\n"
            )
    system = ("És o assistente da loja dentro do Brico Assistente. Respondes em português de Portugal, "
              "de forma curta e direta, sem markdown. Se não souberes algo com os dados disponíveis, diz isso claramente.")
    prompt = ctx + f"Pergunta: {question}"
    try:
        answer = (await ai_complete(system, prompt, session=f"ask-{uuid.uuid4()}")).strip()
    except Exception as e:
        logger.error(f"AI ask falhou: {e}")
        raise HTTPException(status_code=502, detail="Falha na chamada à OpenAI. Verifique a chave e o saldo.")
    return {"answer": answer}


# ---------- Caixilharia à medida ----------
@api_router.get("/caixilharia/catalog")
async def caixilharia_catalog():
    technical_analysis = build_catalog_analysis(CAIXILHARIA_MODELOS)
    return {
        "supplier": CAIXILHARIA_SUPPLIER,
        "catalog_meta": CAIXILHARIA_CATALOG_META,
        "produtos": CAIXILHARIA_PRODUTOS,
        "familias": CAIXILHARIA_FAMILIAS,
        "modelos": CAIXILHARIA_MODELOS,
        "tipos_abertura": CAIXILHARIA_TIPOS_ABERTURA,
        "sentidos": CAIXILHARIA_SENTIDOS,
        "fechaduras": CAIXILHARIA_FECHADURAS,
        "muletas": CAIXILHARIA_MULETAS,
        "estores": CAIXILHARIA_ESTORES,
        "materiais": CAIXILHARIA_MATERIAIS,
        "vidros": CAIXILHARIA_VIDROS,
        "quadriculas": CAIXILHARIA_QUADRICULAS,
        "quadricula_info": CAIXILHARIA_QUADRICULA_INFO,
        "analise_tecnica": technical_analysis,
        "aviso": CAIXILHARIA_AVISO,
    }


@api_router.get("/caixilharia/catalog/analysis")
async def caixilharia_catalog_analysis():
    """Recalcula rankings/comparações a partir da evidência atual do catálogo."""
    return build_catalog_analysis(CAIXILHARIA_MODELOS)


def caixilharia_resumo(spec):
    return caixilharia_summary(spec, CAIXILHARIA_PRODUTOS, CAIXILHARIA_FAMILIAS)


@api_router.put("/notes/{note_id}/caixilharia")
async def set_caixilharia(note_id: str, payload: CaixilhariaIn):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    spec = normalize_caixilharia_spec(payload.model_dump())
    # Labels calculados no servidor: o frontend mostra o resumo sem duplicar o catálogo.
    spec["display"] = caixilharia_resumo(spec)
    await db.notes.update_one({"id": note_id}, {"$set": {"caixilharia": spec, "updated_at": now_iso()}})
    display = spec["display"]
    comparison = f" · {display['comparison_count']} comparação(ões)" if display["comparison_count"] else ""
    await log_activity(
        note_id, "updated",
        f"Caixilharia configurada: {display['produto']} · {display['total_un']} un{comparison}",
    )
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.delete("/notes/{note_id}/caixilharia")
async def clear_caixilharia(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await db.notes.update_one({"id": note_id}, {"$unset": {"caixilharia": ""}, "$set": {"updated_at": now_iso()}})
    await log_activity(note_id, "updated", "Especificação de caixilharia removida")
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


def caixilharia_email(n, spec, is_reminder=False):
    """Gera assunto+corpo do email ao fornecedor no formato da ficha oficial BandAluminios."""
    spec = normalize_caixilharia_spec(spec)
    display = caixilharia_resumo(spec)
    tipo = "Encomenda" if spec.get("tipo_pedido") == "encomenda" else "Orçamento"
    ref_artigo = (n.get("reference") or "").strip()
    hoje = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    lines = [f"{business_greeting()} Exmos. Senhores,", ""]
    if is_reminder:
        lines.append("Venho por este meio reforçar o pedido de caixilharia à medida enviado anteriormente:")
    else:
        lines.append(f"Venho por este meio solicitar um pedido de {tipo.lower()} de caixilharia à medida, "
                     "conforme a vossa ficha de pedido:")
    lines += [
        "",
        "Cliente: Bricomarché Faro",
        f"Data do pedido: {hoje}",
    ]
    if ref_artigo:
        lines.append(f"Código EAN13: {ref_artigo}")
    if (spec.get("data_entrega") or "").strip():
        try:
            entrega = datetime.strptime(spec["data_entrega"], "%Y-%m-%d").strftime("%d/%m/%Y")
        except ValueError:
            entrega = spec["data_entrega"]
        lines.append(f"Data de entrega pretendida: {entrega}")
    element_lines, display = caixilharia_email_lines(
        spec, CAIXILHARIA_PRODUTOS, CAIXILHARIA_FAMILIAS,
        materials=CAIXILHARIA_MATERIAIS, locks=CAIXILHARIA_FECHADURAS,
        handles=CAIXILHARIA_MULETAS, shutters=CAIXILHARIA_ESTORES,
        models=CAIXILHARIA_MODELOS, opening_types=CAIXILHARIA_TIPOS_ABERTURA,
        quadrilles=CAIXILHARIA_QUADRICULAS,
        warning=CAIXILHARIA_AVISO,
    )
    lines += ["", *element_lines]
    if (spec.get("observacoes") or "").strip():
        lines += ["", f"Observações: {spec['observacoes']}"]
    lines += [
        "", "Com os melhores cumprimentos,",
    ]

    prefix = "Lembrete · " if is_reminder else ""
    element_word = "elemento" if display["element_count"] == 1 else "elementos"
    subject = (f"{prefix}Pedido de {tipo.lower()} — Caixilharia à medida · "
               f"{display['element_count']} {element_word} · {display['option_count']} opção(ões)")
    return subject, "\n".join(lines)


# ---------- Quotes ----------
@api_router.get("/notes/{note_id}/quotes")
async def list_quotes(note_id: str):
    return await db.quotes.find({"note_id": note_id}, {"_id": 0}).sort("price", 1).to_list(1000)


@api_router.post("/notes/{note_id}/quotes")
async def add_quote(note_id: str, payload: QuoteIn):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "note_id": note_id, "approved": False, "created_at": now_iso()})
    await db.quotes.insert_one(dict(doc))
    await log_activity(note_id, "quote_added", f"Orçamento de {doc.get('supplier_name')}: {doc.get('price'):.2f} €",
                       {"supplier_name": doc.get("supplier_name"), "price": doc.get("price")})
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if note and note.get("status") in (FORGOTTEN_STATUSES | WAITING_SUPPLIER):
        await db.notes.update_one({"id": note_id}, {"$set": {
            "status": "orcamento_recebido", "status_updated_at": now_iso(), "updated_at": now_iso()}})
        await log_activity(note_id, "status_change", "Estado alterado para Orçamento recebido", {"to": "orcamento_recebido"})
    doc.pop("_id", None)
    return doc


# ---------- Orçamento do fornecedor (PDF) → PDF de venda ao cliente ----------
BRICO_LOGO_PATH = ROOT_DIR / "assets" / "bricomarche_faro_logo.png"
MAX_SUPPLIER_PDF_BYTES = 15 * 1024 * 1024
MAX_EMAIL_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_PHOTOS_PER_NOTE = 30


class SupplierQuoteItemIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    n: int
    description: str = ""
    qty: int = 1
    margin_pct: float = 18.0
    include: bool = True


class SupplierQuoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    items: List[SupplierQuoteItemIn] = []


def _client_pdf_filename(quote_number):
    ref = re.sub(r"[^A-Za-z0-9]+", "_", quote_number or "orcamento").strip("_")
    return f"Orcamento_{ref}_cliente.pdf"


SUPPLIER_QUOTE_HISTORY_LIMIT = 5


async def _apply_supplier_pdf(note_id, data, filename, source_label=""):
    """Analisa o PDF do fornecedor, sugere preços de venda e guarda tudo no
    pedido. Usado pelo upload manual e pela receção automática por email.
    Levanta ValueError se o PDF não for reconhecido.

    Centro de Validação Automática: antes de guardar, confere a qualidade da
    leitura (imagens, preços, descrições, totais — ver quote_validation),
    deteta se o mesmo ficheiro já tinha sido importado (evita duplicados) e,
    se já havia uma versão anterior do orçamento para este pedido, compara
    artigo a artigo (adicionados, removidos, alterados), conta a revisão e
    guarda a versão anterior no histórico. Nada disto bloqueia a importação
    nem muda a prioridade sozinho — só fica registado/etiquetado para a
    pessoa decidir com informação completa."""
    content_hash = hashlib.sha256(data).hexdigest()
    dup = await db.note_files.find_one(
        {"note_id": note_id, "kind": "supplier_pdf", "content_hash": content_hash}, {"_id": 0, "id": 1})
    if dup:
        await log_activity(note_id, "updated",
                           f"PDF do fornecedor recebido, mas é idêntico a um já importado — não "
                           f"reprocessado{source_label}.", {"file_id": dup["id"]})
        current = await db.notes.find_one({"id": note_id}, {"_id": 0, "supplier_quote": 1})
        return (current or {}).get("supplier_quote")

    parsed = parse_supplier_pdf(data)
    quality_report = build_quality_report(parsed)
    confidence = confidence_score(quality_report)
    dup_medidas = duplicate_medidas(parsed["items"])

    file_id = str(uuid.uuid4())
    await db.note_files.insert_one({
        "id": file_id, "note_id": note_id, "kind": "supplier_pdf",
        "filename": filename or "orcamento_fornecedor.pdf", "content_hash": content_hash,
        "content_b64": base64.b64encode(data).decode(), "created_at": now_iso()})
    for item in parsed["items"]:
        material = detect_material(item.get("description"))
        item["material"] = material
        item["material_label"] = material_label(material)
        item["margin_pct"] = margin_for_material(material)
        item["client_price"] = suggest_client_price(item.get("supplier_unit_price"), item["margin_pct"])
        item["coefficient"] = coefficient_for_margin(item["margin_pct"])
        item["include"] = True

    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    prev_quote = (n or {}).get("supplier_quote")
    quote_diff = None
    extra_set = {}
    if prev_quote:
        quote_diff = diff_quote_versions(prev_quote.get("items"), parsed["items"])
        history = list((n or {}).get("supplier_quote_history") or [])
        history.append({k: prev_quote.get(k) for k in (
            "quote_number", "date", "obra", "total", "source_file_id", "imported_at")})
        extra_set["supplier_quote_history"] = history[-SUPPLIER_QUOTE_HISTORY_LIMIT:]
    # Contagem de revisões: campo próprio, nunca aparado (ao contrário do
    # array de histórico acima, que só guarda as últimas
    # SUPPLIER_QUOTE_HISTORY_LIMIT versões em detalhe) — para continuar
    # correta depois da 6ª importação do mesmo orçamento.
    revision_number = ((n or {}).get("supplier_quote_revision_count") or 0) + 1
    extra_set["supplier_quote_revision_count"] = revision_number

    urgency_hits = detect_urgency_signals(
        (n or {}).get("description"), (n or {}).get("details"),
        *[i.get("description") for i in parsed["items"]])

    supplier_quote = {**parsed,
                      "margin_rules": {"pvc": margin_for_material("pvc"),
                                       "aluminio": margin_for_material("aluminio")},
                      "source_file_id": file_id, "imported_at": now_iso(),
                      "quality_report": quality_report, "diff_since_previous": quote_diff,
                      "confidence_score": confidence, "revision_number": revision_number,
                      "duplicate_medidas": dup_medidas}

    # Etiquetas automáticas — só acrescenta (nunca remove uma etiqueta posta
    # à mão) e nunca mexe em note.priority sozinho, mesmo quando deteta
    # sinais de urgência: fica assinalado para uma pessoa decidir.
    auto_labels = sorted({i.get("material_label") for i in parsed["items"] if i.get("material_label")})
    if quality_report["status"] != "ok":
        auto_labels.append("revisão necessária")
    if urgency_hits:
        auto_labels.append("possível urgência")

    update_ops = {"$set": {"supplier_quote": supplier_quote, "updated_at": now_iso(), **extra_set}}
    if auto_labels:
        update_ops["$addToSet"] = {"labels": {"$each": auto_labels}}
    await db.notes.update_one({"id": note_id}, update_ops)

    quality_note = ""
    if quality_report["status"] != "ok":
        problems = [c["label"] for c in quality_report["checks"] if c["status"] != "ok"]
        quality_note = f" — ⚠ verificar: {'; '.join(problems)}"
    await log_activity(note_id, "updated",
                       f"Orçamento do fornecedor importado ({supplier_quote['quote_number']}, "
                       f"{len(parsed['items'])} linha(s), revisão {revision_number}, confiança "
                       f"{confidence}%){source_label}{quality_note}", {"file_id": file_id})
    if quote_diff and quote_diff["has_changes"]:
        await log_activity(note_id, "updated", diff_summary_text(quote_diff), {"diff": quote_diff})
    if urgency_hits:
        await log_activity(note_id, "updated",
                           f"Possível urgência detetada no texto do orçamento (\"{urgency_hits[0]}\") "
                           f"— confirme a prioridade.", {"urgency_hits": urgency_hits})

    # O total do fornecedor entra no fluxo normal de orçamentos recebidos
    # (muda o estado e alimenta as estatísticas de resposta).
    if parsed.get("total"):
        await add_quote(note_id, QuoteIn(
            supplier_name="BandAluminios",
            product=(parsed["items"][0].get("description") or "").split("\n")[0],
            price=parsed["total"],
            notes=f"Importado do PDF {supplier_quote['quote_number']} (total c/ IVA)"))
    return supplier_quote


async def _generate_client_pdf_file(note_id, supplier_quote, source_label=""):
    """Gera o PDF de venda ao cliente e guarda-o no pedido. Não envia nada.
    Levanta ValueError se não houver linhas incluídas/válidas."""
    pdf_bytes = build_client_pdf(supplier_quote, BRICO_LOGO_PATH.read_bytes())
    filename = _client_pdf_filename(supplier_quote.get("quote_number"))
    file_id = str(uuid.uuid4())
    await db.note_files.insert_one({
        "id": file_id, "note_id": note_id, "kind": "client_pdf", "filename": filename,
        "content_b64": base64.b64encode(pdf_bytes).decode(), "created_at": now_iso()})
    included = [i for i in supplier_quote.get("items", []) if i.get("include", True)]
    total = sum(float(i.get("client_price") or 0) * int(i.get("qty") or 1) for i in included)
    # Margem final efetiva — mesma definição da loja (margem sobre o preço
    # de venda com IVA, não sobre o custo): margem = 1/(1+IVA) - custo/PV.
    # Fica na cronologia para ser fácil reportar a que margem o orçamento
    # foi enviado ao cliente.
    cost_total = sum((i.get("supplier_unit_price") or 0) * int(i.get("qty") or 1) for i in included)
    eff_margin = round((1 / (1 + IVA_RATE) - cost_total / total) * 100, 1) if total > 0 else None
    margin_txt = f" · margem final {eff_margin:.1f}%" if eff_margin is not None else ""
    await db.notes.update_one({"id": note_id}, {"$set": {
        "supplier_quote.client_pdf_file_id": file_id,
        "supplier_quote.client_pdf_generated_at": now_iso(),
        "supplier_quote.client_pdf_margin_pct": eff_margin, "updated_at": now_iso()}})
    await log_activity(note_id, "updated",
                       f"PDF de orçamento para o cliente gerado ({total:.2f} € c/ IVA{margin_txt}){source_label}",
                       {"file_id": file_id, "eff_margin_pct": eff_margin})
    # Prepara logo o email para o cliente com o PDF anexado. Fica PENDENTE de
    # confirmação no ecrã de revisão — nada é enviado automaticamente.
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    template = client_quote_template(n)
    # Assunto automático: «Orçamento Cliente <nº da obra>», com o identificador
    # lido do PDF do fornecedor tal e qual aparece no documento. Só é usado
    # quando há exatamente UM identificador — caso contrário o assunto fica
    # marcado para revisão e mantém-se o modelo habitual.
    obra = (supplier_quote.get("obra") or "").strip()
    candidates = supplier_quote.get("obra_candidates")
    if candidates is None:
        candidates = [obra] if obra else []
    if obra and len(candidates) == 1:
        subject = f"Orçamento Cliente {obra}"
        subject_needs_review = False
    else:
        subject = template.get("subject", "")
        subject_needs_review = True
    await db.notes.update_one({"id": note_id}, {"$set": {
        "pending_client_send": {
            "subject": subject, "body": template.get("body", ""),
            "subject_needs_review": subject_needs_review,
            "obra": obra, "obra_candidates": candidates,
            "to": (n.get("email") or "").strip(), "pdf_file_id": file_id,
            "pdf_filename": filename, "total": round(total, 2),
            "eff_margin_pct": eff_margin, "created_at": now_iso(),
            # Levados para o ecrã de aprovação: a pessoa vê exatamente o que
            # o Centro de Validação encontrou (e o que mudou desde a última
            # importação) antes de confirmar o envio — ver ConfirmSendDialog.
            "source_file_id": supplier_quote.get("source_file_id") or "",
            "quality_report": supplier_quote.get("quality_report"),
            "diff_since_previous": supplier_quote.get("diff_since_previous"),
            "confidence_score": supplier_quote.get("confidence_score"),
            "revision_number": supplier_quote.get("revision_number"),
            "duplicate_medidas": supplier_quote.get("duplicate_medidas")},
        "updated_at": now_iso()}})
    return pdf_bytes, filename, file_id


@api_router.post("/notes/{note_id}/supplier-pdf")
async def import_supplier_pdf(note_id: str, file: UploadFile = File(...)):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    data = await file.read()
    if len(data) > MAX_SUPPLIER_PDF_BYTES:
        raise HTTPException(status_code=400, detail="O PDF é demasiado grande (máx. 15 MB).")
    try:
        supplier_quote = await _apply_supplier_pdf(note_id, data, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Igual ao fluxo automático por email: gera já o PDF de venda e prepara o
    # email ao cliente com o anexo — pronto a rever/enviar sem mais cliques.
    # (Se o utilizador ajustar preços e regenerar, o rascunho é substituído.)
    try:
        await _generate_client_pdf_file(note_id, supplier_quote, " — automático após importação")
    except ValueError as e:
        await log_activity(note_id, "updated",
                           f"PDF importado, mas o PDF de cliente não foi gerado: {e}")
    return enrich_note(await db.notes.find_one({"id": note_id}, {"_id": 0}))


@api_router.put("/notes/{note_id}/supplier-quote")
async def update_supplier_quote(note_id: str, payload: SupplierQuoteIn):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    supplier_quote = note.get("supplier_quote")
    if not supplier_quote:
        raise HTTPException(status_code=400, detail="Importe primeiro o PDF do fornecedor.")
    edits = {item.n: item for item in payload.items}
    for item in supplier_quote.get("items", []):
        edit = edits.get(item.get("n"))
        if not edit:
            continue
        item["description"] = edit.description.strip() or item["description"]
        item["qty"] = max(1, edit.qty)
        # O utilizador só altera a margem — coeficiente e preço final são
        # sempre recalculados pelo sistema com a fórmula exata da loja,
        # nunca introduzidos ou corrigidos manualmente.
        item["margin_pct"] = min(max(edit.margin_pct, 0.0), MAX_MARGIN_PCT)
        item["coefficient"] = coefficient_for_margin(item["margin_pct"])
        item["client_price"] = suggest_client_price(item.get("supplier_unit_price"), item["margin_pct"])
        item["include"] = edit.include
    await db.notes.update_one({"id": note_id}, {"$set": {
        "supplier_quote": supplier_quote, "updated_at": now_iso()}})
    return {"ok": True, "supplier_quote": supplier_quote}


@api_router.post("/notes/{note_id}/client-pdf")
async def generate_client_pdf(note_id: str):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    supplier_quote = note.get("supplier_quote")
    if not supplier_quote:
        raise HTTPException(status_code=400, detail="Importe primeiro o PDF do fornecedor.")
    try:
        pdf_bytes, filename, _ = await _generate_client_pdf_file(note_id, supplier_quote)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api_router.get("/notes/{note_id}/files/{file_id}")
async def download_note_file(note_id: str, file_id: str):
    f = await db.note_files.find_one({"id": file_id, "note_id": note_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    content_type = f.get("content_type") or "application/pdf"
    # Fotos abrem embutidas (galeria, pré-visualização); PDFs mantêm o
    # comportamento antigo de download direto.
    disposition = "inline" if f.get("kind") == "photo" else "attachment"
    return Response(content=base64.b64decode(f["content_b64"]), media_type=content_type,
                    headers={"Content-Disposition": f'{disposition}; filename="{f.get("filename", "documento")}"'})


# ---------- Fotos do pedido (Pedidos Gerais e Banda Alumínios) ----------
def _note_photo_meta(f):
    return {
        "id": f["id"], "filename": f.get("filename") or "foto.jpg",
        "content_type": f.get("content_type") or "image/jpeg",
        "size": f.get("size") or 0, "created_at": f.get("created_at"),
    }


@api_router.get("/notes/{note_id}/photos")
async def list_note_photos(note_id: str):
    docs = await db.note_files.find(
        {"note_id": note_id, "kind": "photo"},
        {"_id": 0, "content_b64": 0},
    ).sort("created_at", 1).to_list(MAX_PHOTOS_PER_NOTE)
    return [_note_photo_meta(f) for f in docs]


@api_router.post("/notes/{note_id}/photos")
async def upload_note_photos(note_id: str, files: List[UploadFile] = File(...)):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    existing = await db.note_files.count_documents({"note_id": note_id, "kind": "photo"})
    if existing + len(files) > MAX_PHOTOS_PER_NOTE:
        raise HTTPException(status_code=400, detail=f"Máximo de {MAX_PHOTOS_PER_NOTE} fotos por pedido.")
    saved = []
    for file in files:
        if not (file.content_type or "").startswith("image/"):
            raise HTTPException(status_code=400, detail=f'"{file.filename}" não é uma imagem.')
        data = await file.read()
        if not data:
            continue
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=400, detail=f'"{file.filename}" é demasiado grande (máx. 10 MB).')
        doc = {
            "id": str(uuid.uuid4()), "note_id": note_id, "kind": "photo",
            "filename": file.filename or "foto.jpg", "content_type": file.content_type,
            "size": len(data), "content_b64": base64.b64encode(data).decode(),
            "created_at": now_iso(),
        }
        await db.note_files.insert_one(doc)
        saved.append(_note_photo_meta(doc))
    if saved:
        await log_activity(note_id, "photo_added",
                           f"{len(saved)} foto{'s' if len(saved) != 1 else ''} adicionada{'s' if len(saved) != 1 else ''}")
        await db.notes.update_one({"id": note_id}, {"$set": {"updated_at": now_iso()}})
    return saved


@api_router.delete("/notes/{note_id}/photos/{photo_id}")
async def delete_note_photo(note_id: str, photo_id: str):
    f = await db.note_files.find_one({"id": photo_id, "note_id": note_id, "kind": "photo"}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    await db.note_files.delete_one({"id": photo_id, "note_id": note_id})
    await log_activity(note_id, "photo_removed", f'Foto removida ({f.get("filename", "foto")})')
    return {"ok": True}


@api_router.post("/notes/{note_id}/quotes/{quote_id}/approve")
async def approve_quote(note_id: str, quote_id: str):
    quote = await db.quotes.find_one({"id": quote_id, "note_id": note_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    await db.quotes.update_many({"note_id": note_id}, {"$set": {"approved": False}})
    await db.quotes.update_one({"id": quote_id}, {"$set": {"approved": True}})
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "aprovado", "status_updated_at": now_iso(), "updated_at": now_iso(), "approved_quote_id": quote_id}})
    await log_activity(note_id, "quote_approved", f"Orçamento aprovado: {quote.get('supplier_name')} ({quote.get('price'):.2f} €)")
    return {"ok": True}


@api_router.delete("/notes/{note_id}/quotes/{quote_id}")
async def delete_quote(note_id: str, quote_id: str):
    q = await db.quotes.find_one({"id": quote_id, "note_id": note_id}, {"_id": 0})
    await db.quotes.delete_one({"id": quote_id, "note_id": note_id})
    if q:
        await log_activity(note_id, "quote_removed", f"Orçamento removido: {q.get('supplier_name')}")
    return {"ok": True}


# ---------- Gmail ----------
def client_config():
    return {"web": {"client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token"}}


async def get_gmail_creds():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    token = await db.gmail_tokens.find_one({"account": "store"}, {"_id": 0})
    if not token:
        return None
    creds = Credentials(token=token.get("access_token"), refresh_token=token.get("refresh_token"),
                        token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
                        client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET, scopes=SCOPES)
    expires = parse_dt(token.get("expires_at"))
    if (expires is None or datetime.now(timezone.utc) >= (expires - timedelta(seconds=60))) and token.get("refresh_token"):
        try:
            creds.refresh(GoogleRequest())
            await db.gmail_tokens.update_one({"account": "store"}, {"$set": {
                "access_token": creds.token,
                "expires_at": creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None}})
        except Exception as e:
            logger.error(f"Erro a renovar token Gmail: {e}")
            return None
    return creds


@api_router.get("/gmail/status")
async def gmail_status():
    if SMTP_CONFIGURED:
        return {"configured": True, "connected": True, "email": GMAIL_SMTP_USER, "method": "smtp"}
    token = await db.gmail_tokens.find_one({"account": "store"}, {"_id": 0})
    return {"configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET), "connected": bool(token),
            "email": token.get("email") if token else None, "method": "oauth"}


@api_router.get("/gmail/test")
async def gmail_smtp_test():
    """Valida as credenciais SMTP autenticando no Gmail — NÃO envia nenhum email."""
    if not SMTP_CONFIGURED:
        raise HTTPException(status_code=400, detail="SMTP não configurado: defina GMAIL_SMTP_USER e "
                                                    "GMAIL_SMTP_APP_PASSWORD no .env.production e reinicie o backend.")

    def _check_login():
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
            smtp.login(GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD)

    try:
        await asyncio.to_thread(_check_login)
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=502, detail="O Gmail recusou o login: confirme o email e a "
                                                    "palavra-passe de aplicação (e que a verificação em 2 passos está ativa).")
    except Exception as e:
        logger.error(f"Teste SMTP falhou: {e}")
        raise HTTPException(status_code=502, detail=f"Não foi possível ligar a smtp.gmail.com: {e}")
    return {"ok": True, "email": GMAIL_SMTP_USER,
            "message": "Login SMTP válido — nenhum email foi enviado."}


@api_router.get("/gmail/connect")
async def gmail_connect():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Credenciais Google não configuradas no servidor.")
    flow = Flow.from_client_config(client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
    url, state = flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
    stale_cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    await db.oauth_states.delete_many({"created_at": {"$lt": stale_cutoff}})
    await db.oauth_states.insert_one({"state": state, "created_at": now_iso()})
    return RedirectResponse(url)


@api_router.get("/oauth/gmail/callback")
async def gmail_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    frontend = PUBLIC_BASE_URL or ""
    if error or not code or not state:
        return RedirectResponse(f"{frontend}/?gmail=error")
    st = await db.oauth_states.find_one({"state": state})
    if not st:
        return RedirectResponse(f"{frontend}/?gmail=error")
    await db.oauth_states.delete_one({"state": state})
    created = parse_dt(st.get("created_at"))
    if not created or (datetime.now(timezone.utc) - created) > timedelta(minutes=15):
        return RedirectResponse(f"{frontend}/?gmail=error")
    try:
        flow = Flow.from_client_config(client_config(), scopes=SCOPES, redirect_uri=REDIRECT_URI)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            flow.fetch_token(code=code)
        creds = flow.credentials
        email = None
        try:
            email = build("oauth2", "v2", credentials=creds).userinfo().get().execute().get("email")
        except Exception:
            pass
        await db.gmail_tokens.update_one({"account": "store"}, {"$set": {
            "account": "store", "access_token": creds.token, "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "expires_at": creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None,
            "email": email, "updated_at": now_iso()}}, upsert=True)
        return RedirectResponse(f"{frontend}/?gmail=connected")
    except Exception as e:
        logger.error(f"Erro no callback Gmail: {e}")
        return RedirectResponse(f"{frontend}/?gmail=error")


@api_router.post("/gmail/disconnect")
async def gmail_disconnect():
    await db.gmail_tokens.delete_many({"account": "store"})
    return {"ok": True}


# Assinatura de email (imagem embutida no corpo, visível sem abrir anexos).
SIGNATURE_PATH = ROOT_DIR / "assets" / "assinatura_email.png"
_signature_cache = {"loaded": False, "data": None}


def _signature_bytes():
    if not _signature_cache["loaded"]:
        _signature_cache["loaded"] = True
        try:
            _signature_cache["data"] = SIGNATURE_PATH.read_bytes()
        except OSError:
            _signature_cache["data"] = None
    return _signature_cache["data"]


def _build_email_body(body, attachments=None):
    """Corpo do email com a assinatura embutida no fim (HTML + imagem inline
    via cid, com fallback em texto simples) e PDFs anexados quando existem."""
    signature = _signature_bytes()
    if signature:
        related = MIMEMultipart("related")
        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(body))
        # width=420 num asset de 840px: tamanho confortável em qualquer
        # cliente de email, nítido em ecrãs retina, nunca maior que o ecrã.
        html = (
            '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
            'color:#111111;white-space:pre-wrap;">' + html_escape(body) + "</div>"
            '<br/><img src="cid:assinatura" width="420" '
            'style="max-width:100%;height:auto;border:0;display:block;" '
            'alt="Bricomarché Faro"/>'
        )
        alternative.attach(MIMEText(html, "html"))
        related.attach(alternative)
        image = MIMEImage(signature, _subtype="png")
        image.add_header("Content-ID", "<assinatura>")
        image.add_header("Content-Disposition", "inline", filename="assinatura.png")
        related.attach(image)
        core = related
    else:
        core = MIMEText(body)
    if not attachments:
        return core
    message = MIMEMultipart("mixed")
    message.attach(core)
    for att in attachments:
        filename = att.get("filename") or "documento"
        ctype, _ = mimetypes.guess_type(filename)
        maintype, subtype = ctype.split("/", 1) if ctype else ("application", "octet-stream")
        part = MIMEBase(maintype, subtype)
        part.set_payload(att["data"])
        email_encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        message.attach(part)
    return message


def _smtp_send(to_email, subject, body, attachments=None, message_id=None):
    message = _build_email_body(body, attachments)
    message["From"] = GMAIL_SMTP_USER
    message["To"] = to_email
    message["Subject"] = subject
    if message_id:
        message["Message-ID"] = message_id
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD)
        smtp.sendmail(GMAIL_SMTP_USER, [to_email], message.as_string())


async def _log_sent_email(to_email, subject, body, attachments, note_id, kind, to_label, pdf_file_id,
                          message_id="", source="site"):
    """Ponto único de registo de envios — cobre fornecedores, clientes e
    qualquer envio futuro, para a secção "Emails" mostrar tudo o que saiu,
    mesmo sem pedido associado. message_id identifica o email de forma única
    (mesmo Message-ID que vai no cabeçalho enviado) para a sincronização da
    pasta "Enviados" do Gmail não duplicar o que a própria app já enviou."""
    await db.sent_emails.insert_one({
        "id": str(uuid.uuid4()), "to": to_email, "to_label": to_label or "",
        "subject": subject, "body": body, "note_id": note_id or "", "kind": kind,
        "pdf_file_id": pdf_file_id or "",
        "attachments": [{"filename": a.get("filename")} for a in (attachments or [])],
        "message_id": message_id or "", "source": source, "sent_at": now_iso()})


async def _send_email(to_email, subject, body, attachments=None, note_id=None, kind="other", to_label="", pdf_file_id=""):
    if not to_email:
        raise HTTPException(status_code=400, detail="O destinatário não tem email definido.")
    msgid = make_msgid(domain="gmail.com")
    if SMTP_CONFIGURED:
        try:
            await asyncio.to_thread(_smtp_send, to_email, subject, body, attachments, msgid)
            await _log_sent_email(to_email, subject, body, attachments, note_id, kind, to_label, pdf_file_id, msgid)
            return
        except smtplib.SMTPAuthenticationError:
            raise HTTPException(status_code=502, detail="O Gmail recusou a palavra-passe de aplicação (SMTP). "
                                                        "Confirme GMAIL_SMTP_USER e GMAIL_SMTP_APP_PASSWORD no servidor.")
        except Exception as e:
            logger.error(f"Erro ao enviar email por SMTP: {e}")
            raise HTTPException(status_code=502, detail="Falha ao enviar o email por SMTP.")
    creds = await get_gmail_creds()
    if not creds:
        raise HTTPException(status_code=400, detail="Gmail não está ligado. Ligue a sua conta Gmail para enviar emails automaticamente.")
    try:
        service = build("gmail", "v1", credentials=creds)
        message = _build_email_body(body, attachments)
        message["to"] = to_email
        message["subject"] = subject
        message["message-id"] = msgid
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        await _log_sent_email(to_email, subject, body, attachments, note_id, kind, to_label, pdf_file_id, msgid)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao enviar email: {e}")
        raise HTTPException(status_code=502, detail="Falha ao enviar o email pelo Gmail.")


# ---------- Receção de respostas dos fornecedores (IMAP, só leitura) ----------
# Nada aqui envia, apaga ou marca emails: a caixa é aberta em modo readonly e
# as mensagens são lidas com BODY.PEEK, por isso continuam "não lidas" no Gmail.

def _decode_mime_header(value):
    parts = decode_header(value or "")
    out = []
    for text, charset in parts:
        out.append(text.decode(charset or "utf-8", errors="replace") if isinstance(text, bytes) else text)
    return "".join(out).strip()



# Alguns clientes de email (Outlook em particular) geram a alternativa em
# texto simples a partir do HTML sem limpar as referências às imagens
# embutidas nem os "smart tags" de telefone — sobra lixo como
# "[cid:image001.gif@...]" e "<tel:219+265+110>" (por vezes com aspas
# angulares "‹›" em vez de "<>", em citações aninhadas) à vista do utilizador.
_CID_ARTIFACT_RE = re.compile(r"\[?cid:[^\]\s]+\]?", re.IGNORECASE)
_TEL_ARTIFACT_RE = re.compile(r"[<‹]\s*(?:tel:)?[+\d][\d+\-\s]{5,}\s*[>›]", re.IGNORECASE)
_STYLE_SCRIPT_RE = re.compile(r"<(style|script)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_BLOCK_BREAK_RE = re.compile(r"<(br|/p|/div|/tr|/table|/h[1-6]|/li)\b[^>]*>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_BLANK_LINES_RE = re.compile(r"[ \t]+\n")
_MULTI_BLANK_RE = re.compile(r"\n{3,}")


def _clean_email_artifacts(text):
    if not text:
        return text
    text = _CID_ARTIFACT_RE.sub("", text)
    text = _TEL_ARTIFACT_RE.sub("", text)
    text = _MULTI_BLANK_RE.sub("\n\n", text)
    return text.strip()


def _html_to_text(html_body):
    """Conversão de HTML para texto simples, boa o suficiente para o corpo de
    um email: remove <style>/<script> por inteiro, transforma quebras de
    bloco em novas linhas, descodifica entidades (&nbsp;, &amp;, ...) e tira
    o resto das tags — em vez de trocar cada tag por um espaço, que juntava
    tudo numa parede de texto ilegível."""
    text = _STYLE_SCRIPT_RE.sub("", html_body)
    text = _BLOCK_BREAK_RE.sub("\n", text)
    text = _TAG_RE.sub("", text)
    text = html_unescape(text)
    text = _CID_ARTIFACT_RE.sub("", text)
    lines = [_BLANK_LINES_RE.sub("\n", line).strip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = _MULTI_BLANK_RE.sub("\n\n", text)
    return text.strip()


def _email_text_body(msg):
    if msg.is_multipart():
        plain, html_body = None, None
        for part in msg.walk():
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition:
                continue
            ctype = part.get_content_type()
            if ctype == "text/plain" and plain is None:
                payload = part.get_payload(decode=True)
                if payload is not None:
                    plain = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
            elif ctype == "text/html" and html_body is None:
                payload = part.get_payload(decode=True)
                if payload is not None:
                    html_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        # A alternativa em texto simples só é usada se estiver limpa — quando
        # tem marcadores MIME por rebocar (cid:/tel:), o HTML dá um resultado
        # mais legível.
        has_artifacts = plain and (_CID_ARTIFACT_RE.search(plain) or _TEL_ARTIFACT_RE.search(plain))
        if plain and not has_artifacts:
            return _clean_email_artifacts(plain)
        if html_body:
            return _html_to_text(html_body)
        if plain:
            return _clean_email_artifacts(plain)
        return ""
    payload = msg.get_payload(decode=True)
    if payload is None:
        return str(msg.get_payload() or "")
    text = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
    if msg.get_content_type() == "text/html":
        return _html_to_text(text)
    return _clean_email_artifacts(text)


# Corpo formatado para apresentação: preferimos sempre a versão HTML do email
# quando existe (negrito, listas, parágrafos, ligações), reduzida a um
# conjunto seguro de tags via nh3 — nunca se renderiza HTML de terceiros sem
# passar por aqui. Sem HTML (só texto simples), reconstrói-se o mínimo de
# formatação a partir de convenções comuns (linhas em branco = parágrafo,
# *palavra* = negrito, URLs clicáveis).
_EMAIL_HTML_TAGS = {
    "p", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li",
    "a", "blockquote", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "table", "tbody", "thead", "tr", "td", "th",
}
_EMAIL_HTML_ATTRS = {"a": {"href"}}
_URL_RE = re.compile(r"(https?://[^\s<]+)")
_BOLD_MARK_RE = re.compile(r"\*([^\n*]{1,200}?)\*")


def _sanitize_email_html(html_body):
    if not html_body:
        return ""
    cleaned = nh3.clean(
        html_body, tags=_EMAIL_HTML_TAGS, attributes=_EMAIL_HTML_ATTRS,
        url_schemes={"http", "https", "mailto", "tel"}, link_rel="noopener noreferrer nofollow")
    cleaned = _CID_ARTIFACT_RE.sub("", cleaned)
    cleaned = _TEL_ARTIFACT_RE.sub("", cleaned)
    return cleaned.strip()


def _plain_to_safe_html(text):
    if not text:
        return ""
    escaped = html_escape(text)
    escaped = _BOLD_MARK_RE.sub(r"<strong>\1</strong>", escaped)
    escaped = _URL_RE.sub(r'<a href="\1">\1</a>', escaped)
    paragraphs = [p.replace("\n", "<br>") for p in escaped.split("\n\n")]
    return "".join(f"<p>{p}</p>" for p in paragraphs if p.strip())


def _email_body_html(msg, plain_fallback):
    if msg.is_multipart():
        html_body = None
        for part in msg.walk():
            disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in disposition:
                continue
            if part.get_content_type() == "text/html" and html_body is None:
                payload = part.get_payload(decode=True)
                if payload is not None:
                    html_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        if html_body:
            return _sanitize_email_html(html_body)
        return _plain_to_safe_html(plain_fallback)
    if msg.get_content_type() == "text/html":
        payload = msg.get_payload(decode=True)
        if payload is not None:
            return _sanitize_email_html(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))
    return _plain_to_safe_html(plain_fallback)


def _email_pdf_attachments(msg):
    """Extrai anexos PDF (máx. 5, até MAX_SUPPLIER_PDF_BYTES cada)."""
    out = []
    for part in msg.walk():
        filename = _decode_mime_header(part.get_filename() or "")
        if part.get_content_type() != "application/pdf" and not filename.lower().endswith(".pdf"):
            continue
        payload = part.get_payload(decode=True)
        if payload and len(payload) <= MAX_SUPPLIER_PDF_BYTES:
            out.append({"filename": filename or "documento.pdf", "data": payload})
        if len(out) >= 5:
            break
    return out


# ---------- Resumo automático do "Correio Semanal" (Mosqueteiros) ----------
# Boletim interno semanal, sempre em PDF, sempre do mesmo remetente — mas o
# conteúdo (secções, datas-limite, MEAs, promoções) muda todas as semanas,
# por isso o resumo tem de reler o PDF de cada semana, nunca assumir nada
# do anterior. O resumo em si (build_digest) é extração determinística —
# sem IA, sem chamadas de rede — ver correio_semanal.py.
CORREIO_SEMANAL_SENDER = "pdv11880@mousquetaires.com"
# O boletim chama-se a si próprio "Correio Semanal" (é assim que o PDF e os
# seus anexos se chamam), mas quem o reencaminha por email nem sempre usa
# essas palavras no assunto — ex.: "FW: Correio da Semana Edição nº655
# (Semana 29)". Por isso aceita as duas formas ("semanal" ou "da semana") e
# verifica tanto o assunto como os nomes dos anexos, para não depender de
# quem reencaminha escrever sempre da mesma forma.
_CORREIO_SEMANAL_RE = re.compile(r"correio[\s_-]*(semanal|da[\s_-]*semana)", re.IGNORECASE)


def _looks_like_correio_semanal(from_email, subject, attachment_filenames=None):
    if (from_email or "").strip().lower() != CORREIO_SEMANAL_SENDER:
        return False
    if _CORREIO_SEMANAL_RE.search(_strip_accents(subject or "")):
        return True
    return any(_CORREIO_SEMANAL_RE.search(_strip_accents(name or "")) for name in (attachment_filenames or []))


async def _summarize_correio_semanal(subject, pdf_bytes_list):
    """Resumo exaustivo do Correio Semanal — extração determinística
    (build_digest), corre em thread por ser só CPU (um PDF de 60+ páginas
    demora o suficiente para não bloquear o event loop)."""
    try:
        return await asyncio.to_thread(correio_semanal.build_digest, pdf_bytes_list, subject)
    except Exception as e:
        logger.error(f"Resumo do Correio Semanal falhou: {e}")
        return ""


async def _process_correio_semanal(subject, pdf_bytes_list, email_id):
    """Complementa o resumo em HTML com dados estruturados: guarda um
    "digest" desta edição, compara com a edição anterior (se houver) e
    sugere tarefas a partir das secções com "A Encomendar"/"A Fazer"
    marcado, ou um rascunho de email quando a secção pede uma resposta de
    adesão/não adesão. Nunca cria uma tarefa já confirmada nem envia
    nada sozinho — fica marcada como sugestão (suggested=True) até
    alguém aceitar, mesmo padrão de aprovação usado no resto da app."""
    try:
        structured = await asyncio.to_thread(correio_semanal.extract_structured, pdf_bytes_list, subject)
    except Exception as e:
        logger.error(f"Extração estruturada do Correio Semanal falhou: {e}")
        return None
    if not structured or not structured.get("csn_number"):
        return None

    prev_list = await db.correio_semanal_digests.find(
        {"csn_number": {"$ne": structured["csn_number"]}}, {"_id": 0},
    ).sort("created_at", -1).to_list(1)
    prev = (prev_list[0]["structured"] if prev_list else None)
    diff = correio_semanal.diff_digest_versions(prev, structured) if prev else None

    await db.correio_semanal_digests.insert_one({
        "id": str(uuid.uuid4()), "email_id": email_id, "csn_number": structured["csn_number"],
        "week_label": structured.get("week_label"), "issue_date": structured.get("issue_date"),
        "structured": structured, "diff_since_previous": diff, "created_at": now_iso()})

    created = 0
    base_task = {"category": "construcao", "done": False, "priority": "media", "due_date": "",
                 "repeat": "none", "subtasks": [], "labels": ["correio-semanal"], "note_id": "", "group_id": ""}
    for section in structured["sections"]:
        for action in section.get("checked_actions") or []:
            exists = await db.tasks.find_one({"suggested": True, "csn_number": structured["csn_number"],
                                               "source_page": section["page"], "kind": "task", "action": action})
            if exists:
                continue
            await db.tasks.insert_one({
                **base_task, "id": str(uuid.uuid4()),
                "title": f"[Correio Semanal {structured['csn_number']}] {action}: {section['title']}",
                "created_at": now_iso(), "suggested": True, "source": "correio_semanal",
                "csn_number": structured["csn_number"], "source_page": section["page"],
                "kind": "task", "action": action})
            created += 1
        if section.get("requires_adhesion_email") and section.get("adhesion_emails"):
            exists = await db.tasks.find_one({"suggested": True, "csn_number": structured["csn_number"],
                                               "source_page": section["page"], "kind": "email_draft"})
            if exists:
                continue
            to = ",".join(section["adhesion_emails"])
            mailto = f"mailto:{to}?subject={urllib.parse.quote(section['title'])}"
            await db.tasks.insert_one({
                **base_task, "id": str(uuid.uuid4()),
                "title": f"[Correio Semanal {structured['csn_number']}] Responder por email: {section['title']}",
                "created_at": now_iso(), "suggested": True, "source": "correio_semanal",
                "csn_number": structured["csn_number"], "source_page": section["page"],
                "kind": "email_draft", "mailto": mailto, "recipients": section["adhesion_emails"]})
            created += 1

    return {"digest": structured, "diff": diff, "suggested_tasks_created": created}


def _imap_fetch_since(last_uid):
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
    try:
        box.login(GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD)
        box.select("INBOX", readonly=True)
        if last_uid:
            _, data = box.uid("search", None, f"UID {last_uid + 1}:*")
        else:
            since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%d-%b-%Y")
            _, data = box.uid("search", None, f"SINCE {since}")
        uids = sorted(int(u) for u in (data[0].split() if data and data[0] else []))
        uids = [u for u in uids if u > (last_uid or 0)][-50:]
        messages = []
        for uid in uids:
            _, msg_data = box.uid("fetch", str(uid), "(BODY.PEEK[])")
            raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
            if not raw:
                continue
            msg = email_lib.message_from_bytes(raw)
            display_name, addr = parseaddr(_decode_mime_header(msg.get("From") or ""))
            body = _email_text_body(msg)[:20000].strip()
            messages.append({
                "uid": uid,
                "from_email": (addr or "").lower(),
                "from_name": display_name.strip(),
                "subject": _decode_mime_header(msg.get("Subject")),
                "body": body,
                "body_html": _email_body_html(msg, body)[:40000].strip(),
                "attachments": _email_pdf_attachments(msg),
            })
        return messages
    finally:
        try:
            box.logout()
        except Exception:
            pass


def _imap_find_sent_folder(box):
    """Descobre o nome da pasta "Enviados" via SPECIAL-USE (\\Sent) — o Gmail
    suporta RFC 6154, por isso funciona em qualquer idioma da conta, em vez
    de depender do nome literal ("[Gmail]/Sent Mail", "[Gmail]/E-mails
    enviados", etc.)."""
    try:
        _, folders = box.list()
    except Exception:
        folders = None
    for raw in (folders or []):
        line = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
        if "\\Sent" not in line:
            continue
        m = re.search(r'"([^"]*)"$|(\S+)$', line)
        if m:
            name = m.group(1) or m.group(2)
            return name.strip('"')
    # Fallback para os nomes habituais, caso o servidor não anuncie SPECIAL-USE.
    for guess in ("[Gmail]/Sent Mail", "[Gmail]/E-mails enviados", "[Gmail]/Enviados", "Sent"):
        try:
            status, _ = box.select(f'"{guess}"', readonly=True)
            if status == "OK":
                return guess
        except Exception:
            continue
    return None


def _imap_fetch_sent_since(last_uid):
    """Lê a pasta "Enviados" do Gmail — inclui tudo o que saiu da conta,
    enviado pela app ou diretamente pelo Gmail (site/telemóvel)."""
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
    try:
        box.login(GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD)
        folder = _imap_find_sent_folder(box)
        if not folder:
            return []
        box.select(f'"{folder}"', readonly=True)
        if last_uid:
            _, data = box.uid("search", None, f"UID {last_uid + 1}:*")
        else:
            since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%d-%b-%Y")
            _, data = box.uid("search", None, f"SINCE {since}")
        uids = sorted(int(u) for u in (data[0].split() if data and data[0] else []))
        uids = [u for u in uids if u > (last_uid or 0)][-50:]
        messages = []
        for uid in uids:
            _, msg_data = box.uid("fetch", str(uid), "(BODY.PEEK[])")
            raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
            if not raw:
                continue
            msg = email_lib.message_from_bytes(raw)
            display_name, addr = parseaddr(_decode_mime_header(msg.get("To") or ""))
            sent_at = now_iso()
            try:
                date_hdr = msg.get("Date")
                if date_hdr:
                    sent_at = parsedate_to_datetime(date_hdr).astimezone(timezone.utc).isoformat()
            except Exception:
                pass
            body = _email_text_body(msg)[:20000].strip()
            messages.append({
                "uid": uid,
                "message_id": (msg.get("Message-ID") or "").strip(),
                "to_email": (addr or "").lower(),
                "to_name": display_name.strip(),
                "subject": _decode_mime_header(msg.get("Subject")),
                "body": body,
                "body_html": _email_body_html(msg, body)[:40000].strip(),
                "sent_at": sent_at,
            })
        return messages
    finally:
        try:
            box.logout()
        except Exception:
            pass


def _clean_subject(subject):
    s = (subject or "").strip()
    while True:
        m = re.match(r"^(re|fw|fwd|enc)\s*:\s*", s, re.IGNORECASE)
        if not m:
            break
        s = s[m.end():].strip()
    return s.lower()


def _strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c))


def _subject_looks_like_quote(subject):
    """Um email só é associado automaticamente a um pedido se o assunto tiver
    'ORC' (ex.: referências como "ORC2026_7864") ou 'Orçamento' — associar só
    pelo remetente (fornecedor/cliente conhecido) juntava correspondência sem
    relação nenhuma ao pedido errado que estava à espera dele."""
    return "orc" in _strip_accents(subject).lower()


async def _match_note_for_reply(from_email, subject):
    """Associa a resposta ao pedido: primeiro pelo assunto (Re: do email que
    enviámos), depois pelo remetente (fornecedor conhecido, incluindo os
    emails dos contactos adicionais). Só corre se o assunto parecer um
    orçamento — ver _subject_looks_like_quote."""
    if not _subject_looks_like_quote(subject):
        return None, None, None
    clean = _clean_subject(subject)
    if clean:
        reqs = await db.quote_requests.find(
            {}, {"_id": 0, "note_id": 1, "subject": 1, "supplier_id": 1, "supplier_name": 1},
        ).sort("sent_at", -1).to_list(500)
        for r in reqs:
            if _clean_subject(r.get("subject")) == clean:
                return r.get("note_id"), r.get("supplier_id"), r.get("supplier_name")
    if not from_email:
        return None, None, None
    sup = None
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(2000)
    for s in suppliers:
        emails = {(s.get("email") or "").lower()}
        emails |= {(c.get("email") or "").lower() for c in (s.get("contacts") or [])}
        if from_email in emails - {""}:
            sup = s
            break
    if not sup:
        # Fallback: qualquer endereço do domínio do fornecedor conta (ex.:
        # comercial@bandaluminios.com quando só temos geral@bandaluminios.com,
        # ou o nome "BandAluminios" contido no domínio do remetente).
        domain = re.sub(r"[^a-z0-9.]", "", from_email.split("@")[-1])
        for s in suppliers:
            sup_domain = (s.get("email") or "").lower().split("@")[-1]
            slug = re.sub(r"[^a-z0-9]", "", (s.get("name") or "").lower())
            if (sup_domain and "@" in (s.get("email") or "") and domain == sup_domain) or \
               (slug and len(slug) >= 5 and slug in domain.replace(".", "")):
                sup = s
                break
    if not sup:
        return None, None, None
    docs = await db.notes.find(
        {"archived": {"$ne": True}, "supplier_id": sup["id"], "status": {"$in": list(WAITING_SUPPLIER)}},
        {"_id": 0, "id": 1, "last_supplier_sent_at": 1},
    ).to_list(200)
    docs.sort(key=lambda d: d.get("last_supplier_sent_at") or "", reverse=True)
    return (docs[0]["id"] if docs else None), sup["id"], sup.get("name")


async def _match_client_reply(from_email, subject):
    """Associa a resposta ao pedido pelo lado do CLIENTE — simétrico ao
    matching de fornecedor acima, mas ainda não existia: até agora, se um
    cliente respondesse a um orçamento, o email ficava na caixa sem qualquer
    ligação ao pedido. Tenta primeiro pelo assunto (Re: do email que
    enviámos ao cliente, registado em sent_emails), depois pelo endereço do
    cliente gravado no próprio pedido (o mais recentemente atualizado). Só
    corre se o assunto parecer um orçamento — ver _subject_looks_like_quote."""
    if not _subject_looks_like_quote(subject):
        return None
    clean = _clean_subject(subject)
    if clean:
        sent = await db.sent_emails.find(
            {"kind": "client"}, {"_id": 0, "note_id": 1, "subject": 1},
        ).sort("sent_at", -1).to_list(500)
        for r in sent:
            if r.get("note_id") and _clean_subject(r.get("subject")) == clean:
                return r["note_id"]
    if not from_email:
        return None
    docs = await db.notes.find(
        {"email": {"$regex": f"^{re.escape(from_email)}$", "$options": "i"}},
        {"_id": 0, "id": 1, "updated_at": 1},
    ).to_list(50)
    if not docs:
        return None
    docs.sort(key=lambda d: d.get("updated_at") or "", reverse=True)
    return docs[0]["id"]


async def poll_supplier_replies():
    if not SMTP_CONFIGURED:
        return {"ok": False, "new": 0, "detail": "SMTP não configurado."}
    state = await db.imap_state.find_one({"id": "inbox"}) or {}
    last_uid = int(state.get("last_uid") or 0)
    messages = await asyncio.to_thread(_imap_fetch_since, last_uid)
    matched = 0
    max_uid = last_uid
    for m in messages:
        max_uid = max(max_uid, m["uid"])
        if m["from_email"] == GMAIL_SMTP_USER.lower():
            continue
        if await db.received_emails.find_one({"uid": m["uid"]}):
            continue
        note_id, supplier_id, supplier_name = await _match_note_for_reply(m["from_email"], m["subject"])
        reply_kind = "supplier" if note_id else ""
        if not note_id:
            # Ou não há fornecedor conhecido, ou há um fornecedor conhecido mas
            # nenhum pedido atualmente à sua espera — nesse caso, antes de
            # desistir, tenta-se o lado do cliente (simétrico ao matching de
            # fornecedor, que até agora não existia).
            client_note_id = await _match_client_reply(m["from_email"], m["subject"])
            if client_note_id:
                note_id, reply_kind = client_note_id, "client"
                supplier_id, supplier_name = None, None
        # Guarda TODOS os emails da caixa de entrada — mesmo sem relação com
        # nenhum pedido — para a secção "Emails" mostrar a caixa completa.
        # Os efeitos automáticos (estado do pedido, análise de PDF) continuam
        # a só acontecer quando há um pedido associado.
        email_id = str(uuid.uuid4())
        attachments_meta = []
        for att in m.get("attachments", []):
            att_id = str(uuid.uuid4())
            await db.email_attachments.insert_one({
                "id": att_id, "email_id": email_id, "note_id": note_id or "",
                "filename": att["filename"], "content_b64": base64.b64encode(att["data"]).decode(),
                "created_at": now_iso()})
            attachments_meta.append({"id": att_id, "filename": att["filename"], "size": len(att["data"])})
        classification = await _classify_email(m["subject"], m["body"])
        rules_result = await _apply_rules(m["subject"], m["body"], m["from_email"], classification["category"])
        if rules_result["priority_override"]:
            classification["priority"] = rules_result["priority_override"]
            classification["priority_rank"] = EMAIL_PRIORITY_RANK[rules_result["priority_override"]]
        correio_semanal_summary = ""
        correio_semanal_result = None
        att_filenames = [att["filename"] for att in m.get("attachments", [])]
        if m.get("attachments") and _looks_like_correio_semanal(m["from_email"], m["subject"], att_filenames):
            pdf_bytes_list = [att["data"] for att in m["attachments"]]
            correio_semanal_summary = await _summarize_correio_semanal(m["subject"], pdf_bytes_list)
            correio_semanal_result = await _process_correio_semanal(m["subject"], pdf_bytes_list, email_id)
        await db.received_emails.insert_one({
            "id": email_id, "uid": m["uid"], "note_id": note_id or "",
            "supplier_id": supplier_id or "", "supplier_name": supplier_name or "",
            "from_name": m.get("from_name") or "", "reply_kind": reply_kind,
            "matched": bool(note_id or supplier_id),
            "from_email": m["from_email"], "subject": m["subject"], "body": m["body"],
            "body_html": m.get("body_html") or "",
            "attachments": attachments_meta, "has_pdf": bool(attachments_meta),
            **classification,
            "correio_semanal_summary": correio_semanal_summary,
            "correio_semanal_summary_at": now_iso() if correio_semanal_summary else "",
            "correio_semanal_csn_number": (correio_semanal_result or {}).get("digest", {}).get("csn_number") or "",
            "correio_semanal_diff": (correio_semanal_result or {}).get("diff"),
            "correio_semanal_suggested_tasks": (correio_semanal_result or {}).get("suggested_tasks_created") or 0,
            "seen": False, "received_at": now_iso()})
        if note_id:
            matched += 1
            quem = supplier_name or m.get("from_name") or m["from_email"]
            verbo = "Resposta recebida de" if reply_kind == "supplier" else "Resposta recebida do cliente"
            await log_activity(note_id, "email_received",
                               f"{verbo} {quem}: {m['subject'] or '(sem assunto)'}"
                               + (f" · {len(attachments_meta)} PDF em anexo" if attachments_meta else ""),
                               {"from": m["from_email"], "uid": m["uid"], "reply_kind": reply_kind})
            if reply_kind == "supplier":
                n = await db.notes.find_one({"id": note_id}, {"_id": 0, "status": 1})
                if n and n.get("status") in WAITING_SUPPLIER:
                    await db.notes.update_one({"id": note_id}, {"$set": {
                        "status": "orcamento_recebido", "status_updated_at": now_iso(), "updated_at": now_iso()}})
                    await log_activity(note_id, "status_change",
                                       "Estado alterado para Orçamento recebido (resposta por email)",
                                       {"to": "orcamento_recebido"})
                # PDF da BandAluminios em anexo → analisa e gera automaticamente
                # o PDF de venda ao cliente. Fica pronto para revisão — NUNCA é
                # enviado sem confirmação explícita do utilizador.
                if m.get("attachments"):
                    first = m["attachments"][0]
                    try:
                        supplier_quote = await _apply_supplier_pdf(
                            note_id, first["data"], first["filename"], source_label=" (recebido por email)")
                        try:
                            await _generate_client_pdf_file(
                                note_id, supplier_quote,
                                source_label=" — automático, reveja e envie quando quiser")
                        except ValueError as e:
                            await log_activity(note_id, "updated",
                                               f"PDF do fornecedor analisado, mas o PDF de cliente não foi gerado: {e}")
                    except ValueError as e:
                        await log_activity(note_id, "updated",
                                           f"PDF recebido por email ({first['filename']}) mas não reconhecido "
                                           f"como orçamento do fornecedor: {e}")
                    except Exception as e:
                        logger.error(f"Falha ao processar PDF recebido por email: {e}")
            else:
                # Resposta do cliente: nunca avança o estado sozinho (não há
                # forma segura de saber se aprovou, recusou ou só perguntou
                # algo) — mas fica marcado e reaparece bem visível nos
                # alertas para alguém decidir. Um cliente que responde está
                # claramente contactável, por isso repõe o contador de
                # chamadas sem resposta.
                await db.notes.update_one({"id": note_id}, {"$set": {
                    "last_client_reply_at": now_iso(), "client_no_answer_count": 0, "updated_at": now_iso()}})
    await db.imap_state.update_one({"id": "inbox"}, {"$set": {
        "id": "inbox", "last_uid": max_uid, "checked_at": now_iso()}}, upsert=True)
    return {"ok": True, "new": matched, "seen": len(messages)}


async def poll_sent_folder():
    """Lê a pasta "Enviados" do Gmail — cobre emails enviados diretamente
    pela app do Gmail (site ou telemóvel), não só os enviados através desta
    aplicação. Os que a própria app já enviou e registou são reconhecidos
    pelo Message-ID e ignorados, para não duplicar."""
    if not SMTP_CONFIGURED:
        return {"ok": False, "new": 0, "detail": "SMTP não configurado."}
    state = await db.imap_state.find_one({"id": "sent"}) or {}
    last_uid = int(state.get("last_uid") or 0)
    messages = await asyncio.to_thread(_imap_fetch_sent_since, last_uid)
    added = 0
    max_uid = last_uid
    for m in messages:
        max_uid = max(max_uid, m["uid"])
        if m["message_id"] and await db.sent_emails.find_one({"message_id": m["message_id"]}):
            continue  # já registado quando a app enviou este email
        if not m["to_email"]:
            continue
        note_id, supplier_id, supplier_name = await _match_note_for_reply(m["to_email"], m["subject"])
        kind = "supplier" if note_id else ""
        to_label = supplier_name or m.get("to_name") or ""
        if not note_id:
            client_note_id = await _match_client_reply(m["to_email"], m["subject"])
            if client_note_id:
                note_id, kind = client_note_id, "client"
                to_label = m.get("to_name") or ""
        await db.sent_emails.insert_one({
            "id": str(uuid.uuid4()), "to": m["to_email"], "to_label": to_label,
            "subject": m["subject"], "body": m["body"], "body_html": m.get("body_html") or "",
            "note_id": note_id or "",
            "kind": kind or "other", "pdf_file_id": "", "attachments": [],
            "message_id": m["message_id"], "source": "gmail", "sent_at": m["sent_at"]})
        added += 1
        if note_id:
            quem = to_label or m["to_email"]
            await log_activity(note_id, "email_sent", f"Email enviado pelo Gmail a {quem}: {m['subject'] or '(sem assunto)'}",
                               {"to": m["to_email"], "uid": m["uid"]})
    await db.imap_state.update_one({"id": "sent"}, {"$set": {
        "id": "sent", "last_uid": max_uid, "checked_at": now_iso()}}, upsert=True)
    return {"ok": True, "new": added, "seen": len(messages)}


@api_router.post("/emails/sync")
async def emails_sync():
    """Verificação manual da caixa de entrada e da pasta Enviados — só
    leitura, nunca envia nada."""
    try:
        inbox_result = await poll_supplier_replies()
        sent_result = await poll_sent_folder()
        return {
            "ok": inbox_result.get("ok", True) and sent_result.get("ok", True),
            "new": inbox_result.get("new", 0) + sent_result.get("new", 0),
            "new_received": inbox_result.get("new", 0),
            "new_sent": sent_result.get("new", 0),
        }
    except imaplib.IMAP4.error as e:
        raise HTTPException(status_code=502, detail=f"O Gmail recusou a ligação IMAP: {e}")
    except Exception as e:
        logger.error(f"Sincronização IMAP falhou: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível verificar a caixa de entrada.")


@api_router.get("/notes/{note_id}/emails")
async def note_received_emails(note_id: str):
    return await db.received_emails.find({"note_id": note_id}, {"_id": 0}).sort("received_at", -1).to_list(100)


@api_router.get("/emails/unseen")
async def unseen_supplier_emails():
    """Emails de FORNECEDORES ainda não vistos — alimenta o aviso amarelo
    global. Correspondência com pedidos/fornecedores; emails sem relação
    (agora também guardados) não entram aqui — só na secção "Emails"."""
    docs = await db.received_emails.find(
        {"seen": {"$ne": True}, "matched": True}, {"_id": 0, "body": 0},
    ).sort("received_at", -1).to_list(50)
    return {"count": len(docs), "items": docs}


@api_router.post("/emails/{email_id}/seen")
async def mark_email_seen(email_id: str):
    await db.received_emails.update_one({"id": email_id}, {"$set": {"seen": True}})
    return {"ok": True}


@api_router.post("/emails/seen-all")
async def mark_all_emails_seen():
    r = await db.received_emails.update_many({"seen": {"$ne": True}}, {"$set": {"seen": True}})
    return {"ok": True, "marked": r.modified_count}


class BulkIdsIn(BaseModel):
    ids: List[str] = []


@api_router.post("/emails/bulk-seen")
async def bulk_mark_emails_seen(payload: BulkIdsIn):
    if not payload.ids:
        return {"ok": True, "modified": 0}
    r = await db.received_emails.update_many({"id": {"$in": payload.ids}}, {"$set": {"seen": True}})
    return {"ok": True, "modified": r.modified_count}


# ---------- Secção "Emails": caixa completa, enviados e rascunhos ----------
# Ao contrário do painel de cada pedido (que só mostra o que lhe pertence),
# esta secção mostra TUDO — incluindo emails sem qualquer pedido associado.

def _email_search_clause(search, fields):
    if not search:
        return None
    rx = {"$regex": re.escape(search), "$options": "i"}
    return {"$or": [{f: rx} for f in fields]}


@api_router.get("/emails/inbox")
async def emails_inbox(search: Optional[str] = None, matched: Optional[bool] = None,
                       sort: str = "priority", skip: int = 0, limit: int = 50):
    q = {}
    if matched is not None:
        q["matched"] = matched
    rx = _email_search_clause(search, ["from_email", "subject", "supplier_name", "body"])
    if rx:
        q.update(rx)
    skip = max(skip, 0)
    limit = min(max(limit, 1), 100)
    total = await db.received_emails.count_documents(q)
    order = [("priority_rank", 1), ("received_at", -1)] if sort == "priority" else [("received_at", -1)]
    docs = await db.received_emails.find(q, {"_id": 0}).sort(order).skip(skip).limit(limit).to_list(limit)
    return {"items": docs, "total": total}


@api_router.get("/emails/sent")
async def emails_sent(kind: Optional[str] = None, search: Optional[str] = None,
                      skip: int = 0, limit: int = 50):
    q = {}
    if kind in ("supplier", "client", "other"):
        q["kind"] = kind
    rx = _email_search_clause(search, ["to", "to_label", "subject", "body"])
    if rx:
        q.update(rx)
    skip = max(skip, 0)
    limit = min(max(limit, 1), 100)
    total = await db.sent_emails.count_documents(q)
    docs = await db.sent_emails.find(q, {"_id": 0}).sort("sent_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": docs, "total": total}


@api_router.get("/emails/drafts")
async def emails_drafts():
    """Emails preparados automaticamente (ou manualmente) e ainda por
    confirmar — em qualquer pedido, de qualquer área."""
    docs = await db.notes.find(
        {"pending_client_send": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "customer_name": 1, "email": 1, "phone": 1, "pending_client_send": 1},
    ).to_list(500)
    docs.sort(key=lambda d: (d.get("pending_client_send") or {}).get("created_at") or "", reverse=True)
    return {"items": docs, "total": len(docs)}


@api_router.get("/emails/contacts")
async def email_contacts(search: Optional[str] = None):
    """Sugestões de destinatário para o botão 'Novo email' — fornecedores e
    clientes com email guardado, para não obrigar a copiar o endereço à mão."""
    q_sup = {"email": {"$nin": ["", None]}}
    q_note = {"email": {"$nin": ["", None]}}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q_sup = {**q_sup, "$or": [{"name": rx}, {"email": rx}]}
        q_note = {**q_note, "$or": [{"customer_name": rx}, {"email": rx}]}
    sups = await db.suppliers.find(q_sup, {"_id": 0, "name": 1, "email": 1}).sort("name", 1).to_list(15)
    notes = await db.notes.find(q_note, {"_id": 0, "customer_name": 1, "email": 1}).sort("updated_at", -1).to_list(15)
    seen, out = set(), []
    for s in sups:
        e = (s.get("email") or "").strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        out.append({"email": s["email"].strip(), "label": s.get("name") or s["email"], "kind": "supplier"})
    for n in notes:
        e = (n.get("email") or "").strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        out.append({"email": n["email"].strip(), "label": n.get("customer_name") or n["email"], "kind": "client"})
    return {"items": out[:20]}


class AttachmentIn(BaseModel):
    filename: str = "anexo"
    data_b64: str


def _decode_attachments(items):
    """Decodifica anexos enviados em base64 (máx. 10, 20 MB no total) para o
    formato aceite por _send_email."""
    if not items:
        return []
    out, total = [], 0
    for a in items[:10]:
        try:
            data = base64.b64decode(a.data_b64)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Anexo inválido: {a.filename}")
        total += len(data)
        if total > MAX_EMAIL_ATTACHMENT_TOTAL_BYTES:
            raise HTTPException(status_code=400, detail="Anexos demasiado grandes (máx. 20 MB no total).")
        out.append({"filename": a.filename or "anexo", "data": data})
    return out


class ComposeEmailIn(BaseModel):
    to: str
    subject: str
    body: str
    to_label: str = ""
    attachments: List[AttachmentIn] = []

    @field_validator("to")
    @classmethod
    def _v_to(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("O destinatário é obrigatório")
        return normalize_email(v)


@api_router.post("/emails/compose")
async def compose_email(payload: ComposeEmailIn):
    """Novo email livre, sem pedido associado — usado pelo botão 'Novo email'
    na secção Emails."""
    if not payload.subject.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="O assunto e a mensagem não podem estar vazios.")
    attachments = _decode_attachments(payload.attachments)
    await _send_email(payload.to, payload.subject, payload.body, attachments=attachments, to_label=payload.to_label.strip())
    return {"ok": True, "to": payload.to}


class QuickReplyIn(BaseModel):
    body: str
    subject: Optional[str] = None
    attachments: List[AttachmentIn] = []


@api_router.post("/emails/{email_id}/reply")
async def reply_to_email(email_id: str, payload: QuickReplyIn):
    """Resposta rápida a um email recebido, sem sair da caixa de entrada —
    mesmo destinatário e mesmo pedido associado (se houver)."""
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    to = (e.get("from_email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Este email não tem um remetente válido.")
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="A mensagem não pode estar vazia.")
    orig_subject = (e.get("subject") or "").strip()
    subject = (payload.subject or "").strip()
    if not subject:
        subject = orig_subject if orig_subject.lower().startswith("re:") else f"Re: {orig_subject}".strip()
    kind = e.get("reply_kind") if e.get("reply_kind") in ("supplier", "client") else "other"
    to_label = e.get("supplier_name") or e.get("from_name") or ""
    attachments = _decode_attachments(payload.attachments)
    await _send_email(to, subject, payload.body, attachments=attachments, note_id=e.get("note_id") or None, kind=kind, to_label=to_label)
    if e.get("note_id"):
        await log_activity(e["note_id"], "email_sent", f"Resposta rápida enviada a {to}", {"to": to})
    await db.received_emails.update_one({"id": email_id}, {"$set": {"seen": True}})
    return {"ok": True, "to": to}


class ForwardEmailIn(BaseModel):
    to: str
    note: str = ""

    @field_validator("to")
    @classmethod
    def _v_to(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("O destinatário é obrigatório")
        return normalize_email(v)


@api_router.post("/emails/{email_id}/forward")
async def forward_email(email_id: str, payload: ForwardEmailIn):
    """Reencaminha um email recebido para outro destinatário, com o texto
    original citado e os anexos originais transportados."""
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    orig_subject = (e.get("subject") or "").strip()
    subject = orig_subject if orig_subject.lower().startswith("fwd:") else f"Fwd: {orig_subject}".strip()
    quoted = (
        f"---------- Mensagem reencaminhada ----------\n"
        f"De: {e.get('from_name') or e.get('from_email')} <{e.get('from_email')}>\n"
        f"Assunto: {orig_subject or '(sem assunto)'}\n\n"
        f"{e.get('body') or ''}"
    )
    body = f"{payload.note.strip()}\n\n{quoted}" if payload.note.strip() else quoted
    files = await db.email_attachments.find({"email_id": email_id}, {"_id": 0}).to_list(10)
    attachments = [{"filename": f["filename"], "data": base64.b64decode(f["content_b64"])} for f in files]
    await _send_email(payload.to, subject, body, attachments=attachments, kind="other")
    return {"ok": True, "to": payload.to}


@api_router.post("/emails/{email_id}/suggest-reply")
async def suggest_email_reply(email_id: str):
    """Sugestão de resposta gerada por IA — o utilizador revê e edita antes
    de enviar; nada é enviado a partir daqui."""
    if not ai_available():
        raise HTTPException(status_code=400, detail="Integração OpenAI não configurada.")
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    context = ""
    if e.get("note_id"):
        n = await db.notes.find_one({"id": e["note_id"]}, {"_id": 0})
        if n:
            context = f"Pedido relacionado: {n.get('description') or ''} para {n.get('customer_name') or ''}.\n"
    system = ("Escreves respostas de email em português de Portugal, em nome de uma loja Bricomarché. "
              "Tom profissional, simpático e direto. Escreves só o corpo da mensagem, sem assunto, "
              "sem saudação de despedida nem assinatura (é adicionada automaticamente a seguir).")
    prompt = (
        f"{context}Escreve uma resposta a este email.\n\n"
        f"De: {e.get('from_name') or e.get('from_email')}\n"
        f"Assunto: {e.get('subject') or ''}\n\n"
        f"\"\"\"{(e.get('body') or '')[:3000]}\"\"\""
    )
    try:
        suggestion = (await ai_complete(system, prompt, session=f"suggest-reply-{uuid.uuid4()}")).strip()
    except Exception as ex:
        logger.error(f"AI suggest-reply falhou: {ex}")
        raise HTTPException(status_code=502, detail="Falha na chamada à OpenAI. Verifique a chave e o saldo.")
    return {"suggestion": suggestion}


class SmartSearchIn(BaseModel):
    query: str = ""


@api_router.post("/emails/smart-search")
async def emails_smart_search(payload: SmartSearchIn):
    """Pesquisa em linguagem natural na caixa de entrada — ex.: 'emails do
    fornecedor X sobre alumínio da semana passada'. Sem IA configurada (ou
    se a interpretação falhar), cai para pesquisa literal normal."""
    q_text = payload.query.strip()
    if not q_text:
        return {"items": [], "total": 0, "interpreted": None}

    async def literal():
        rx = _email_search_clause(q_text, ["from_email", "subject", "supplier_name", "from_name", "body"])
        docs = await db.received_emails.find(rx or {}, {"_id": 0}).sort("received_at", -1).limit(50).to_list(50)
        return {"items": docs, "total": len(docs), "interpreted": None}

    if not ai_available():
        return await literal()
    today = datetime.now(timezone.utc).date().isoformat()
    system = ("Interpretas pesquisas em linguagem natural sobre a caixa de email de uma loja Bricomarché "
              "em Portugal. Respondes SEMPRE apenas com JSON válido, sem texto extra.")
    prompt = (
        f"Hoje é {today}. Converte esta pesquisa numa consulta estruturada. Responde APENAS com JSON:\n"
        '{"keyword": "palavras-chave a procurar no assunto/corpo, ou \\"\\"", '
        '"contact": "nome ou email do remetente/fornecedor/cliente mencionado, ou \\"\\"", '
        '"date_from": "YYYY-MM-DD ou \\"\\"", "date_to": "YYYY-MM-DD ou \\"\\"", '
        '"category": "orcamento|reclamacao|duvida|urgente|outro ou \\"\\""}\n\n'
        f'Pesquisa: "{q_text}"'
    )
    try:
        raw = await ai_complete(system, prompt, session=f"smart-search-{uuid.uuid4()}")
    except Exception as e:
        logger.error(f"AI smart-search falhou: {e}")
        return await literal()
    data = extract_json(raw)
    if not data:
        return await literal()
    clauses = []
    keyword = (data.get("keyword") or "").strip()
    if keyword:
        rx = {"$regex": re.escape(keyword), "$options": "i"}
        clauses.append({"$or": [{"subject": rx}, {"body": rx}]})
    contact = (data.get("contact") or "").strip()
    if contact:
        rx = {"$regex": re.escape(contact), "$options": "i"}
        clauses.append({"$or": [{"from_email": rx}, {"from_name": rx}, {"supplier_name": rx}]})
    category = data.get("category") or ""
    if category in EMAIL_CATEGORIES:
        clauses.append({"category": category})
    date_from = (data.get("date_from") or "").strip()
    date_to = (data.get("date_to") or "").strip()
    if date_from:
        clauses.append({"received_at": {"$gte": date_from}})
    if date_to:
        clauses.append({"received_at": {"$lte": date_to + "T23:59:59"}})
    q = {"$and": clauses} if clauses else {}
    docs = await db.received_emails.find(q, {"_id": 0}).sort("received_at", -1).limit(50).to_list(50)
    return {"items": docs, "total": len(docs), "interpreted": data}


@api_router.post("/emails/{email_id}/create-note")
async def create_note_from_email(email_id: str):
    """Um email chegou sem corresponder a nenhum pedido conhecido (ex.: um
    cliente novo a pedir pela primeira vez) — em vez de o utilizador ter de
    criar o pedido à mão e copiar tudo, um único clique cria-o já preenchido
    e liga o email como primeira mensagem na cronologia."""
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    if e.get("note_id"):
        raise HTTPException(status_code=400, detail="Este email já está associado a um pedido.")
    description = (e.get("subject") or "").strip() or (e.get("body") or "").strip()[:120] or "Pedido recebido por email"
    note = await create_note(NoteIn(
        customer_name=e.get("from_name") or e.get("from_email") or "Cliente",
        email=e.get("from_email") or "", description=description,
        details=(e.get("body") or "").strip()[:2000]))
    await db.received_emails.update_one({"id": email_id}, {"$set": {
        "note_id": note["id"], "matched": True, "reply_kind": "client"}})
    await db.email_attachments.update_many({"email_id": email_id}, {"$set": {"note_id": note["id"]}})
    await log_activity(note["id"], "email_received",
                       f"Pedido criado a partir de um email recebido de {e.get('from_email')}",
                       {"from": e.get("from_email"), "uid": e.get("uid")})
    return enrich_note(await db.notes.find_one({"id": note["id"]}, {"_id": 0}))


class LinkNoteIn(BaseModel):
    note_id: str


@api_router.post("/emails/{email_id}/link-note")
async def link_email_to_note(email_id: str, payload: LinkNoteIn):
    """Associa um email recebido a um pedido já existente — para quando um
    fornecedor (ex.: BandAluminios) responde fora do fluxo automático (outro
    assunto, o pedido já não estava à espera de fornecedor, etc.) e o
    matching por assunto/remetente não encontrou o pedido certo sozinho.
    Tal como no matching automático, uma resposta de fornecedor associada
    a um pedido que ainda estava à espera avança o estado para "Orçamento
    recebido" — a associação manual deve ter o mesmo efeito que teria tido
    se o matching automático a tivesse encontrado."""
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    if e.get("note_id"):
        raise HTTPException(status_code=400, detail="Este email já está associado a um pedido.")
    n = await db.notes.find_one({"id": payload.note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    from_email = (e.get("from_email") or "").lower()
    reply_kind = "client" if n.get("email") and n["email"].lower() == from_email else "supplier"
    await db.received_emails.update_one({"id": email_id}, {"$set": {
        "note_id": payload.note_id, "matched": True, "reply_kind": reply_kind}})
    await db.email_attachments.update_many({"email_id": email_id}, {"$set": {"note_id": payload.note_id}})
    await log_activity(payload.note_id, "email_received",
                       f"Email associado manualmente ({e.get('from_email')}): {e.get('subject') or '(sem assunto)'}",
                       {"from": e.get("from_email"), "uid": e.get("uid")})
    status_changed = False
    if reply_kind == "supplier" and n.get("status") in WAITING_SUPPLIER:
        await db.notes.update_one({"id": payload.note_id}, {"$set": {
            "status": "orcamento_recebido", "status_updated_at": now_iso(), "updated_at": now_iso()}})
        await log_activity(payload.note_id, "status_change",
                           "Estado alterado para Orçamento recebido (email associado manualmente)",
                           {"to": "orcamento_recebido"})
        status_changed = True
    elif reply_kind == "client":
        await db.notes.update_one({"id": payload.note_id}, {"$set": {
            "last_client_reply_at": now_iso(), "client_no_answer_count": 0, "updated_at": now_iso()}})
    note = enrich_note(await db.notes.find_one({"id": payload.note_id}, {"_id": 0}))
    return {**note, "status_changed": status_changed}


@api_router.post("/emails/{email_id}/unlink-note")
async def unlink_email_from_note(email_id: str):
    """Remove a associação de um email a um pedido — para desfazer um
    matching automático (ou manual) errado. O email volta a aparecer como
    "Sem pedido associado", podendo ser associado de novo a outro pedido.
    Coerente com a associação: se o estado ainda estiver exatamente em
    "Orçamento recebido" (ninguém avançou o pedido entretanto), volta a
    "À espera do fornecedor" — o mesmo estado que tinha antes deste email
    ter sido associado."""
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    note_id = e.get("note_id")
    if not note_id:
        raise HTTPException(status_code=400, detail="Este email não está associado a nenhum pedido.")
    reply_kind = e.get("reply_kind")
    await db.received_emails.update_one({"id": email_id}, {"$set": {
        "note_id": "", "supplier_id": "", "supplier_name": "", "matched": False, "reply_kind": ""}})
    await db.email_attachments.update_many({"email_id": email_id}, {"$set": {"note_id": ""}})
    await log_activity(note_id, "email_received",
                       f"Associação ao email removida ({e.get('from_email')}): {e.get('subject') or '(sem assunto)'}",
                       {"from": e.get("from_email"), "uid": e.get("uid")})
    status_changed = False
    new_status = None
    if reply_kind == "supplier":
        n = await db.notes.find_one({"id": note_id}, {"_id": 0, "status": 1})
        if n and n.get("status") == "orcamento_recebido":
            await db.notes.update_one({"id": note_id}, {"$set": {
                "status": "aguarda_fornecedor", "status_updated_at": now_iso(), "updated_at": now_iso()}})
            await log_activity(note_id, "status_change",
                               "Estado voltou a À espera do fornecedor (associação ao email removida)",
                               {"to": "aguarda_fornecedor"})
            status_changed, new_status = True, "aguarda_fornecedor"
    return {"ok": True, "note_id": note_id, "status_changed": status_changed, "status": new_status}


@api_router.get("/emails/{email_id}/attachments/{attachment_id}")
async def download_email_attachment(email_id: str, attachment_id: str):
    f = await db.email_attachments.find_one({"id": attachment_id, "email_id": email_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    return Response(content=base64.b64decode(f["content_b64"]), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{f.get("filename", "anexo.pdf")}"'})


# ---------- Modelos de resposta reutilizáveis ----------
class EmailTemplateIn(BaseModel):
    name: str
    subject: str = ""
    body: str = ""


@api_router.get("/email-templates")
async def list_email_templates():
    return await db.email_templates.find({}, {"_id": 0}).sort("name", 1).to_list(500)


@api_router.post("/email-templates")
async def create_email_template(payload: EmailTemplateIn):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome do modelo é obrigatório.")
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.email_templates.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/email-templates/{template_id}")
async def update_email_template(template_id: str, payload: EmailTemplateIn):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome do modelo é obrigatório.")
    r = await db.email_templates.update_one({"id": template_id}, {"$set": payload.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")
    return await db.email_templates.find_one({"id": template_id}, {"_id": 0})


@api_router.delete("/email-templates/{template_id}")
async def delete_email_template(template_id: str):
    await db.email_templates.delete_one({"id": template_id})
    return {"ok": True}


# ---------- Regras automáticas ----------
class EmailRuleCondition(BaseModel):
    field: str
    op: str = "contains"
    value: str = ""

    @field_validator("field")
    @classmethod
    def _v_field(cls, v):
        return _check_choice(v, EMAIL_RULE_FIELDS, "Campo")

    @field_validator("op")
    @classmethod
    def _v_op(cls, v):
        return _check_choice(v, EMAIL_RULE_OPS, "Operador")


class EmailRuleAction(BaseModel):
    type: str
    value: str = ""

    @field_validator("type")
    @classmethod
    def _v_type(cls, v):
        return _check_choice(v, EMAIL_RULE_ACTION_TYPES, "Ação")


class EmailRuleIn(BaseModel):
    name: str
    enabled: bool = True
    conditions: List[EmailRuleCondition] = []
    actions: List[EmailRuleAction] = []


@api_router.get("/email-rules")
async def list_email_rules():
    return await db.email_rules.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@api_router.post("/email-rules")
async def create_email_rule(payload: EmailRuleIn):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome da regra é obrigatório.")
    if not payload.conditions or not payload.actions:
        raise HTTPException(status_code=400, detail="A regra precisa de pelo menos uma condição e uma ação.")
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.email_rules.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/email-rules/{rule_id}")
async def update_email_rule(rule_id: str, payload: EmailRuleIn):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome da regra é obrigatório.")
    if not payload.conditions or not payload.actions:
        raise HTTPException(status_code=400, detail="A regra precisa de pelo menos uma condição e uma ação.")
    r = await db.email_rules.update_one({"id": rule_id}, {"$set": payload.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    return await db.email_rules.find_one({"id": rule_id}, {"_id": 0})


@api_router.delete("/email-rules/{rule_id}")
async def delete_email_rule(rule_id: str):
    await db.email_rules.delete_one({"id": rule_id})
    return {"ok": True}


# ---------- Lembrete de seguimento (cria uma Tarefa ligada ao email) ----------
class ReminderIn(BaseModel):
    days: int = 3


@api_router.post("/emails/{email_id}/remind")
async def create_email_reminder(email_id: str, payload: ReminderIn):
    e = await db.received_emails.find_one({"id": email_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Email não encontrado")
    days = min(max(payload.days, 1), 60)
    due_date = (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()
    who = e.get("supplier_name") or e.get("from_name") or e.get("from_email")
    title = f"Seguir email de {who}: {e.get('subject') or '(sem assunto)'}"[:200]
    doc = {
        "id": str(uuid.uuid4()), "title": title, "category": "construcao", "done": False,
        "priority": "media", "due_date": due_date, "repeat": "none",
        "note_id": e.get("note_id") or "", "subtasks": [], "created_at": now_iso(),
    }
    await db.tasks.insert_one(dict(doc))
    if doc["note_id"]:
        await log_activity(doc["note_id"], "task_added", f"Lembrete criado: {title}")
    doc.pop("_id", None)
    return doc


# ---------- Vista de conversa (agrupa recebidos+enviados por pedido/contacto) ----------
def _thread_key(note_id, contact):
    return f"note:{note_id}" if note_id else f"email:{(contact or '').strip().lower()}"


@api_router.get("/emails/threads")
async def list_email_threads():
    received = await db.received_emails.find(
        {}, {"_id": 0, "note_id": 1, "from_email": 1, "from_name": 1, "supplier_name": 1,
             "subject": 1, "body": 1, "received_at": 1, "seen": 1}).to_list(5000)
    sent = await db.sent_emails.find(
        {}, {"_id": 0, "note_id": 1, "to": 1, "to_label": 1, "subject": 1, "body": 1, "sent_at": 1}).to_list(5000)
    groups = {}
    for r in received:
        k = _thread_key(r.get("note_id"), r.get("from_email"))
        g = groups.setdefault(k, {"key": k, "label": r.get("supplier_name") or r.get("from_name") or r.get("from_email"),
                                   "note_id": r.get("note_id") or "", "last_at": "", "last_preview": "", "count": 0, "unseen": 0})
        g["count"] += 1
        if not r.get("seen"):
            g["unseen"] += 1
        if (r.get("received_at") or "") > g["last_at"]:
            g["last_at"] = r.get("received_at") or ""
            g["last_preview"] = (r.get("subject") or r.get("body") or "")[:120]
    for s in sent:
        k = _thread_key(s.get("note_id"), s.get("to"))
        g = groups.setdefault(k, {"key": k, "label": s.get("to_label") or s.get("to"),
                                   "note_id": s.get("note_id") or "", "last_at": "", "last_preview": "", "count": 0, "unseen": 0})
        g["count"] += 1
        if (s.get("sent_at") or "") > g["last_at"]:
            g["last_at"] = s.get("sent_at") or ""
            g["last_preview"] = (s.get("subject") or s.get("body") or "")[:120]
    items = sorted(groups.values(), key=lambda g: g["last_at"], reverse=True)
    return {"items": items, "total": len(items)}


@api_router.get("/emails/threads/view")
async def get_email_thread(key: str):
    """Linha do tempo completa (recebidos + enviados) de uma conversa,
    identificada pela chave devolvida por /emails/threads."""
    if key.startswith("note:"):
        q_field_r, q_field_s, ident = "note_id", "note_id", key[len("note:"):]
    elif key.startswith("email:"):
        q_field_r, q_field_s, ident = "from_email", "to", key[len("email:"):]
    else:
        raise HTTPException(status_code=400, detail="Chave de conversa inválida.")
    r_q = {q_field_r: ident} if key.startswith("note:") else {q_field_r: ident, "note_id": ""}
    s_q = {q_field_s: ident} if key.startswith("note:") else {q_field_s: ident, "note_id": ""}
    received = await db.received_emails.find(r_q, {"_id": 0}).to_list(500)
    sent = await db.sent_emails.find(s_q, {"_id": 0}).to_list(500)
    messages = [{"direction": "in", "at": r.get("received_at"), **r} for r in received]
    messages += [{"direction": "out", "at": s.get("sent_at"), **s} for s in sent]
    messages.sort(key=lambda m: m.get("at") or "")
    return {"items": messages}


# ---------- Emails enviados sem resposta ----------
@api_router.get("/emails/awaiting-reply")
async def emails_awaiting_reply(days: int = 3):
    """Emails enviados há mais de N dias sem que tenha chegado nenhuma
    resposta associada ao mesmo pedido ou contacto — para nada cair no
    esquecimento."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(days, 1))).isoformat()
    sent = await db.sent_emails.find({"sent_at": {"$lte": cutoff}}, {"_id": 0}).sort("sent_at", 1).to_list(500)
    out = []
    for s in sent:
        q = {"received_at": {"$gt": s["sent_at"]}}
        if s.get("note_id"):
            q["note_id"] = s["note_id"]
        else:
            q["from_email"] = s["to"]
        replied = await db.received_emails.find_one(q, {"_id": 0, "id": 1})
        if not replied:
            out.append(s)
    return {"items": out, "total": len(out)}


# ---------- Estatísticas de email ----------
@api_router.get("/emails/stats")
async def emails_stats():
    avg_response, fastest, _, _ = await compute_response()
    since_iso = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    received = await db.received_emails.find(
        {"received_at": {"$gte": since_iso}}, {"_id": 0, "received_at": 1, "priority": 1, "category": 1}).to_list(5000)
    sent = await db.sent_emails.find({"sent_at": {"$gte": since_iso}}, {"_id": 0, "sent_at": 1}).to_list(5000)
    by_day = {}
    for r in received:
        d = (r.get("received_at") or "")[:10]
        if d:
            by_day.setdefault(d, {"received": 0, "sent": 0})["received"] += 1
    for s in sent:
        d = (s.get("sent_at") or "")[:10]
        if d:
            by_day.setdefault(d, {"received": 0, "sent": 0})["sent"] += 1
    daily = [{"date": d, **v} for d, v in sorted(by_day.items())]
    by_category = {}
    by_priority = {"alta": 0, "normal": 0, "baixa": 0}
    for r in received:
        cat = r.get("category") or "outro"
        by_category[cat] = by_category.get(cat, 0) + 1
        pr = r.get("priority") or "normal"
        by_priority[pr] = by_priority.get(pr, 0) + 1
    return {
        "avg_response_hours": avg_response, "fastest_suppliers": fastest,
        "daily": daily, "by_category": by_category, "by_priority": by_priority,
        "total_received_30d": len(received), "total_sent_30d": len(sent),
    }


class ClientEmailIn(BaseModel):
    subject: str
    body: str


@api_router.post("/notes/{note_id}/send-client-email")
async def send_client_email(note_id: str, payload: ClientEmailIn):
    """Envia a resposta ao cliente pela conta configurada. Só é chamado por
    ação explícita do utilizador no botão 'Enviar por email'."""
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    to = (n.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="O cliente não tem email definido nos Detalhes.")
    if not payload.subject.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="O assunto e a mensagem não podem estar vazios.")
    await _send_email(to, payload.subject, payload.body, note_id=note_id, kind="client", to_label=n.get("customer_name") or "")
    await db.notes.update_one({"id": note_id}, {"$set": {
        "status": "aguarda_cliente", "last_client_contact_at": now_iso(),
        "status_updated_at": now_iso(), "updated_at": now_iso()}})
    await log_activity(note_id, "email_sent", f"Orçamento enviado ao cliente por email ({to})",
                       {"to": to, "client": True})
    return {"ok": True, "to": to}


@api_router.post("/notes/{note_id}/send-quote-request")
async def send_quote_request(note_id: str, payload: QuoteRequestIn):
    note = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    ids = list(dict.fromkeys(payload.supplier_ids or ([payload.supplier_id] if payload.supplier_id else [])))
    if not ids:
        raise HTTPException(status_code=400, detail="Escolha pelo menos um fornecedor.")
    if not payload.subject.strip() or not payload.body.strip():
        raise HTTPException(status_code=400, detail="O assunto e a mensagem não podem estar vazios.")
    if not SMTP_CONFIGURED and not await get_gmail_creds():
        raise HTTPException(status_code=400, detail="Gmail não está ligado. Ligue a sua conta Gmail para enviar emails automaticamente.")
    sent_names, sent_ids, failed = [], [], []
    for sid in ids:
        supplier = await db.suppliers.find_one({"id": sid}, {"_id": 0})
        if not supplier:
            failed.append({"supplier_id": sid, "reason": "Fornecedor não encontrado"})
            continue
        name = supplier.get("name") or "Fornecedor"
        if not (supplier.get("email") or "").strip():
            failed.append({"supplier_id": sid, "supplier_name": name, "reason": "Sem email definido"})
            continue
        try:
            await _send_email(supplier["email"], payload.subject, payload.body,
                              note_id=note_id, kind="supplier", to_label=name)
        except HTTPException as e:
            failed.append({"supplier_id": sid, "supplier_name": name, "reason": e.detail})
            continue
        await db.quote_requests.insert_one({"id": str(uuid.uuid4()), "note_id": note_id, "supplier_id": sid,
                                            "supplier_name": name, "subject": payload.subject,
                                            "body": payload.body, "sent_at": now_iso(), "is_reminder": payload.is_reminder})
        verb = "Lembrete enviado" if payload.is_reminder else "Pedido de orçamento enviado"
        await log_activity(note_id, "email_sent", f"{verb} a {name}",
                           {"supplier_id": sid, "supplier_name": name, "reminder": payload.is_reminder})
        sent_names.append(name)
        sent_ids.append(sid)
    if not sent_names:
        reasons = "; ".join(f"{f.get('supplier_name', f['supplier_id'])}: {f['reason']}" for f in failed)
        raise HTTPException(status_code=400, detail=f"Nenhum email enviado. {reasons}")
    new_status = "aguarda_fornecedor" if payload.is_reminder else "enviado_fornecedor"
    upd = {"last_supplier_sent_at": now_iso(), "status_updated_at": now_iso(), "updated_at": now_iso(), "status": new_status}
    if payload.is_reminder:
        upd["last_reminder_at"] = now_iso()
        await db.notes.update_one({"id": note_id}, {"$inc": {"reminder_count": 1}})
    else:
        upd["supplier_id"] = sent_ids[0]
    await db.notes.update_one({"id": note_id}, {"$set": upd})
    return {"ok": True, "sent_to": sent_names, "failed": failed}


# ---------- Notifications / Today ----------
async def build_notifications():
    now = datetime.now(timezone.utc)
    notes = await db.notes.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(5000)
    # Respostas de cliente por email ainda não vistas — mostradas aqui em vez
    # de avançar o estado sozinho, porque só um humano sabe se a resposta é
    # uma aprovação, uma recusa ou só uma pergunta. Marcar o email como visto
    # (na secção Emails ou na aba Orçamentos do pedido) resolve o alerta.
    unseen_client_replies = {}
    async for e in db.received_emails.find(
        {"reply_kind": "client", "seen": {"$ne": True}, "note_id": {"$ne": ""}},
        {"_id": 0, "note_id": 1, "subject": 1, "received_at": 1}):
        cur = unseen_client_replies.get(e["note_id"])
        if not cur or e.get("received_at", "") > cur.get("received_at", ""):
            unseen_client_replies[e["note_id"]] = e
    out = []
    for n in notes:
        status = n.get("status", "novo")
        if status in CLOSED_STATUSES:
            continue
        sla = n.get("sla_days") or DEFAULT_SLA_DAYS
        ref = parse_dt(n.get("status_updated_at") or n.get("updated_at") or n.get("created_at"))
        days = (now - ref).days if ref else 0
        cust = n.get("customer_name") or "Cliente"
        if status in WAITING_SUPPLIER and days >= sla:
            out.append({"id": f"{n['id']}-wait", "note_id": n["id"], "kind": "waiting_supplier", "severity": "high",
                        "title": f"{cust} · sem resposta do fornecedor",
                        "message": f"Há {days} dia(s) sem resposta. {NEXT_ACTION.get(status)}", "days": days})
        elif status in FORGOTTEN_STATUSES and days >= sla:
            out.append({"id": f"{n['id']}-forg", "note_id": n["id"], "kind": "forgotten", "severity": "medium",
                        "title": f"{cust} · pedido parado",
                        "message": f"Parado há {days} dia(s). {NEXT_ACTION.get(status)}", "days": days})
        if n.get("priority") == "urgente":
            out.append({"id": f"{n['id']}-urg", "note_id": n["id"], "kind": "urgent", "severity": "high",
                        "title": f"{cust} · URGENTE", "message": f"Pedido urgente. {NEXT_ACTION.get(status)}", "days": days})
        pending_send = n.get("pending_client_send")
        if pending_send:
            out.append({"id": f"{n['id']}-send", "note_id": n["id"], "kind": "confirm_send", "severity": "high",
                        "title": f"{cust} · orçamento pronto a enviar",
                        "message": "Email e PDF preparados automaticamente — reveja e confirme o envio.", "days": days})
            # Centro de Validação Automática: mesmo com o PDF já gerado, se a
            # leitura do PDF do fornecedor ficou incompleta ou o orçamento
            # mudou desde a última versão, isso tem de aparecer aqui — antes
            # de alguém carregar em "enviar" às cegas.
            qr = pending_send.get("quality_report") or {}
            if qr.get("status") and qr["status"] != "ok":
                problems = "; ".join(c["label"] for c in qr.get("checks", []) if c["status"] != "ok")
                out.append({"id": f"{n['id']}-quality", "note_id": n["id"], "kind": "quote_quality_issue",
                            "severity": "high" if qr["status"] == "error" else "medium",
                            "title": f"{cust} · confirmar orçamento antes de enviar",
                            "message": f"Problemas na leitura do PDF do fornecedor: {problems}.", "days": days})
            diff = pending_send.get("diff_since_previous")
            if diff and diff.get("has_changes"):
                out.append({"id": f"{n['id']}-quotediff", "note_id": n["id"], "kind": "quote_changed",
                            "severity": "medium", "title": f"{cust} · orçamento do fornecedor mudou",
                            "message": diff_summary_text(diff), "days": days})
        reply = unseen_client_replies.get(n["id"])
        if reply:
            out.append({"id": f"{n['id']}-reply", "note_id": n["id"], "kind": "client_reply", "severity": "high",
                        "title": f"{cust} · o cliente respondeu",
                        "message": f"«{reply.get('subject') or '(sem assunto)'}» — associado automaticamente ao pedido.",
                        "days": days})
        for side, who in (("client", "cliente"), ("supplier", "fornecedor")):
            attempts = n.get(f"{side}_no_answer_count", 0) or 0
            if attempts and callback_due(n, now, side):
                out.append({"id": f"{n['id']}-cb-{side}", "note_id": n["id"], "kind": f"callback_{side}",
                            "severity": "high" if attempts >= 3 else "medium",
                            "title": f"{cust} · voltar a ligar ao {who}",
                            "message": f"{attempts} tentativa(s) sem resposta. Volte a tentar ou use outro contacto.",
                            "days": days})
    tasks = await db.tasks.find({"done": {"$ne": True}}, {"_id": 0}).to_list(5000)
    for t in tasks:
        dd = parse_dt(t.get("due_date"))
        if dd and now.date() > dd.date():
            out.append({"id": f"task-{t['id']}", "note_id": t.get("note_id") or None, "kind": "reminder_overdue",
                        "severity": "high", "title": "Lembrete em atraso", "message": t.get("title", ""),
                        "days": (now.date() - dd.date()).days})
    sev = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda x: (sev.get(x["severity"], 3), -x.get("days", 0)))
    return out


@api_router.get("/notifications")
async def notifications():
    items = await build_notifications()
    return {"items": items[:50], "count": len(items)}


@api_router.get("/today")
async def today(segment: Optional[str] = None):
    now = datetime.now(timezone.utc)
    seg = await segment_clause(segment)

    def with_seg(q):
        return {"$and": [q, seg]} if seg else q

    items = await build_notifications()
    inbox = await db.notes.find(with_seg({"status": "novo", "archived": {"$ne": True}}), {"_id": 0}).sort("created_at", -1).to_list(50)
    inbox = [enrich_note(d, now) for d in inbox]
    open_docs = await db.notes.find(
        with_seg({"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}}), {"_id": 0}).to_list(5000)
    open_docs = [enrich_note(d, now) for d in open_docs]
    if seg:
        # Alertas restritos à área ativa. Lembretes soltos (sem pedido
        # associado) ficam na área geral da loja.
        allowed_ids = {d["id"] for d in open_docs}
        items = [it for it in items
                 if (it.get("note_id") in allowed_ids) or (not it.get("note_id") and segment == "geral")]
    waiting_me = [d for d in open_docs if d["waiting_on"] == "me"]
    waiting_supplier = [d for d in open_docs if d["waiting_on"] == "supplier"]
    waiting_client = [d for d in open_docs if d["waiting_on"] == "client"]
    waiting_me.sort(key=lambda d: (0 if d["is_overdue"] else 1, PRIORITY_RANK.get(d.get("priority"), 2),
                                   d.get("status_updated_at") or d.get("created_at")))
    long_waiting_clients = sorted(
        [d for d in waiting_client if (d.get("days_since_client") or 0) >= 2],
        key=lambda d: -(d.get("days_since_client") or 0))
    reminder_due = [d for d in waiting_supplier if d.get("reminder_due")]
    follow_up_calls = sorted(
        [d for d in open_docs if d.get("needs_callback")],
        key=lambda d: -max(d.get("client_no_answer_count", 0), d.get("supplier_no_answer_count", 0)))
    # Orçamentos com email+PDF preparados automaticamente — só falta confirmar.
    to_confirm = sorted(
        [d for d in open_docs if d.get("pending_client_send")],
        key=lambda d: (d.get("pending_client_send") or {}).get("created_at") or "", reverse=True)
    st = await stats()
    summary = st["daily"]
    if seg:
        # Resumo do dia calculado só com os pedidos da área ativa.
        today_d = now.date()
        all_docs = await db.notes.find(
            with_seg({}), {"_id": 0, "status": 1, "created_at": 1, "status_updated_at": 1}).to_list(10000)
        novos_hoje = concluidos_hoje = 0
        for d in all_docs:
            created = parse_dt(d.get("created_at"))
            if created and created.date() == today_d:
                novos_hoje += 1
            if d.get("status") == "concluido":
                done = parse_dt(d.get("status_updated_at"))
                if done and done.date() == today_d:
                    concluidos_hoje += 1
        summary = {"novo": sum(1 for d in open_docs if d.get("status") == "novo"),
                   "pendentes": len(open_docs),
                   "atrasados": sum(1 for d in open_docs if d.get("is_overdue")),
                   "novos_hoje": novos_hoje, "concluidos_hoje": concluidos_hoje}
    return {"attention": items[:20], "attention_count": len(items), "inbox": inbox,
            "waiting_me": waiting_me[:60], "waiting_supplier": waiting_supplier[:60],
            "waiting_client": waiting_client[:60], "long_waiting_clients": long_waiting_clients,
            "reminder_due": reminder_due, "follow_up_calls": follow_up_calls[:20],
            "to_confirm": to_confirm[:20], "counts": {
                "waiting_me": len(waiting_me), "waiting_supplier": len(waiting_supplier),
                "waiting_client": len(waiting_client), "reminder_due": len(reminder_due),
                "follow_up": len(follow_up_calls), "to_confirm": len(to_confirm)},
            "summary": summary, "potential_value": st["potential_value"]}


SEVERITY_RANK = {"error": 2, "warning": 1, "info": 0}


@api_router.get("/notes/needs-review")
async def notes_needs_review():
    """Centro de Exceções + Centro de Decisões: reúne, numa lista só, todos
    os pedidos cujo orçamento do fornecedor precisa de atenção humana —
    leitura do PDF incompleta (quality_report), artigos alterados desde a
    última versão, ou já pronto para o cliente mas ainda por confirmar o
    envio. Ao contrário de percorrer a lista toda de pedidos à procura de
    problemas, só aparece aqui quem realmente precisa de uma decisão."""
    notes = await db.notes.find(
        {"archived": {"$ne": True}, "supplier_quote": {"$exists": True, "$ne": None}},
        {"_id": 0}).to_list(2000)
    now = datetime.now(timezone.utc)
    out = []
    for n in notes:
        sq = n.get("supplier_quote") or {}
        qr = sq.get("quality_report") or {}
        diff = sq.get("diff_since_previous") or {}
        reasons = []
        if qr.get("status") and qr["status"] != "ok":
            reasons.append({"kind": "quality", "severity": qr["status"],
                            "label": "Problemas na leitura do PDF do fornecedor"})
        if diff.get("has_changes"):
            reasons.append({"kind": "changed", "severity": "warning",
                            "label": "Orçamento alterado desde a última versão"})
        if n.get("pending_client_send"):
            reasons.append({"kind": "pending_send", "severity": "info",
                            "label": "Pronto a enviar — falta confirmar"})
        if not reasons:
            continue
        en = enrich_note(dict(n), now)
        out.append({
            "id": en["id"], "customer_name": en.get("customer_name") or "Cliente",
            "quote_number": sq.get("quote_number"), "confidence_score": sq.get("confidence_score"),
            "waiting_days": en.get("waiting_days"), "reasons": reasons,
            "severity_rank": max((SEVERITY_RANK.get(r["severity"], 0) for r in reasons), default=0)})
    out.sort(key=lambda d: (-d["severity_rank"], -(d.get("waiting_days") or 0)))
    return {"items": out, "count": len(out)}


# ---------- Assistant endpoints (preflight, history, learning, batches) ----------
@api_router.get("/notes/{note_id}/preflight")
async def note_preflight(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    pt = detect_product_type(n)
    checklist = PRODUCT_TYPES.get(pt, {}).get(
        "checklist", ["Descrição do artigo", "Quantidade", "Medidas", "Referência"])
    # Só bloqueia campos realmente relevantes ao tipo de produto. Medidas e cor
    # deixaram de ser campos do pedido de loja (produtos com medidas seguem o
    # fluxo de caixilharia à medida), pelo que nunca são exigidos aqui —
    # detalhes desse género vão na descrição ou nas notas.
    requirements = {
        "janela": [("quantity", "Quantidade")],
        "porta": [("quantity", "Quantidade")],
        "rede": [("quantity", "Quantidade")],
        "madeira": [("quantity", "Quantidade")],
        "sanitario": [("reference", "Referência / modelo"), ("quantity", "Quantidade")],
        "tinta": [("quantity", "Litros / quantidade")],
        "jardim_prod": [("quantity", "Quantidade")],
    }
    missing = [label for field, label in requirements.get(pt, [("quantity", "Quantidade")])
               if not str(n.get(field) or "").strip()]
    warns = measurement_warnings(n)
    if n.get("caixilharia"):
        spec = normalize_caixilharia_spec(n["caixilharia"])
        lines = spec.get("linhas") or []
        missing = [] if lines else ["Elementos de caixilharia"]
        warns = []
        for index, line in enumerate(lines, 1):
            if not line.get("opcoes"):
                missing.append(f"Opção de fabrico no elemento {index}")
            if line.get("produto") in {"janela", "porta", "portada"}:
                if not line.get("tipo_abertura"):
                    missing.append(f"Tipo de abertura no elemento {index}")
                if not line.get("numero_folhas"):
                    missing.append(f"Número de folhas no elemento {index}")
            for dimension in (line.get("largura_mm", 0), line.get("altura_mm", 0)):
                if dimension > 6000:
                    warns.append(f"Elemento {index}: medida invulgar de {dimension} mm — confirme o valor.")
        checklist = [
            "Produto por elemento", "Quantidade, largura e altura por elemento",
            "Tipo de abertura e número de folhas", "Uma ou mais opções de material / modelo",
            "Tipo e composição do vidro", "Cor, quadrícula e acessórios por opção",
            "Confirmar que a classificação técnica se aplica à configuração", CAIXILHARIA_AVISO,
        ]
    return {"product_type": pt, "product_label": PRODUCT_TYPES.get(pt, {}).get("label"),
            "checklist": checklist, "missing": missing, "warnings": warns,
            "ready": len(missing) == 0 and len(warns) == 0}


@api_router.get("/notes/{note_id}/client-history")
async def note_client_history(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    ors = []
    if (n.get("phone") or "").strip():
        ors.append({"phone": n["phone"].strip()})
    if (n.get("customer_name") or "").strip():
        ors.append({"customer_name": {"$regex": re.escape(n["customer_name"].strip()), "$options": "i"}})
    past = []
    if ors:
        raw = await db.notes.find({"id": {"$ne": note_id}, "$or": ors}, {"_id": 0}).sort("created_at", -1).to_list(50)
        past = [enrich_note(p) for p in raw]
    ids = [note_id] + [p["id"] for p in past]
    acts = await db.activities.find({"note_id": {"$in": ids}, "type": "email_sent"}, {"_id": 0}).to_list(500)
    suppliers_used = list({(a.get("meta") or {}).get("supplier_name") for a in acts if (a.get("meta") or {}).get("supplier_name")})
    reusable = []
    for p in past:
        sim = max(token_similarity(p.get("description"), n.get("description")),
                  ref_similarity(p.get("reference"), n.get("reference")))
        if sim >= 0.4:
            qs = await db.quotes.find({"note_id": p["id"]}, {"_id": 0}).sort("price", 1).to_list(20)
            for qd in qs:
                qd["from_customer"] = p.get("customer_name")
                qd["from_note_id"] = p["id"]
                qd["similarity"] = round(sim, 2)
                reusable.append(qd)
    reusable.sort(key=lambda x: (-x["similarity"], x.get("price", 0)))
    return {"past_notes": past, "past_count": len(past),
            "suppliers_used": suppliers_used, "reusable_quotes": reusable[:10]}


@api_router.get("/notes/{note_id}/alternatives")
async def note_alternatives(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    reqs = await db.quote_requests.find({"note_id": note_id}, {"_id": 0}).to_list(200)
    contacted = {r.get("supplier_id") for r in reqs}
    reminder_count = n.get("reminder_count", 0) or 0
    no_answer_count = n.get("supplier_no_answer_count", 0) or 0
    has_quote = await db.quotes.count_documents({"note_id": note_id})
    # Sugere alternativas quando o fornecedor não responde nem por email
    # (2+ lembretes) nem por telefone (2+ chamadas falhadas).
    suggest = (reminder_count >= 2 or no_answer_count >= 2) and has_quote == 0
    _, _, per_sup_avg, _ = await compute_response()
    sups = await db.suppliers.find({}, {"_id": 0}).to_list(2000)
    alts = [s for s in sups if s["id"] not in contacted]
    same = [s for s in alts if s.get("category") == n.get("category")] or alts
    same = sorted(same, key=lambda s: (0 if s.get("email") else 1, per_sup_avg.get(s.get("name"), 9999)))
    for s in same:
        s["avg_hours"] = per_sup_avg.get(s.get("name"))
    return {"suggest_alternatives": suggest, "reminder_count": reminder_count,
            "no_answer_count": no_answer_count,
            "has_quote": bool(has_quote), "alternatives": same[:5]}


@api_router.get("/notes/{note_id}/smart-suggestions")
async def note_smart_suggestions(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    profile = await learning_profile()
    cat = n.get("category")
    pt = detect_product_type(n)
    by_pt = profile["by_product_type"].get(pt) if pt else None
    by_cat = profile["by_category"].get(cat)
    top = by_pt or by_cat
    sup_doc = None
    reason = ""
    confidence = 0.0
    if top:
        best = top[0]
        confidence = round(min(0.95, 0.5 + 0.1 * best["count"]), 2)
        label = PRODUCT_TYPES.get(pt, {}).get("label") or (cat or "este tipo de pedido")
        reason = f"Costuma enviar para {best['name']} em {label} ({best['count']}x)"
        sup_doc = await db.suppliers.find_one({"name": best["name"]}, {"_id": 0})
    return {"suggested_supplier": sup_doc, "supplier_reason": reason, "confidence": confidence,
            "suggested_reminder_days": profile["avg_reminder_days"] or 3,
            "suggested_sla_days": profile["common_sla"] or DEFAULT_SLA_DAYS,
            "learned": bool(top)}


@api_router.get("/notes/{note_id}/duplicates")
async def note_duplicates(note_id: str):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    others = await db.notes.find({"id": {"$ne": note_id}, "archived": {"$ne": True}}, {"_id": 0}).to_list(2000)
    matches = []
    for o in others:
        score = 0.0
        reasons = []
        if (n.get("phone") or "").strip() and o.get("phone") == n.get("phone"):
            score += 0.5
            reasons.append("mesmo telefone")
        dsim = token_similarity(o.get("description"), n.get("description"))
        if dsim >= 0.5:
            score += 0.4
            reasons.append("descrição semelhante")
        if (n.get("reference") or "").strip():
            rsim = ref_similarity(o.get("reference"), n.get("reference"))
            if rsim >= 0.8:
                score += 0.3
                reasons.append("referência semelhante")
        if score >= 0.5:
            eo = enrich_note(o)
            eo["match_score"] = round(min(score, 1.0), 2)
            eo["match_reasons"] = reasons
            matches.append(eo)
    matches.sort(key=lambda x: -x["match_score"])
    return {"matches": matches[:5]}


@api_router.get("/notes/{note_id}/quote-template")
async def note_quote_template(note_id: str, supplier_id: Optional[str] = None, is_reminder: bool = False):
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    sup = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0}) if supplier_id else None
    if n.get("caixilharia"):
        subject, body = caixilharia_email(n, n["caixilharia"], is_reminder)
        return {"subject": subject, "body": body,
                "supplier": sup, "to": sup.get("email") if sup else ""}
    template = supplier_quote_template(n, is_reminder=is_reminder)
    return {**template, "supplier": sup, "to": sup.get("email") if sup else ""}


@api_router.get("/notes/{note_id}/client-template")
async def note_client_template(note_id: str):
    """Prepara a resposta habitual ao cliente; não envia nem altera o pedido."""
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    template = client_quote_template(n)
    return {**template, "to": (n.get("email") or "").strip(), "has_email": bool((n.get("email") or "").strip())}


@api_router.get("/batches")
async def supplier_batches():
    now = datetime.now(timezone.utc)
    notes = await db.notes.find(
        {"archived": {"$ne": True}, "status": {"$in": ["novo", "pendente", "em_preparacao"]}}, {"_id": 0}).to_list(2000)
    profile = await learning_profile()
    groups = {}
    for n in notes:
        sid = n.get("supplier_id")
        if not sid:
            pt = detect_product_type(n)
            cat = n.get("category")
            top = (profile["by_product_type"].get(pt) if pt else None) or profile["by_category"].get(cat) or []
            if top:
                sd = await db.suppliers.find_one({"name": top[0]["name"]}, {"_id": 0})
                sid = sd["id"] if sd else None
        if sid:
            groups.setdefault(sid, []).append(enrich_note(n, now))
    out = []
    for sid, ns in groups.items():
        if len(ns) >= 2:
            sd = await db.suppliers.find_one({"id": sid}, {"_id": 0})
            out.append({"supplier": sd, "notes": ns, "count": len(ns)})
    out.sort(key=lambda x: -x["count"])
    return {"batches": out}


@api_router.get("/learning/profile")
async def learning_profile_endpoint():
    p = await learning_profile()
    habits = []
    for pt, ranked in p["by_product_type"].items():
        if pt and ranked:
            label = PRODUCT_TYPES.get(pt, {}).get("label", pt)
            habits.append(f"Para {label}, costuma usar {ranked[0]['name']}.")
    for cat, ranked in p["by_category"].items():
        if cat and ranked and not any(cat in h for h in habits):
            habits.append(f"Na secção {cat}, o fornecedor mais usado é {ranked[0]['name']}.")
    if p["avg_reminder_days"]:
        habits.append(f"Costuma enviar lembretes ao fim de ~{p['avg_reminder_days']} dia(s).")
    return {**p, "habits": habits}


@api_router.post("/maintenance/auto-close")
async def maintenance_auto_close():
    n = await auto_close_inactive()
    return {"closed": n, "months": AUTO_CLOSE_MONTHS}


# ---------- Stats ----------
@api_router.get("/stats")
async def stats():
    now = datetime.now(timezone.utc)
    notes = await db.notes.find({}, {"_id": 0}).to_list(5000)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(5000)
    suppliers_count = await db.suppliers.count_documents({})
    quotes = await db.quotes.find({}, {"_id": 0}).to_list(20000)
    qby = {}
    for qd in quotes:
        qby.setdefault(qd["note_id"], []).append(qd)

    by_category = {c: 0 for c in VALID_CATEGORIES}
    by_status = {s: 0 for s in STATUSES}
    by_priority = {p: 0 for p in PRIORITIES}
    open_notes = pending_supplier = overdue = concluded = potential = 0
    new_today = concluded_today = 0
    today_d = now.date()
    for n in notes:
        stt = n.get("status", "novo")
        by_status[stt] = by_status.get(stt, 0) + 1
        by_priority[n.get("priority", "media")] = by_priority.get(n.get("priority", "media"), 0) + 1
        if n.get("category") in by_category:
            by_category[n["category"]] += 1
        cd = parse_dt(n.get("created_at"))
        if cd and cd.date() == today_d:
            new_today += 1
        if stt == "concluido":
            concluded += 1
            sd = parse_dt(n.get("status_updated_at"))
            if sd and sd.date() == today_d:
                concluded_today += 1
        if stt not in CLOSED_STATUSES:
            open_notes += 1
            qs = qby.get(n["id"], [])
            if qs:
                appr = [x for x in qs if x.get("approved")]
                prices = [x["price"] for x in qs if x.get("price")]
                if appr and appr[0].get("price"):
                    potential += appr[0]["price"]
                elif prices:
                    potential += min(prices)
        if stt in WAITING_SUPPLIER:
            pending_supplier += 1
        if enrich_note(dict(n), now)["is_overdue"]:
            overdue += 1

    avg_response, fastest, _, sent = await compute_response()
    # avg hours to send (created -> first email_sent)
    to_send = []
    note_created = {n["id"]: parse_dt(n.get("created_at")) for n in notes}
    for nid, s in sent.items():
        c = note_created.get(nid)
        if c and s >= c:
            to_send.append((s - c).total_seconds() / 3600)
    avg_to_send = round(sum(to_send) / len(to_send), 1) if to_send else None
    total = len(notes)
    completion_rate = round(concluded / total * 100) if total else 0

    return {
        "total_notes": total, "open_notes": open_notes, "pending_supplier": pending_supplier, "overdue": overdue,
        "by_category": by_category, "by_status": by_status, "by_priority": by_priority,
        "tasks_pending": sum(1 for t in tasks if not t.get("done")), "suppliers": suppliers_count,
        "avg_response_hours": avg_response, "avg_hours_to_send": avg_to_send, "fastest_suppliers": fastest,
        "potential_value": round(potential, 2), "completion_rate": completion_rate, "concluded": concluded,
        "daily": {"novo": by_status.get("novo", 0), "pendentes": open_notes, "atrasados": overdue,
                  "novos_hoje": new_today, "concluidos_hoje": concluded_today},
    }


# ---------- AI (OpenAI Chat Models via emergentintegrations) ----------
class ParseEmailIn(BaseModel):
    text: str = ""


class ReplyIn(BaseModel):
    text: str = ""


def ai_available():
    return bool(OPENAI_API_KEY)


async def ai_complete(system, prompt, session="brico"):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=OPENAI_API_KEY, session_id=session, system_message=system).with_model("openai", AI_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    return resp if isinstance(resp, str) else str(resp)


def extract_json(text):
    if not text:
        return None
    t = text.strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    m = re.search(r"\{.*\}", t, re.DOTALL)
    if m:
        t = m.group(0)
    try:
        return _json.loads(t)
    except Exception:
        return None


async def _classify_email(subject, body):
    """Classifica um email recebido por IA — prioridade, categoria e resumo
    de uma linha, mostrados na caixa de entrada sem precisar abrir o email.
    Best-effort: sem IA configurada (ou se a chamada falhar), a caixa
    continua a funcionar normalmente com os valores por omissão."""
    default = {"priority": "normal", "priority_rank": EMAIL_PRIORITY_RANK["normal"], "category": "", "ai_summary": ""}
    if not ai_available():
        return default
    system = ("Classificas emails recebidos por uma loja Bricomarché em Portugal (de fornecedores e "
              "clientes). Respondes SEMPRE apenas com JSON válido, sem texto extra.")
    prompt = (
        "Classifica este email. Responde APENAS com JSON com as chaves:\n"
        '{"priority": "alta"|"normal"|"baixa", "category": "orcamento"|"reclamacao"|"duvida"|"urgente"|"outro", '
        '"summary": "resumo em português, máx. 15 palavras"}\n'
        '- priority "alta": reclamação, urgência, cliente a desistir, prazo a expirar.\n'
        '- priority "baixa": newsletters, confirmações automáticas, sem ação necessária.\n\n'
        f"Assunto: {subject or '(sem assunto)'}\n\nCorpo:\n\"\"\"{(body or '')[:3000]}\"\"\""
    )
    try:
        raw = await ai_complete(system, prompt, session=f"classify-email-{uuid.uuid4()}")
    except Exception as e:
        logger.error(f"AI classify-email falhou: {e}")
        return default
    data = extract_json(raw) or {}
    priority = data.get("priority") if data.get("priority") in EMAIL_PRIORITIES else "normal"
    category = data.get("category") if data.get("category") in EMAIL_CATEGORIES else ""
    summary = (data.get("summary") or "").strip()[:200]
    return {"priority": priority, "priority_rank": EMAIL_PRIORITY_RANK[priority], "category": category, "ai_summary": summary}


def _rule_condition_matches(cond, fields):
    value = (fields.get(cond.get("field")) or "").lower()
    target = (cond.get("value") or "").lower().strip()
    if not target:
        return False
    if cond.get("op") == "equals":
        return value == target
    return target in value


async def _apply_rules(subject, body, from_email, category):
    """Aplica as regras automáticas (definidas pelo utilizador em
    /email-rules) a um email recebido, logo após a classificação por IA.
    Cada regra corresponde se TODAS as suas condições corresponderem."""
    result = {"priority_override": None}
    fields = {"subject": subject or "", "body": body or "", "from_email": from_email or "", "category": category or ""}
    rules = await db.email_rules.find({"enabled": True}, {"_id": 0}).to_list(200)
    for rule in rules:
        conditions = rule.get("conditions") or []
        if not conditions or not all(_rule_condition_matches(c, fields) for c in conditions):
            continue
        for action in (rule.get("actions") or []):
            if action.get("type") == "priority" and action.get("value") in EMAIL_PRIORITIES:
                result["priority_override"] = action["value"]
    return result


@api_router.get("/ai/status")
async def ai_status():
    return {"available": ai_available(), "model": AI_MODEL}


@api_router.post("/ai/parse-client-email")
async def ai_parse_client_email(payload: ParseEmailIn):
    if not ai_available():
        raise HTTPException(status_code=400, detail="Integração OpenAI não configurada.")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio.")
    system = ("És o assistente de uma loja Bricomarché em Portugal. Extrais dados de mensagens/emails de "
              "clientes para criar um pedido de orçamento. Respondes SEMPRE apenas com JSON válido, sem texto extra.")
    prompt = (
        "Do texto seguinte, extrai um pedido de orçamento. Responde APENAS com JSON com as chaves: "
        "customer_name, phone, email, description, measurements, quantity, color, reference, category.\n"
        "- category deve ser um de: construcao, bricolage, decoracao, jardim (a mais adequada; se dúvida, construcao).\n"
        "- description: resumo curto e claro do artigo pedido.\n"
        "- Se um campo não existir no texto, usa \"\".\n\n"
        f"Texto:\n\"\"\"{payload.text}\"\"\""
    )
    try:
        raw = await ai_complete(system, prompt, session="parse-email")
    except Exception as e:
        logger.error(f"AI parse-client-email falhou: {e}")
        raise HTTPException(status_code=502, detail="Falha na chamada à OpenAI. Verifique a chave e o saldo.")
    data = extract_json(raw) or {}
    allowed = ["customer_name", "phone", "email", "description", "measurements", "quantity", "color", "reference", "category"]
    out = {k: (str(data.get(k)) if data.get(k) is not None else "") for k in allowed}
    if out["category"] not in VALID_CATEGORIES:
        out["category"] = "construcao"
    return {"parsed": out}


@api_router.post("/notes/{note_id}/ai-summary")
async def ai_note_summary(note_id: str):
    if not ai_available():
        raise HTTPException(status_code=400, detail="Integração OpenAI não configurada.")
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    quotes = await db.quotes.find({"note_id": note_id}, {"_id": 0}).sort("price", 1).to_list(50)
    q_txt = "; ".join([f"{q.get('supplier_name')}: {q.get('price')}€" for q in quotes]) or "nenhum"
    en = enrich_note(dict(n))
    ctx = (
        f"Cliente: {n.get('customer_name') or '—'}\n"
        f"Contacto: {n.get('phone') or ''} {n.get('email') or ''}\n"
        f"Artigo: {n.get('description') or '—'}\n"
        f"Referência: {n.get('reference') or '—'}\n"
        f"Medidas: {n.get('measurements') or '—'}; Quantidade: {n.get('quantity') or '—'}; Cor: {n.get('color') or '—'}\n"
        f"Notas: {n.get('details') or '—'}\n"
        f"Estado: {en.get('status_label')}; Próxima ação: {en.get('next_action')}\n"
        f"Orçamentos recebidos: {q_txt}\n"
    )
    system = "És o assistente de uma loja Bricomarché. Escreves resumos claros e curtos em português de Portugal, sem markdown."
    prompt = ("Resume este pedido em 2-3 frases claras: o que é, para que cliente, o estado atual e o próximo passo. "
              "Sem listas nem markdown.\n\n" + ctx)
    try:
        txt = (await ai_complete(system, prompt, session=f"summary-{note_id}")).strip()
    except Exception as e:
        logger.error(f"AI summary falhou: {e}")
        raise HTTPException(status_code=502, detail="Falha na chamada à OpenAI. Verifique a chave e o saldo.")
    await db.notes.update_one({"id": note_id}, {"$set": {"ai_summary": txt, "ai_summary_at": now_iso()}})
    return {"summary": txt}


@api_router.post("/notes/{note_id}/analyze-reply")
async def ai_analyze_reply(note_id: str, payload: ReplyIn):
    if not ai_available():
        raise HTTPException(status_code=400, detail="Integração OpenAI não configurada.")
    n = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Cole a resposta do fornecedor.")
    system = ("Analisas respostas de fornecedores a pedidos de orçamento de uma loja Bricomarché. "
              "Respondes SEMPRE apenas com JSON válido, sem texto extra.")
    prompt = (
        f"O pedido pediu orçamento para: {n.get('description') or '—'} "
        f"(referência: {n.get('reference') or '—'}, medidas: {n.get('measurements') or '—'}, "
        f"quantidade: {n.get('quantity') or '—'}).\n\n"
        "Analisa a resposta do fornecedor e responde APENAS com JSON com as chaves:\n"
        '{"complete": true/false, "missing": ["preço"|"prazo"|"referência"|"disponibilidade"...], '
        '"price": number|null, "currency": "EUR", "deadline": "texto"|"", "reference": ""|"texto", '
        '"summary": "resumo curto em português"}\n'
        "Considera INCOMPLETA se faltar o preço ou o prazo de entrega.\n\n"
        f"Resposta do fornecedor:\n\"\"\"{payload.text}\"\"\""
    )
    try:
        raw = await ai_complete(system, prompt, session=f"reply-{note_id}")
    except Exception as e:
        logger.error(f"AI analyze-reply falhou: {e}")
        raise HTTPException(status_code=502, detail="Falha na chamada à OpenAI. Verifique a chave e o saldo.")
    data = extract_json(raw) or {}
    analysis = {
        "complete": bool(data.get("complete")),
        "missing": data.get("missing") or [],
        "price": data.get("price"),
        "currency": data.get("currency") or "EUR",
        "deadline": data.get("deadline") or "",
        "reference": data.get("reference") or "",
        "summary": data.get("summary") or "",
    }
    return {"analysis": analysis}



@api_router.get("/")
async def root():
    return {"message": "Brico Assistente - API"}


# ---------- Migration / Seed ----------
async def migrate():
    mapping = {"aberto": "novo", "preco_pedido": "enviado_fornecedor", "preco_recebido": "orcamento_recebido"}
    for old, new in mapping.items():
        await db.notes.update_many({"status": old}, {"$set": {"status": new}})
    defaults = {"priority": "media", "labels": [], "created_by": AUTHOR, "sla_days": DEFAULT_SLA_DAYS,
                "supplier_id": "", "email": "", "reference": "", "archived": False,
                "last_supplier_sent_at": "", "last_client_contact_at": "",
                "quantity": "", "color": "", "reminder_interval_days": 3,
                "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
                "client_no_answer_count": 0, "supplier_no_answer_count": 0,
                "last_client_attempt_at": "", "last_supplier_attempt_at": "", "last_client_reply_at": ""}
    for k, v in defaults.items():
        await db.notes.update_many({k: {"$exists": False}}, {"$set": {k: v}})
    await db.notes.update_many({"status": {"$in": list(ARCHIVE_STATUSES)}, "archived": {"$ne": True}}, {"$set": {"archived": True}})
    try:
        await db.notes.update_many({"status_updated_at": {"$exists": False}}, [{"$set": {"status_updated_at": "$updated_at"}}])
    except Exception:
        pass
    await _normalize_existing_phones()
    # Antes de guardar TODA a caixa de entrada, só os emails associados a um
    # pedido/fornecedor eram guardados — logo todos os registos antigos sem o
    # campo "matched" eram, por definição, associados.
    await db.received_emails.update_many({"matched": {"$exists": False}}, {"$set": {"matched": True}})
    # reply_kind é novo: os registos antigos só podiam ser respostas de
    # fornecedor (o matching do lado do cliente não existia ainda).
    await db.received_emails.update_many(
        {"reply_kind": {"$exists": False}, "supplier_id": {"$ne": ""}}, {"$set": {"reply_kind": "supplier"}})
    await db.received_emails.update_many(
        {"reply_kind": {"$exists": False}}, {"$set": {"reply_kind": ""}})
    # Classificação por IA (prioridade/categoria/resumo) é nova — registos
    # antigos ficam com prioridade "normal" em vez de ficarem de fora da
    # ordenação por prioridade.
    await db.received_emails.update_many(
        {"priority_rank": {"$exists": False}},
        {"$set": {"priority": "normal", "priority_rank": EMAIL_PRIORITY_RANK["normal"], "category": "", "ai_summary": ""}})
    # Arquivar/etiquetar é novo — registos antigos ficam visíveis (não
    # arquivados) e sem etiquetas.
    await db.received_emails.update_many(
        {"archived": {"$exists": False}}, {"$set": {"archived": False}})
    await db.received_emails.update_many(
        {"labels": {"$exists": False}}, {"$set": {"labels": []}})


async def _normalize_existing_phones():
    """Uniformiza telefones já guardados (ex.: '912 345 678' -> '912345678') para
    que a deteção de duplicados e o histórico de clientes continuem a funcionar
    com dados antigos, guardados antes da normalização existir."""
    async for n in db.notes.find({"phone": {"$exists": True, "$ne": ""}}, {"_id": 0, "id": 1, "phone": 1}):
        norm = normalize_phone_loose(n["phone"])
        if norm and norm != n["phone"]:
            await db.notes.update_one({"id": n["id"]}, {"$set": {"phone": norm}})
    async for s in db.suppliers.find({"phone": {"$exists": True, "$ne": ""}}, {"_id": 0, "id": 1, "phone": 1}):
        norm = normalize_phone_loose(s["phone"])
        if norm and norm != s["phone"]:
            await db.suppliers.update_one({"id": s["id"]}, {"$set": {"phone": norm}})


async def seed_notas_telemovel():
    """Importa uma vez os pedidos anotados na app de notas do telemóvel
    (jul/2026). O marcador em db.migrations garante que nunca duplica,
    mesmo com vários restarts."""
    marker_id = "seed_notas_telemovel_2026_07"
    if await db.migrations.find_one({"id": marker_id}):
        return

    pedidos = [
        {"customer_name": "Teresa Mera", "phone": "+351917100512",
         "description": "Preço tijolos, articimentos, bancadas", "category": "jardim"},
        {"customer_name": "Patrícia", "phone": "+351964572010",
         "description": "Ventoinha industrial com depósito, tipo mercado municipal", "category": "bricolage"},
        {"customer_name": "Eduardo", "phone": "+351911997858",
         "description": "Janela sótão — abrir para dentro, direita", "category": "construcao",
         "measurements": "Trapezoidal: base 95 cm · topo inclinado 99 cm · lados 66 cm e 38 cm"},
        {"customer_name": "Rui Catalana", "phone": "+351964136143",
         "description": "Janela de correr alumínio sem corte térmico — 2000x1000, 2000x2000 c/trinco "
                        "e 2000x1000 abrir esquerda; persiana 2000x2000 tipo loja, de cima para baixo",
         "category": "construcao"},
        {"customer_name": "João Caliço Martins", "phone": "+351934973199",
         "description": "Rede mosquiteira de fole", "category": "jardim",
         "measurements": "2000 x 920 mm"},
        {"customer_name": "Joana", "phone": "+351969152218",
         "description": "Pinho: 190x60x2.8 — mdf branco 190x39x1.8+", "category": "construcao"},
        {"customer_name": "Vítor Queiroz", "phone": "+351966149645",
         "description": "Toldo modelo Braga 3x5 com motor", "category": "jardim"},
    ]
    base = {"email": "", "details": "", "measurements": "", "quantity": "", "color": "",
            "reference": "", "status": "novo", "priority": "media", "labels": [],
            "supplier_id": "", "sla_days": DEFAULT_SLA_DAYS, "reminder_interval_days": 3,
            "created_by": AUTHOR, "archived": False,
            "last_supplier_sent_at": "", "last_client_contact_at": "",
            "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
            "client_no_answer_count": 0, "supplier_no_answer_count": 0,
            "last_client_attempt_at": "", "last_supplier_attempt_at": ""}
    for p in pedidos:
        doc = {**base, **p, "id": str(uuid.uuid4()),
               "created_at": now_iso(), "updated_at": now_iso(), "status_updated_at": now_iso()}
        await db.notes.insert_one(dict(doc))
        await log_activity(doc["id"], "created", f"Pedido criado para {doc['customer_name']}")

    # Sem nome nem telefone de cliente → tarefa de loja, não pedido.
    await db.tasks.insert_one({
        "id": str(uuid.uuid4()), "title": "Trocar preços ripados deli home inativos",
        "category": "construcao", "done": False, "priority": "media", "due_date": "",
        "repeat": "none", "subtasks": [], "note_id": "", "created_at": now_iso()})

    await db.migrations.insert_one({"id": marker_id, "applied_at": now_iso()})
    logger.info("Seed de notas do telemóvel aplicado: 7 pedidos + 1 tarefa.")


async def seed_pedidos_whatsapp():
    """Importa uma vez os pedidos anotados no telemóvel/WhatsApp (20 jul 2026).
    O marcador em db.migrations garante que nunca duplica, mesmo com vários
    restarts ou redeploys."""
    marker_id = "seed_pedidos_whatsapp_2026_07_20"
    if await db.migrations.find_one({"id": marker_id}):
        return

    pedidos = [
        {"customer_name": "André", "phone": "+351932065397",
         "description": "Canalização móvel Blake 80, furar tampo e ligação à água e montagem",
         "category": "construcao"},
        {"customer_name": "Carla Anico",
         "description": "Chapa espelho Recuperador de calor Elio 700",
         "category": "construcao"},
        {"customer_name": "João Santos e Encarnação Santos", "phone": "+351916379056",
         "description": "Móvel à medida conforme desenho do cliente",
         "details": "Ver desenho com as dimensões (foto no grupo Faro // Cozinhas do WhatsApp) "
                    "— confirmar as medidas antes de orçamentar. Pedido à parte do acompanhamento "
                    "de casas de banho que o Pedro já tem com estes clientes (orçamento O0707264).",
         "category": "construcao"},
    ]
    base = {"phone": "", "email": "", "details": "", "measurements": "", "quantity": "", "color": "",
            "reference": "", "status": "novo", "priority": "media", "labels": [],
            "supplier_id": "", "sla_days": DEFAULT_SLA_DAYS, "reminder_interval_days": 3,
            "created_by": AUTHOR, "archived": False,
            "last_supplier_sent_at": "", "last_client_contact_at": "", "last_client_reply_at": "",
            "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
            "client_no_answer_count": 0, "supplier_no_answer_count": 0,
            "last_client_attempt_at": "", "last_supplier_attempt_at": ""}
    for p in pedidos:
        doc = {**base, **p, "id": str(uuid.uuid4()),
               "created_at": now_iso(), "updated_at": now_iso(), "status_updated_at": now_iso()}
        await db.notes.insert_one(dict(doc))
        await log_activity(doc["id"], "created", f"Pedido criado para {doc['customer_name']}")

    await db.migrations.insert_one({"id": marker_id, "applied_at": now_iso()})
    logger.info("Seed de pedidos do WhatsApp (20 jul) aplicado: 3 pedidos.")


async def ensure_indexes():
    for f in ["status", "priority", "category", "created_at", "supplier_id", "archived"]:
        try:
            await db.notes.create_index(f)
        except Exception:
            pass
    for coll, field in [("activities", "note_id"), ("tasks", "note_id"), ("tasks", "group_id"), ("quotes", "note_id"),
                        ("received_emails", "note_id"), ("received_emails", "seen"),
                        ("received_emails", "matched"), ("received_emails", "received_at"),
                        ("received_emails", "reply_kind"), ("notes", "email"),
                        ("sent_emails", "note_id"), ("sent_emails", "kind"), ("sent_emails", "sent_at"),
                        ("sent_emails", "message_id"),
                        ("email_attachments", "email_id"),
                        ("correio_semanal_digests", "csn_number"), ("correio_semanal_digests", "created_at"),
                        ("tasks", "suggested"), ("tasks", "csn_number")]:
        try:
            await db[coll].create_index(field)
        except Exception:
            pass


_background_tasks = set()


async def _imap_poll_loop():
    """Verifica a caixa de entrada e a pasta Enviados a cada IMAP_POLL_MINUTES.
    Só leitura — cobre também emails enviados diretamente pelo Gmail (site
    ou telemóvel), não só os enviados através desta app."""
    await asyncio.sleep(20)
    while True:
        try:
            result = await poll_supplier_replies()
            if result.get("new"):
                logger.info(f"IMAP: {result['new']} resposta(s) de fornecedor associada(s) a pedidos.")
        except Exception as e:
            logger.error(f"Verificação IMAP (receção) falhou: {e}")
        try:
            sent_result = await poll_sent_folder()
            if sent_result.get("new"):
                logger.info(f"IMAP: {sent_result['new']} email(s) enviado(s) pelo Gmail sincronizado(s).")
        except Exception as e:
            logger.error(f"Verificação IMAP (enviados) falhou: {e}")
        await asyncio.sleep(max(IMAP_POLL_MINUTES, 1) * 60)


async def _backfill_correio_semanal_summaries():
    """Regenera o resumo de todos os Correios Semanais já guardados — cobre
    tanto os que ainda não tinham resumo (funcionalidade nova) como os que
    tinham um resumo gerado por IA de uma versão anterior, substituído aqui
    pelo resumo determinístico. Sem custo de API nem limite de taxa (é só
    processamento local), por isso corre sempre, sem condição. Corre uma vez
    no arranque, em segundo plano — nunca bloqueia o arranque do servidor."""
    try:
        docs = await db.received_emails.find(
            {"from_email": CORREIO_SEMANAL_SENDER},
            {"_id": 0, "id": 1, "subject": 1},
        ).to_list(200)
        for d in docs:
            atts = await db.email_attachments.find({"email_id": d["id"]}, {"_id": 0}).to_list(10)
            if not atts:
                continue
            att_filenames = [a.get("filename") for a in atts]
            if not _looks_like_correio_semanal(CORREIO_SEMANAL_SENDER, d.get("subject"), att_filenames):
                continue
            pdf_bytes_list = [base64.b64decode(a["content_b64"]) for a in atts]
            summary = await _summarize_correio_semanal(d.get("subject"), pdf_bytes_list)
            if summary:
                await db.received_emails.update_one({"id": d["id"]}, {"$set": {
                    "correio_semanal_summary": summary, "correio_semanal_summary_at": now_iso()}})
    except Exception as e:
        logger.error(f"Resumo automático de Correios Semanais em atraso falhou: {e}")


DAILY_MAINTENANCE_INTERVAL_HOURS = 24


async def _daily_maintenance_loop():
    """Arquivamento inteligente (auto_close_inactive) só corria uma vez, no
    arranque do servidor — um servidor que fica meses sem reiniciar nunca
    mais arquivava nada sozinho. Este laço corre independentemente da
    configuração de email (o IMAP pode estar desligado) e repete a cada
    DAILY_MAINTENANCE_INTERVAL_HOURS."""
    await asyncio.sleep(60)
    while True:
        try:
            closed = await auto_close_inactive()
            if closed:
                logger.info(f"Arquivamento automático: {closed} pedido(s) inativo(s) arquivado(s).")
        except Exception as e:
            logger.error(f"Arquivamento automático falhou: {e}")
        await asyncio.sleep(DAILY_MAINTENANCE_INTERVAL_HOURS * 3600)


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        await migrate()
        await seed_notas_telemovel()
        await seed_pedidos_whatsapp()
        await auto_close_inactive()
    except Exception as e:
        logger.error(f"Startup falhou: {e}")
    if SMTP_CONFIGURED and IMAP_POLL_MINUTES > 0:
        task = asyncio.create_task(_imap_poll_loop())
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
    backfill_task = asyncio.create_task(_backfill_correio_semanal_summaries())
    _background_tasks.add(backfill_task)
    backfill_task.add_done_callback(_background_tasks.discard)
    maintenance_task = asyncio.create_task(_daily_maintenance_loop())
    _background_tasks.add(maintenance_task)
    maintenance_task.add_done_callback(_background_tasks.discard)


# ---------- Proteção por PIN (dispositivos verificados) ----------
# Toda a API exige um token de dispositivo emitido após introduzir o PIN.
# O middleware cobre automaticamente qualquer rota atual ou futura; as únicas
# exceções são a própria autenticação e o callback OAuth do Gmail (chega por
# redirect do Google, sem headers nossos).
INITIAL_PIN = os.environ.get("ACCESS_PIN", "250724")
PIN_MAX_ATTEMPTS = 3
PIN_LOCK_MINUTES = 10
AUTH_EXEMPT_PREFIXES = ("/api/auth/", "/api/oauth/", "/api/gmail/connect")


def _hash_pin(pin, salt):
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


async def _get_pin_doc():
    doc = await db.settings.find_one({"key": "access_pin"}, {"_id": 0})
    if not doc:
        salt = secrets.token_hex(16)
        doc = {"key": "access_pin", "salt": salt, "hash": _hash_pin(INITIAL_PIN, salt), "created_at": now_iso()}
        await db.settings.update_one({"key": "access_pin"}, {"$setOnInsert": doc}, upsert=True)
    return doc


# Cache em memória de tokens já confirmados — evita uma consulta ao Mongo por
# pedido. Só guarda tokens válidos, com prazo curto.
_device_token_cache = {}


async def _device_token_valid(token):
    if not token:
        return False
    now_ts = datetime.now(timezone.utc).timestamp()
    if _device_token_cache.get(token, 0) > now_ts:
        return True
    doc = await db.auth_devices.find_one({"token": token}, {"_id": 0, "id": 1})
    if not doc:
        return False
    _device_token_cache[token] = now_ts + 300
    return True


def _client_ip(request):
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "")


def _attempt_key(request, device_id):
    # Bloqueio por IP + dispositivo: trocar de identificador de dispositivo no
    # mesmo IP não dá tentativas extra, porque o IP faz parte da chave.
    return f"{_client_ip(request)}|{(device_id or '')[:64]}"


async def _lock_state(request, device_id):
    now = datetime.now(timezone.utc)
    key = _attempt_key(request, device_id)
    doc = await db.auth_attempts.find_one({"key": key}, {"_id": 0}) or {}
    locked_until = parse_dt(doc.get("locked_until"))
    if locked_until and locked_until > now:
        return {"locked": True, "retry_in_seconds": max(1, int((locked_until - now).total_seconds())), "attempts_left": 0}
    if locked_until:
        # Bloqueio expirado — repõe as tentativas.
        await db.auth_attempts.delete_one({"key": key})
        doc = {}
    return {"locked": False, "retry_in_seconds": 0,
            "attempts_left": max(0, PIN_MAX_ATTEMPTS - doc.get("fails", 0))}


class PinVerifyIn(BaseModel):
    pin: str = ""
    device_id: str = ""


@api_router.get("/auth/status")
async def auth_status(request: Request, device_id: str = ""):
    verified = await _device_token_valid(request.headers.get("x-device-token"))
    lock = await _lock_state(request, device_id)
    return {"verified": verified, **lock}


@api_router.post("/auth/verify-pin")
async def verify_pin(payload: PinVerifyIn, request: Request):
    lock = await _lock_state(request, payload.device_id)
    if lock["locked"]:
        return {"ok": False, **lock}
    pin = re.sub(r"\D", "", payload.pin or "")
    pin_doc = await _get_pin_doc()
    key = _attempt_key(request, payload.device_id)
    ip = _client_ip(request)
    if pin and secrets.compare_digest(_hash_pin(pin, pin_doc["salt"]), pin_doc["hash"]):
        await db.auth_attempts.delete_one({"key": key})
        token = secrets.token_urlsafe(32)
        await db.auth_devices.insert_one({
            "id": str(uuid.uuid4()), "token": token, "device_id": payload.device_id[:64],
            "ip": ip, "user_agent": (request.headers.get("user-agent") or "")[:300],
            "created_at": now_iso(), "last_seen": now_iso()})
        logger.info(f"PIN validado — novo dispositivo verificado (ip={ip})")
        return {"ok": True, "token": token}
    fails = ((await db.auth_attempts.find_one({"key": key}, {"_id": 0}) or {}).get("fails", 0)) + 1
    update = {"key": key, "fails": fails, "ip": ip, "updated_at": now_iso()}
    if fails >= PIN_MAX_ATTEMPTS:
        update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=PIN_LOCK_MINUTES)).isoformat()
    await db.auth_attempts.update_one({"key": key}, {"$set": update}, upsert=True)
    logger.warning(f"PIN errado (ip={ip}, tentativa {fails}/{PIN_MAX_ATTEMPTS})")
    if fails >= PIN_MAX_ATTEMPTS:
        return {"ok": False, "locked": True, "retry_in_seconds": PIN_LOCK_MINUTES * 60, "attempts_left": 0}
    return {"ok": False, "locked": False, "retry_in_seconds": 0, "attempts_left": PIN_MAX_ATTEMPTS - fails}


@app.middleware("http")
async def pin_gate(request: Request, call_next):
    path = request.url.path
    # A raiz da API não devolve nada sensível (só uma mensagem estática) e é
    # o endpoint usado pelo HEALTHCHECK do Docker e pelo hostinger-setup.sh
    # para confirmar que o backend arrancou — tem de responder sem PIN,
    # senão o deploy nunca vê o backend como saudável.
    if path.startswith("/api") and path not in ("/api", "/api/") and not path.startswith(AUTH_EXEMPT_PREFIXES):
        token = request.headers.get("x-device-token") or request.query_params.get("device_token")
        if not await _device_token_valid(token):
            return JSONResponse({"detail": "Acesso protegido — introduza o PIN."}, status_code=401)
    return await call_next(request)


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
