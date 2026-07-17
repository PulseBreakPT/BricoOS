from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import difflib
import json as _json
import logging
import uuid
import base64
import warnings
from pathlib import Path
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText

try:
    from email_templates import (
        business_greeting, client_quote_template, request_reference, supplier_quote_template,
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
except ImportError:  # Permite também executar como módulo: python -m backend.server
    from .email_templates import (
        business_greeting, client_quote_template, request_reference, supplier_quote_template,
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
    },
    "cliente_deixou_mensagem": {
        "message": "Deixada mensagem / SMS ao cliente", "type": "contact_attempt",
        "counter": "client_no_answer_count",
    },
    "cliente_atendeu": {
        "message": "Falei com o cliente por telefone", "type": "client_contact",
        "touch_client": True, "clear_labels": ["Cliente não atendeu"],
        "reset_counter": "client_no_answer_count",
    },
    "fornecedor_nao_atendeu": {
        "message": "Fornecedor não atendeu a chamada", "type": "contact_attempt",
        "label": "Fornecedor não atendeu", "counter": "supplier_no_answer_count",
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


def enrich_note(note, now=None):
    now = now or datetime.now(timezone.utc)
    status = note.get("status", "novo")
    note["next_action"] = NEXT_ACTION.get(status, "")
    note["next_status"] = NEXT_STATUS.get(status)
    note["next_status_label"] = STATUS_LABEL.get(NEXT_STATUS.get(status), "")
    note["next_action_mode"] = NEXT_ACTION_MODE.get(status, "status")
    note["status_label"] = STATUS_LABEL.get(status, status)
    note["request_reference"] = request_reference(note)
    sla = note.get("sla_days") or DEFAULT_SLA_DAYS
    ref = parse_dt(note.get("status_updated_at") or note.get("updated_at") or note.get("created_at"))
    days = max((now - ref).days, 0) if ref else 0
    note["waiting_days"] = days
    note["is_overdue"] = (status in WAITING_SUPPLIER or status in FORGOTTEN_STATUSES) and days >= sla
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
    favorite: bool = False

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
    favorite: Optional[bool] = None

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


class SupplierIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    email: str = ""
    phone: str = ""
    category: str = ""
    notes: str = ""

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
    note_id: str = ""

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

    @field_validator("priority")
    @classmethod
    def _v_priority(cls, v):
        return _check_choice(v, TASK_PRIORITIES, "Prioridade")

    @field_validator("repeat")
    @classmethod
    def _v_repeat(cls, v):
        return _check_choice(v, TASK_REPEATS, "Repetição")


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
@api_router.get("/notes")
async def list_notes(
    search: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None,
    category: Optional[str] = None, supplier_id: Optional[str] = None, label: Optional[str] = None,
    favorite: Optional[bool] = None, overdue: Optional[bool] = None, archived: Optional[bool] = None,
    waiting: Optional[str] = None, reminder_due: Optional[bool] = None,
    sort: str = "smart", skip: int = 0, limit: int = 300,
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
    if favorite:
        q["favorite"] = True
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [{"customer_name": rx}, {"description": rx}, {"phone": rx}, {"email": rx},
                    {"details": rx}, {"measurements": rx}, {"reference": rx}, {"labels": rx}]
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    now = datetime.now(timezone.utc)
    docs = [enrich_note(d, now) for d in docs]
    if overdue:
        docs = [d for d in docs if d["is_overdue"]]
    if waiting:
        docs = [d for d in docs if d["waiting_on"] == waiting]
    if reminder_due:
        docs = [d for d in docs if d.get("reminder_due")]
    if sort == "priority":
        docs.sort(key=lambda d: (PRIORITY_RANK.get(d.get("priority"), 2), d.get("created_at")))
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
    return {"items": docs[skip:skip + limit], "total": len(docs)}


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
                "last_supplier_sent_at": "", "last_client_contact_at": "",
                "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
                "client_no_answer_count": 0, "supplier_no_answer_count": 0,
                "created_at": now_iso(), "updated_at": now_iso(), "status_updated_at": now_iso()})
    await db.notes.insert_one(dict(doc))
    await log_activity(doc["id"], "created", f"Pedido criado para {doc.get('customer_name') or 'cliente'}")
    return enrich_note(doc)


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
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
                "reminder_interval_days": src.get("reminder_interval_days", 3), "favorite": False,
                "archived": False, "created_by": AUTHOR, "last_supplier_sent_at": "", "last_client_contact_at": "",
                "reminder_count": 0, "last_reminder_at": "", "auto_closed": False,
                "client_no_answer_count": 0, "supplier_no_answer_count": 0,
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
    await db.notes.delete_one({"id": note_id})
    await db.quotes.delete_many({"note_id": note_id})
    await db.activities.delete_many({"note_id": note_id})
    await db.tasks.delete_many({"note_id": note_id})
    await db.quote_requests.delete_many({"note_id": note_id})
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
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True, "unlinked_notes": len(open_notes)}


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


