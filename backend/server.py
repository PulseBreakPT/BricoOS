from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import base64
import warnings
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText

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

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send", "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

AUTHOR = "Chefe de Loja"
DEFAULT_SLA_DAYS = 2
VALID_CATEGORIES = ["construcao", "bricolage", "decoracao", "jardim"]
STATUSES = [
    "novo", "pendente", "em_preparacao", "enviado_fornecedor", "aguarda_fornecedor",
    "orcamento_recebido", "aguarda_cliente", "aprovado", "rejeitado", "encomendado",
    "concluido", "cancelado",
]
CLOSED_STATUSES = {"concluido", "cancelado", "rejeitado"}
ARCHIVE_STATUSES = {"concluido", "cancelado"}
WAITING_SUPPLIER = {"enviado_fornecedor", "aguarda_fornecedor"}
FORGOTTEN_STATUSES = {"novo", "pendente", "em_preparacao"}
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
PREDEFINED_LABELS = ["À medida", "Cliente VIP", "Stock loja", "Encomenda especial", "Garantia", "Reclamação", "Promoção"]

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
    note["status_label"] = STATUS_LABEL.get(status, status)
    sla = note.get("sla_days") or DEFAULT_SLA_DAYS
    ref = parse_dt(note.get("status_updated_at") or note.get("updated_at") or note.get("created_at"))
    days = (now - ref).days if ref else 0
    note["waiting_days"] = days
    note["is_overdue"] = (status in WAITING_SUPPLIER or status in FORGOTTEN_STATUSES) and days >= sla
    sup = parse_dt(note.get("last_supplier_sent_at"))
    cli = parse_dt(note.get("last_client_contact_at"))
    note["days_since_supplier"] = (now - sup).days if sup else None
    note["days_since_client"] = (now - cli).days if cli else None
    note.pop("_id", None)
    return note


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


# ---------- Models ----------
class NoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: str = ""
    phone: str = ""
    email: str = ""
    description: str = ""
    details: str = ""
    category: str = "construcao"
    measurements: str = ""
    reference: str = ""
    status: str = "novo"
    priority: str = "media"
    labels: List[str] = []
    supplier_id: str = ""
    sla_days: int = DEFAULT_SLA_DAYS
    favorite: bool = False


class NotePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    description: Optional[str] = None
    details: Optional[str] = None
    category: Optional[str] = None
    measurements: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    supplier_id: Optional[str] = None
    sla_days: Optional[int] = None
    favorite: Optional[bool] = None


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


class SupplierIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    email: str = ""
    phone: str = ""
    category: str = ""
    notes: str = ""


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    category: str = "construcao"
    done: bool = False
    priority: str = "normal"
    due_date: str = ""
    note_id: str = ""


class QuoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str = ""
    supplier_name: str = ""
    product: str = ""
    price: float = 0.0
    currency: str = "EUR"
    notes: str = ""


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
    if sort == "smart":
        docs.sort(key=lambda d: (0 if d["is_overdue"] else 1, PRIORITY_RANK.get(d.get("priority"), 2),
                                 d.get("status_updated_at") or d.get("created_at")))
    elif sort == "priority":
        docs.sort(key=lambda d: (PRIORITY_RANK.get(d.get("priority"), 2), d.get("created_at")))
    elif sort == "deadline":
        docs.sort(key=lambda d: -d.get("waiting_days", 0))
    elif sort == "customer":
        docs.sort(key=lambda d: (d.get("customer_name") or "").lower())
    return {"items": docs[skip:skip + limit], "total": len(docs)}


@api_router.post("/notes/check-duplicate")
async def check_duplicate(payload: DuplicateCheckIn):
    ors = []
    if payload.phone.strip():
        ors.append({"phone": payload.phone.strip()})
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


@api_router.post("/notes/{note_id}/duplicate")
async def duplicate_note(note_id: str):
    src = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    doc = {k: src.get(k, "") for k in ["customer_name", "phone", "email", "description", "details",
                                        "category", "measurements", "reference", "supplier_id"]}
    doc.update({"id": str(uuid.uuid4()), "labels": list(src.get("labels", [])), "priority": src.get("priority", "media"),
                "status": "novo", "sla_days": src.get("sla_days", DEFAULT_SLA_DAYS), "favorite": False,
                "archived": False, "created_by": AUTHOR, "last_supplier_sent_at": "", "last_client_contact_at": "",
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
@api_router.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)


@api_router.post("/suppliers")
async def create_supplier(payload: SupplierIn):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.suppliers.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, payload: SupplierIn):
    res = await db.suppliers.update_one({"id": supplier_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})


@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True}


# ---------- Tasks ----------
@api_router.get("/tasks")
async def list_tasks(note_id: Optional[str] = None):
    q = {"note_id": note_id} if note_id else {}
    return await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api_router.post("/tasks")
