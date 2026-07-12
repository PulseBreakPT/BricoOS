"""Backend API tests for Bricomarché Faro notes system."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://brico-brief-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Stats & Gmail ----------
def test_stats(s):
    r = s.get(f"{API}/stats", timeout=30)
    assert r.status_code == 200
    d = r.json()
    for k in ("total_notes", "open_notes", "pending_prices", "by_category", "tasks_pending", "suppliers"):
        assert k in d
    assert set(d["by_category"].keys()) >= {"construcao", "bricolage", "decoracao", "jardim"}


def test_gmail_status(s):
    r = s.get(f"{API}/gmail/status", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is False
    assert d["connected"] is False


# ---------- Notes CRUD ----------
def test_notes_list_seeded(s):
    r = s.get(f"{API}/notes", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 12
    n = data[0]
    for k in ("id", "customer_name", "phone", "description", "category"):
        assert k in n
    assert "_id" not in n


def test_note_create_get_update_toggle_delete(s):
    payload = {
        "customer_name": "TEST_Cliente",
        "phone": "912000000",
        "description": "TEST descrição",
        "category": "bricolage",
        "measurements": "100x200mm",
    }
    r = s.post(f"{API}/notes", json=payload)
    assert r.status_code == 200, r.text
    note = r.json()
    nid = note["id"]
    assert note["customer_name"] == "TEST_Cliente"
    assert note["category"] == "bricolage"

    # GET
    r = s.get(f"{API}/notes/{nid}")
    assert r.status_code == 200
    assert r.json()["description"] == "TEST descrição"

    # UPDATE
    r = s.put(f"{API}/notes/{nid}", json={"description": "TEST updated", "favorite": True, "done": True})
    assert r.status_code == 200
    d = r.json()
    assert d["description"] == "TEST updated"
    assert d["favorite"] is True
    assert d["done"] is True

    # verify persistence
    r = s.get(f"{API}/notes/{nid}")
    assert r.json()["favorite"] is True

    # DELETE
    r = s.delete(f"{API}/notes/{nid}")
    assert r.status_code == 200
    r = s.get(f"{API}/notes/{nid}")
    assert r.status_code == 404


# ---------- Suppliers CRUD ----------
def test_suppliers_crud(s):
    r = s.get(f"{API}/suppliers")
    assert r.status_code == 200
    assert len(r.json()) >= 4

    r = s.post(f"{API}/suppliers", json={"name": "TEST_Fornecedor", "email": "t@t.pt", "phone": "289000000", "category": "bricolage"})
    assert r.status_code == 200
    sup = r.json()
    sid = sup["id"]
    assert sup["name"] == "TEST_Fornecedor"

    r = s.put(f"{API}/suppliers/{sid}", json={"name": "TEST_Fornecedor2", "email": "t@t.pt", "phone": "289000000", "category": "jardim"})
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Fornecedor2"
    assert r.json()["category"] == "jardim"

    r = s.delete(f"{API}/suppliers/{sid}")
    assert r.status_code == 200


# ---------- Tasks CRUD ----------
def test_tasks_crud(s):
    r = s.get(f"{API}/tasks")
    assert r.status_code == 200
    assert len(r.json()) >= 5

    r = s.post(f"{API}/tasks", json={"title": "TEST_tarefa", "category": "jardim"})
    assert r.status_code == 200
    t = r.json()
    tid = t["id"]
    assert t["done"] is False

    r = s.patch(f"{API}/tasks/{tid}/toggle")
    assert r.status_code == 200
    assert r.json()["done"] is True

    r = s.delete(f"{API}/tasks/{tid}")
    assert r.status_code == 200


# ---------- Quotes ----------
def test_quotes_flow_and_send_gmail_400(s):
    # create note
    r = s.post(f"{API}/notes", json={"customer_name": "TEST_Q", "description": "quotes", "category": "construcao"})
    nid = r.json()["id"]

    # add two quotes
    r1 = s.post(f"{API}/notes/{nid}/quotes", json={"supplier_name": "A", "price": 50.0})
    r2 = s.post(f"{API}/notes/{nid}/quotes", json={"supplier_name": "B", "price": 30.0})
    assert r1.status_code == 200 and r2.status_code == 200

    r = s.get(f"{API}/notes/{nid}/quotes")
    assert r.status_code == 200
    quotes = r.json()
    assert len(quotes) == 2
    # sorted asc by price
    assert quotes[0]["price"] == 30.0

    # delete a quote
    r = s.delete(f"{API}/notes/{nid}/quotes/{quotes[0]['id']}")
    assert r.status_code == 200

    # send-quote-request should return 400 (Gmail not configured)
    sup = s.get(f"{API}/suppliers").json()[0]
    r = s.post(f"{API}/notes/{nid}/send-quote-request", json={
        "supplier_id": sup["id"], "subject": "Pedido preço", "body": "Olá"
    })
    assert r.status_code == 400
    assert "Gmail" in r.json().get("detail", "")

    # cleanup
    s.delete(f"{API}/notes/{nid}")


def test_note_not_found(s):
    r = s.get(f"{API}/notes/does-not-exist")
    assert r.status_code == 404