@api_router.get("/tasks")
async def list_tasks(note_id: Optional[str] = None):
    q = {"note_id": note_id} if note_id else {}
    return await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


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
                "repeat": task["repeat"], "note_id": task.get("note_id", ""), "created_at": now_iso(),
                "subtasks": [{"id": str(uuid.uuid4()), "title": st["title"], "done": False}
                             for st in task.get("subtasks", [])],
            }
            await db.tasks.insert_one(dict(next_doc))
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


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
    ref_cliente = request_reference(n)
    ref_artigo = (n.get("reference") or "").strip()
    hoje = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    lines = [f"{business_greeting()} Exmos. Senhores,", ""]
    if is_reminder:
        lines.append(f"Venho por este meio reforçar o pedido enviado anteriormente com a referência {ref_cliente}:")
    else:
        lines.append(f"Venho por este meio solicitar um pedido de {tipo.lower()} de caixilharia à medida, "
                     "conforme a vossa ficha de pedido:")
    lines += [
        "",
        f"Tipo de pedido: {tipo}",
        "Cliente: Bricomarché Faro",
        f"Ref. de cliente: {ref_cliente}",
        f"Data do pedido: {hoje}",
    ]
    if ref_artigo:
        lines.append(f"Referência do artigo: {ref_artigo}")
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
        "", "Agradeço, por favor, indicação de:", "• Preço;", "• Prazo de entrega;", "• Disponibilidade.",
        "", "Com os melhores cumprimentos,", "Bricomarché Faro",
    ]

    prefix = "Lembrete · " if is_reminder else ""
    element_word = "elemento" if display["element_count"] == 1 else "elementos"
    subject = (f"{prefix}Pedido de {tipo.lower()} {ref_cliente} — Caixilharia à medida · "
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
    token = await db.gmail_tokens.find_one({"account": "store"}, {"_id": 0})
    return {"configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET), "connected": bool(token),
            "email": token.get("email") if token else None}


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


async def _send_email(to_email, subject, body):
    creds = await get_gmail_creds()
    if not creds:
        raise HTTPException(status_code=400, detail="Gmail não está ligado. Ligue a sua conta Gmail para enviar emails automaticamente.")
    if not to_email:
        raise HTTPException(status_code=400, detail="O fornecedor não tem email definido.")
    try:
        service = build("gmail", "v1", credentials=creds)
        message = MIMEText(body)
        message["to"] = to_email
        message["subject"] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao enviar email: {e}")
        raise HTTPException(status_code=502, detail="Falha ao enviar o email pelo Gmail.")


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
    creds = await get_gmail_creds()
    if not creds:
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
            await _send_email(supplier["email"], payload.subject, payload.body)
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
async def today():
    now = datetime.now(timezone.utc)
    items = await build_notifications()
    inbox = await db.notes.find({"status": "novo", "archived": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(50)
    inbox = [enrich_note(d, now) for d in inbox]
    open_docs = await db.notes.find(
        {"archived": {"$ne": True}, "status": {"$nin": list(CLOSED_STATUSES)}}, {"_id": 0}).to_list(5000)
    open_docs = [enrich_note(d, now) for d in open_docs]
    waiting_me = [d for d in open_docs if d["waiting_on"] == "me"]
    waiting_supplier = [d for d in open_docs if d["waiting_on"] == "supplier"]
    waiting_client = [d for d in open_docs if d["waiting_on"] == "client"]
    waiting_me.sort(key=lambda d: (0 if d["is_overdue"] else 1, PRIORITY_RANK.get(d.get("priority"), 2),
                                   d.get("status_updated_at") or d.get("created_at")))
    long_waiting_clients = sorted(
        [d for d in waiting_client if (d.get("days_since_client") or 0) >= 2],
        key=lambda d: -(d.get("days_since_client") or 0))
    reminder_due = [d for d in waiting_supplier if d.get("reminder_due")]
    st = await stats()
    return {"attention": items[:20], "attention_count": len(items), "inbox": inbox,
            "waiting_me": waiting_me[:60], "waiting_supplier": waiting_supplier[:60],
            "waiting_client": waiting_client[:60], "long_waiting_clients": long_waiting_clients,
            "reminder_due": reminder_due, "counts": {
                "waiting_me": len(waiting_me), "waiting_supplier": len(waiting_supplier),
                "waiting_client": len(waiting_client), "reminder_due": len(reminder_due)},
            "summary": st["daily"], "potential_value": st["potential_value"]}


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
    has_quote = await db.quotes.count_documents({"note_id": note_id})
    suggest = reminder_count >= 2 and has_quote == 0
    _, _, per_sup_avg, _ = await compute_response()
    sups = await db.suppliers.find({}, {"_id": 0}).to_list(2000)
    alts = [s for s in sups if s["id"] not in contacted]
    same = [s for s in alts if s.get("category") == n.get("category")] or alts
    same = sorted(same, key=lambda s: (0 if s.get("email") else 1, per_sup_avg.get(s.get("name"), 9999)))
    for s in same:
        s["avg_hours"] = per_sup_avg.get(s.get("name"))
    return {"suggest_alternatives": suggest, "reminder_count": reminder_count,
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
                "reference": request_reference(n), "supplier": sup, "to": sup.get("email") if sup else ""}
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
    return {"message": "Bricomarché Faro - Assistente de Pedidos API"}


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
                "client_no_answer_count": 0, "supplier_no_answer_count": 0}
    for k, v in defaults.items():
        await db.notes.update_many({k: {"$exists": False}}, {"$set": {k: v}})
    await db.notes.update_many({"status": {"$in": list(ARCHIVE_STATUSES)}, "archived": {"$ne": True}}, {"$set": {"archived": True}})
    try:
        await db.notes.update_many({"status_updated_at": {"$exists": False}}, [{"$set": {"status_updated_at": "$updated_at"}}])
    except Exception:
        pass
    await _normalize_existing_phones()


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


async def ensure_indexes():
    for f in ["status", "priority", "category", "created_at", "supplier_id", "favorite", "archived"]:
        try:
            await db.notes.create_index(f)
        except Exception:
            pass
    for coll, field in [("activities", "note_id"), ("tasks", "note_id"), ("quotes", "note_id")]:
        try:
            await db[coll].create_index(field)
        except Exception:
            pass


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        await migrate()
        await auto_close_inactive()
    except Exception as e:
        logger.error(f"Startup falhou: {e}")


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