async def create_task(payload: TaskIn):
    doc = payload.model_dump()
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
    doc = payload.model_dump()
    doc.update({"note_id": note_id, "id": str(uuid.uuid4()), "created_at": now_iso()})
    await db.tasks.insert_one(dict(doc))
    await log_activity(note_id, "task_added", f"Lembrete criado: {doc['title']}")
    doc.pop("_id", None)
    return doc


@api_router.patch("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    await db.tasks.update_one({"id": task_id}, {"$set": {"done": not task.get("done", False)}})
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


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
    ids = payload.supplier_ids or ([payload.supplier_id] if payload.supplier_id else [])
    if not ids:
        raise HTTPException(status_code=400, detail="Escolha pelo menos um fornecedor.")
    sent_names = []
    for sid in ids:
        supplier = await db.suppliers.find_one({"id": sid}, {"_id": 0})
        if not supplier:
            continue
        await _send_email(supplier.get("email", ""), payload.subject, payload.body)
        await db.quote_requests.insert_one({"id": str(uuid.uuid4()), "note_id": note_id, "supplier_id": sid,
                                            "supplier_name": supplier.get("name"), "subject": payload.subject,
                                            "body": payload.body, "sent_at": now_iso(), "is_reminder": payload.is_reminder})
        act_type = "email_sent"
        verb = "Lembrete enviado" if payload.is_reminder else "Pedido de orçamento enviado"
        await log_activity(note_id, act_type, f"{verb} a {supplier.get('name')}",
                           {"supplier_id": sid, "supplier_name": supplier.get("name"), "reminder": payload.is_reminder})
        sent_names.append(supplier.get("name"))
    if not sent_names:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    new_status = "aguarda_fornecedor" if payload.is_reminder else "enviado_fornecedor"
    upd = {"last_supplier_sent_at": now_iso(), "status_updated_at": now_iso(), "updated_at": now_iso(), "status": new_status}
    if not payload.is_reminder:
        upd["supplier_id"] = ids[0]
    await db.notes.update_one({"id": note_id}, {"$set": upd})
    return {"ok": True, "sent_to": sent_names}


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
    st = await stats()
    return {"attention": items[:20], "attention_count": len(items), "inbox": inbox,
            "summary": st["daily"], "potential_value": st["potential_value"]}


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
                "last_supplier_sent_at": "", "last_client_contact_at": ""}
    for k, v in defaults.items():
        await db.notes.update_many({k: {"$exists": False}}, {"$set": {k: v}})
    await db.notes.update_many({"status": {"$in": list(ARCHIVE_STATUSES)}, "archived": {"$ne": True}}, {"$set": {"archived": True}})
    try:
        await db.notes.update_many({"status_updated_at": {"$exists": False}}, [{"$set": {"status_updated_at": "$updated_at"}}])
    except Exception:
        pass


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


async def seed():
    if await db.notes.count_documents({}) == 0:
        base = datetime.now(timezone.utc)
        samples = [
            ("Teresa Mera", "917100512", "Preço Tijolos Articimentos bancadas", "jardim", "", "novo", "media"),
            ("Cristóvão", "969770968", "2 pratos iguais para esta referência", "jardim", "", "novo", "baixa"),
            ("Henrique Pinheiro", "961548608", "Preço de um rolo de ambos", "construcao", "", "novo", "media"),
            ("Ana Sofia", "966647368", "1 cabine de duche 80x140cm em L", "decoracao", "800x1400mm", "em_preparacao", "alta"),
            ("Nuno Pinheiro", "916519616", "Preço churrasqueira Patacão", "bricolage", "", "enviado_fornecedor", "media"),
            ("Eduardo", "911997858", "Janela sótão - abrir para dentro direita", "construcao", "1000x600mm", "aguarda_fornecedor", "urgente"),
            ("Guerreiro", "917034660", "2 latas Tinta piscinas 20L", "bricolage", "", "novo", "media"),
            ("António Carvalho", "964862256", "Bancada +50cm e +2 pilares", "jardim", "", "novo", "baixa"),
            ("Patrícia", "964572010", "Ventoinha industrial com depósito", "bricolage", "", "novo", "media"),
            ("Rui Catalana", "964136143", "Janela de correr alum sem corte térmico", "construcao", "2000x1000mm", "orcamento_recebido", "alta"),
            ("João Caliço Martins", "934973199", "Rede mosquiteira de fole", "jardim", "2000x920mm", "novo", "media"),
            ("Celina Brito", "910331771", "Tampa WC madeira", "decoracao", "", "aprovado", "media"),
        ]
        docs = []
        for i, (name, phone, desc, cat, med, status, prio) in enumerate(samples):
            ts = (base - timedelta(hours=i * 6)).isoformat()
            docs.append({"id": str(uuid.uuid4()), "customer_name": name, "phone": phone, "email": "", "description": desc,
                         "details": "", "category": cat, "measurements": med, "reference": "", "status": status,
                         "priority": prio, "labels": [], "supplier_id": "", "sla_days": DEFAULT_SLA_DAYS,
                         "created_by": AUTHOR, "favorite": i in (5, 9), "archived": False,
                         "last_supplier_sent_at": "", "last_client_contact_at": "",
                         "created_at": ts, "updated_at": ts, "status_updated_at": ts})
        await db.notes.insert_many(docs)

    if await db.suppliers.count_documents({}) == 0:
        sups = [
            {"name": "Articimentos - Materiais", "email": "", "phone": "289000001", "category": "construcao", "notes": "Tijolo, cimento, bancadas"},
            {"name": "Alumínios Algarve", "email": "", "phone": "289000002", "category": "construcao", "notes": "Janelas, portas em alumínio"},
            {"name": "Tintas & Cor Sul", "email": "", "phone": "289000003", "category": "bricolage", "notes": "Tintas e vernizes"},
            {"name": "Jardins & Cia", "email": "", "phone": "289000004", "category": "jardim", "notes": "Plantas, rega, mobiliário"},
        ]
        for s in sups:
            s.update({"id": str(uuid.uuid4()), "created_at": now_iso()})
        await db.suppliers.insert_many(sups)

    if await db.tasks.count_documents({}) == 0:
        tks = [
            {"title": "Repor stock de cimento e areia", "category": "construcao", "priority": "alta"},
            {"title": "Montar expositor de tintas novo", "category": "bricolage", "priority": "normal"},
            {"title": "Atualizar preços da secção decoração", "category": "decoracao", "priority": "normal"},
            {"title": "Regar plantas e verificar rega automática", "category": "jardim", "priority": "alta"},
        ]
        for t in tks:
            t.update({"id": str(uuid.uuid4()), "done": False, "due_date": "", "note_id": "", "created_at": now_iso()})
        await db.tasks.insert_many(tks)


