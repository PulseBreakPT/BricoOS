from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

VALID_CATEGORIES = ["construcao", "bricolage", "decoracao", "jardim"]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class NoteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: str = ""
    phone: str = ""
    description: str = ""
    details: str = ""
    category: str = "construcao"
    measurements: str = ""
    status: str = "aberto"
    done: bool = False
    favorite: bool = False


class NotePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    details: Optional[str] = None
    category: Optional[str] = None
    measurements: Optional[str] = None
    status: Optional[str] = None
    done: Optional[bool] = None
    favorite: Optional[bool] = None


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
    supplier_id: str
    subject: str
    body: str


# ---------- Notes ----------
@api_router.get("/notes")
async def list_notes():
    docs = await db.notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.post("/notes")
async def create_note(payload: NoteIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.notes.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    return doc


@api_router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NotePatch):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    res = await db.notes.update_one({"id": note_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    return await db.notes.find_one({"id": note_id}, {"_id": 0})


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    await db.notes.delete_one({"id": note_id})
    await db.quotes.delete_many({"note_id": note_id})
    return {"ok": True}


# ---------- Suppliers ----------
@api_router.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)


@api_router.post("/suppliers")
async def create_supplier(payload: SupplierIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
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
async def list_tasks():
    return await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.post("/tasks")
async def create_task(payload: TaskIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.tasks.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskIn):
    res = await db.tasks.update_one({"id": task_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


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


# ---------- Quotes (comparação de preços) ----------
@api_router.get("/notes/{note_id}/quotes")
async def list_quotes(note_id: str):
    return await db.quotes.find({"note_id": note_id}, {"_id": 0}).sort("price", 1).to_list(1000)


@api_router.post("/notes/{note_id}/quotes")
async def add_quote(note_id: str, payload: QuoteIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["note_id"] = note_id
    doc["created_at"] = now_iso()
    await db.quotes.insert_one(dict(doc))
    await db.notes.update_one({"id": note_id}, {"$set": {"status": "preco_recebido", "updated_at": now_iso()}})
    doc.pop("_id", None)
    return doc


@api_router.delete("/notes/{note_id}/quotes/{quote_id}")
async def delete_quote(note_id: str, quote_id: str):
    await db.quotes.delete_one({"id": quote_id, "note_id": note_id})
    return {"ok": True}


# ---------- Gmail ----------
def client_config():
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


async def get_gmail_creds():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    token = await db.gmail_tokens.find_one({"account": "store"}, {"_id": 0})
    if not token:
        return None
    creds = Credentials(
        token=token.get("access_token"),
        refresh_token=token.get("refresh_token"),
        token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )
    expires_raw = token.get("expires_at")
    expired = False
    if expires_raw:
        try:
            expires = datetime.fromisoformat(expires_raw)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            expired = datetime.now(timezone.utc) >= (expires - timedelta(seconds=60))
        except Exception:
            expired = True
    if expired and token.get("refresh_token"):
        try:
            creds.refresh(GoogleRequest())
            await db.gmail_tokens.update_one(
                {"account": "store"},
                {"$set": {
                    "access_token": creds.token,
                    "expires_at": creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None,
                }},
            )
        except Exception as e:
            logger.error(f"Erro a renovar token Gmail: {e}")
            return None
    return creds


@api_router.get("/gmail/status")
async def gmail_status():
    configured = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    token = await db.gmail_tokens.find_one({"account": "store"}, {"_id": 0})
    return {
        "configured": configured,
        "connected": bool(token),
        "email": token.get("email") if token else None,
    }


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
            oauth2 = build("oauth2", "v2", credentials=creds)
            info = oauth2.userinfo().get().execute()
            email = info.get("email")
        except Exception:
            pass
        await db.gmail_tokens.update_one(
            {"account": "store"},
            {"$set": {
                "account": "store",
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "expires_at": creds.expiry.replace(tzinfo=timezone.utc).isoformat() if creds.expiry else None,
                "email": email,
                "updated_at": now_iso(),
            }},
            upsert=True,
        )
        return RedirectResponse(f"{frontend}/?gmail=connected")
    except Exception as e:
        logger.error(f"Erro no callback Gmail: {e}")
        return RedirectResponse(f"{frontend}/?gmail=error")


@api_router.post("/gmail/disconnect")
async def gmail_disconnect():
    await db.gmail_tokens.delete_many({"account": "store"})
    return {"ok": True}


async def send_email(to_email: str, subject: str, body: str):
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
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    supplier = await db.suppliers.find_one({"id": payload.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    await send_email(supplier.get("email", ""), payload.subject, payload.body)
    req = {
        "id": str(uuid.uuid4()),
        "note_id": note_id,
        "supplier_id": payload.supplier_id,
        "supplier_name": supplier.get("name"),
        "subject": payload.subject,
        "body": payload.body,
        "sent_at": now_iso(),
    }
    await db.quote_requests.insert_one(dict(req))
    await db.notes.update_one({"id": note_id}, {"$set": {"status": "preco_pedido", "updated_at": now_iso()}})
    req.pop("_id", None)
    return {"ok": True, "request": req}


# ---------- Stats ----------
@api_router.get("/stats")
async def stats():
    notes = await db.notes.find({}, {"_id": 0}).to_list(2000)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(2000)
    suppliers_count = await db.suppliers.count_documents({})
    by_category = {c: 0 for c in VALID_CATEGORIES}
    pending_prices = 0
    for n in notes:
        cat = n.get("category")
        if cat in by_category:
            by_category[cat] += 1
        if n.get("status") in ("aberto", "preco_pedido") and not n.get("done"):
            pending_prices += 1
    tasks_pending = sum(1 for t in tasks if not t.get("done"))
    return {
        "total_notes": len(notes),
        "open_notes": sum(1 for n in notes if not n.get("done")),
        "pending_prices": pending_prices,
        "by_category": by_category,
        "tasks_pending": tasks_pending,
        "suppliers": suppliers_count,
    }


@api_router.get("/")
async def root():
    return {"message": "Bricomarché Faro - Bloco de Notas API"}


# ---------- Seed ----------
async def seed():
    if await db.notes.count_documents({}) == 0:
        base = datetime.now(timezone.utc)
        samples = [
            ("Teresa Mera", "917100512", "Preço Tijolos Articimentos bancadas", "jardim", "", "aberto"),
            ("Cristóvão", "969770968", "2 pratos iguais para esta referência", "jardim", "", "aberto"),
            ("Henrique Pinheiro", "961548608", "Preço de um rolo de ambos", "construcao", "", "aberto"),
            ("Ana Sofia", "966647368", "1 cabine de duche 80x140cm em L", "decoracao", "800x1400mm", "aberto"),
            ("Nuno Pinheiro", "916519616", "Preço churrasqueira Patacão", "bricolage", "", "preco_pedido"),
            ("Eduardo", "911997858", "Janela sótão - abrir para dentro direita", "construcao", "1000x600mm", "aberto"),
            ("Guerreiro", "917034660", "2 latas Tinta piscinas 20L", "bricolage", "", "aberto"),
            ("António Carvalho", "964862256", "Bancada +50cm e +2 pilares", "jardim", "", "aberto"),
            ("Patrícia", "964572010", "Ventoinha industrial com depósito, tipo mercado municipal", "bricolage", "", "aberto"),
            ("Rui Catalana", "964136143", "Janela de correr alum sem corte térmico", "construcao", "2000x1000mm", "preco_recebido"),
            ("João Caliço Martins", "934973199", "Rede mosquiteira de fole", "jardim", "2000x920mm", "aberto"),
            ("Celina Brito", "910331771", "Tampa WC madeira", "decoracao", "", "aberto"),
        ]
        docs = []
        for i, (name, phone, desc, cat, med, status) in enumerate(samples):
            ts = (base - timedelta(hours=i)).isoformat()
            docs.append({
                "id": str(uuid.uuid4()), "customer_name": name, "phone": phone,
                "description": desc, "details": "", "category": cat, "measurements": med,
                "status": status, "done": False, "favorite": i in (3, 9),
                "created_at": ts, "updated_at": ts,
            })
        await db.notes.insert_many(docs)

    if await db.suppliers.count_documents({}) == 0:
        sups = [
            {"name": "Articimentos - Materiais", "email": "", "phone": "289000001", "category": "construcao", "notes": "Tijolo, cimento, bancadas"},
            {"name": "Alumínios Algarve", "email": "", "phone": "289000002", "category": "construcao", "notes": "Janelas, portas em alumínio"},
            {"name": "Tintas & Cor Sul", "email": "", "phone": "289000003", "category": "bricolage", "notes": "Tintas e vernizes"},
            {"name": "Jardins & Cia", "email": "", "phone": "289000004", "category": "jardim", "notes": "Plantas, rega, mobiliário jardim"},
        ]
        for s in sups:
            s["id"] = str(uuid.uuid4())
            s["created_at"] = now_iso()
        await db.suppliers.insert_many(sups)

    if await db.tasks.count_documents({}) == 0:
        tks = [
            {"title": "Repor stock de cimento e areia", "category": "construcao", "priority": "alta"},
            {"title": "Montar expositor de tintas novo", "category": "bricolage", "priority": "normal"},
            {"title": "Atualizar preços da secção decoração", "category": "decoracao", "priority": "normal"},
            {"title": "Regar plantas e verificar rega automática", "category": "jardim", "priority": "alta"},
            {"title": "Pedir orçamento janelas à medida (Rui Catalana)", "category": "construcao", "priority": "alta"},
        ]
        for t in tks:
            t["id"] = str(uuid.uuid4())
            t["done"] = False
            t["due_date"] = ""
            t["created_at"] = now_iso()
        await db.tasks.insert_many(tks)


@app.on_event("startup")
async def on_startup():
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed falhou: {e}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