async def demo_enrich():
    if await db.meta.find_one({"key": "v2_demo"}):
        return
    now = datetime.now(timezone.utc)
    try:
        for name, days in [("Eduardo", 4), ("Nuno Pinheiro", 3)]:
            n = await db.notes.find_one({"customer_name": name})
            if n:
                past = (now - timedelta(days=days)).isoformat()
                await db.notes.update_one({"id": n["id"]}, {"$set": {"status_updated_at": past, "updated_at": past, "last_supplier_sent_at": past}})
                await log_activity(n["id"], "email_sent", "Pedido de orçamento enviado a Alumínios Algarve", {"supplier_name": "Alumínios Algarve"})
                await db.activities.update_one({"note_id": n["id"], "type": "email_sent"}, {"$set": {"created_at": past}})
        rui = await db.notes.find_one({"customer_name": "Rui Catalana"})
        if rui:
            sent = (now - timedelta(days=3)).isoformat()
            recv = (now - timedelta(days=2, hours=6)).isoformat()
            await log_activity(rui["id"], "email_sent", "Pedido enviado a Alumínios Algarve", {"supplier_name": "Alumínios Algarve"})
            await db.activities.update_one({"note_id": rui["id"], "type": "email_sent"}, {"$set": {"created_at": sent}})
            await db.notes.update_one({"id": rui["id"]}, {"$set": {"last_supplier_sent_at": sent}})
            await db.quotes.insert_one({"id": str(uuid.uuid4()), "note_id": rui["id"], "supplier_id": "", "supplier_name": "Alumínios Algarve",
                                        "product": "Janela correr alumínio", "price": 289.0, "currency": "EUR", "notes": "Entrega 10 dias", "approved": False, "created_at": recv})
            await db.quotes.insert_one({"id": str(uuid.uuid4()), "note_id": rui["id"], "supplier_id": "", "supplier_name": "Articimentos - Materiais",
                                        "product": "Janela correr alumínio", "price": 315.0, "currency": "EUR", "notes": "Entrega 7 dias", "approved": False, "created_at": recv})
            await log_activity(rui["id"], "quote_added", "Orçamento de Alumínios Algarve: 289.00 €", {"supplier_name": "Alumínios Algarve", "price": 289.0})
            await db.activities.update_one({"note_id": rui["id"], "type": "quote_added"}, {"$set": {"created_at": recv}})
        for name, lbls in [("Ana Sofia", ["À medida", "Cliente VIP"]), ("Rui Catalana", ["À medida"])]:
            await db.notes.update_one({"customer_name": name}, {"$set": {"labels": lbls}})
        for name, p in [("Eduardo", "urgente"), ("Ana Sofia", "alta"), ("Rui Catalana", "alta"), ("Nuno Pinheiro", "alta"), ("Patrícia", "baixa"), ("Cristóvão", "baixa")]:
            await db.notes.update_one({"customer_name": name}, {"$set": {"priority": p}})
    except Exception as e:
        logger.error(f"demo_enrich falhou: {e}")
    await db.meta.insert_one({"key": "v2_demo", "done": True, "at": now_iso()})


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        await migrate()
        await seed()
        await demo_enrich()
    except Exception as e:
        logger.error(f"Startup falhou: {e}")


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
