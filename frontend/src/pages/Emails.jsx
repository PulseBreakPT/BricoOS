import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail, Inbox, Send, FileClock, Search, Loader2, FileText, RefreshCw,
  CheckCheck, ArrowRight, Truck, User, Paperclip,
} from "lucide-react";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { timeAgo, formatDateTime } from "@/lib/pedido";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ConfirmSendDialog from "@/components/ConfirmSendDialog";
import { toast } from "sonner";

const PAGE_SIZE = 30;

// Chip pequeno "recebido de / enviado para", com ícone consoante o tipo.
function KindBadge({ kind }) {
  const map = {
    supplier: { label: "Fornecedor", cls: "bg-blue-50 text-blue-700", icon: Truck },
    client: { label: "Cliente", cls: "bg-emerald-50 text-emerald-700", icon: User },
    other: { label: "Outro", cls: "bg-slate-100 text-slate-600", icon: Mail },
  };
  const cfg = map[kind] || map.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-slate-200 py-14 text-center text-slate-400">
      <Icon className="h-8 w-8" />
      <p className="mt-3 text-sm font-semibold">{text}</p>
    </div>
  );
}

// Caixa de entrada — TODOS os emails recebidos, mesmo sem relação com um
// pedido (esses ficam com etiqueta "Sem pedido associado").
function InboxTab({ search }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/emails/inbox", { params: { search: search || undefined, limit: PAGE_SIZE } });
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar a caixa de entrada"));
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/emails/sync");
      toast.success(data.new ? `${data.new} nova(s) resposta(s) associada(s) a pedidos` : "Caixa de entrada verificada");
      await load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível verificar a caixa de entrada"));
    } finally {
      setSyncing(false);
    }
  };

  const markAllSeen = async () => {
    try {
      await api.post("/emails/seen-all");
      await load();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const openItem = async (m) => {
    if (!m.seen) { try { await api.post(`/emails/${m.id}/seen`); setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, seen: true } : x))); } catch { /* segue */ } }
    setExpanded((cur) => (cur === m.id ? null : m.id));
  };

  return (
    <div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{total} email{total === 1 ? "" : "s"} na caixa de entrada</p>
        <div className="flex gap-2">
          <Button data-testid="emails-mark-all-seen" size="sm" variant="outline" onClick={markAllSeen} className="h-8 rounded-lg text-xs">
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Marcar tudo como visto
          </Button>
          <Button data-testid="emails-sync" size="sm" variant="outline" disabled={syncing} onClick={sync} className="h-8 rounded-lg text-xs">
            {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Verificar agora
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} text="Sem emails na caixa de entrada." />
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((m) => (
            <div key={m.id} data-testid={`inbox-email-${m.id}`} className={`rounded-xl border p-3 transition-colors ${m.seen ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50/40"}`}>
              <button onClick={() => openItem(m)} className="flex w-full items-start gap-3 text-left">
                {!m.seen ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" /> : <span className="mt-1.5 h-2 w-2 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900">{m.supplier_name || m.from_email}</span>
                    {m.matched ? <KindBadge kind="supplier" /> : <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">Sem pedido associado</span>}
                    {m.has_pdf ? <FileText className="h-3.5 w-3.5 text-red-500" title="Com PDF em anexo" /> : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{m.subject || "(sem assunto)"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{m.from_email} · {timeAgo(m.received_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{m.body || "(sem texto)"}</pre>
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => (
                        <a key={a.id} href={withDeviceToken(`${API}/emails/${m.id}/attachments/${a.id}`)} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">
                          <FileText className="h-3.5 w-3.5" /> {a.filename}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {m.note_id ? (
                    <button onClick={() => navigate(`/?open=${m.note_id}&tab=orcamentos`)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                      Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Enviados — fornecedores, clientes e outros; um único registo por envio,
// independentemente de estar ligado a um pedido.
function SentTab({ search }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/emails/sent", {
        params: { search: search || undefined, kind: kind === "todos" ? undefined : kind, limit: PAGE_SIZE },
      });
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar os emails enviados"));
    } finally {
      setLoading(false);
    }
  }, [search, kind]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{total} email{total === 1 ? "" : "s"} enviado{total === 1 ? "" : "s"}</p>
        <div className="flex gap-1.5">
          {[["todos", "Todos"], ["supplier", "Fornecedores"], ["client", "Clientes"]].map(([k, label]) => (
            <button key={k} data-testid={`sent-filter-${k}`} onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${kind === k ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Send} text="Sem emails enviados." />
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((m) => (
            <div key={m.id} data-testid={`sent-email-${m.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
              <button onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900">{m.to_label || m.to}</span>
                    <KindBadge kind={m.kind} />
                    {(m.attachments || []).length > 0 ? <Paperclip className="h-3.5 w-3.5 text-slate-400" title="Com anexo" /> : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{m.subject || "(sem assunto)"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{m.to} · {timeAgo(m.sent_at)}</p>
                </div>
              </button>
              {expanded === m.id ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{m.body || "(sem texto)"}</pre>
                  {(m.attachments || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a, i) => (
                        m.note_id && m.pdf_file_id ? (
                          <a key={i} href={withDeviceToken(`${API}/notes/${m.note_id}/files/${m.pdf_file_id}`)} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">
                            <FileText className="h-3.5 w-3.5" /> {a.filename}
                          </a>
                        ) : (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-500">
                            <FileText className="h-3.5 w-3.5" /> {a.filename}
                          </span>
                        )
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[11px] text-slate-400">{formatDateTime(m.sent_at)}</p>
                  {m.note_id ? (
                    <button onClick={() => navigate(`/?open=${m.note_id}&tab=cronologia`)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                      Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rascunhos — orçamentos preparados (automática ou manualmente) que ainda
// aguardam confirmação. Reutiliza o mesmo ecrã de confirmação da ficha do pedido.
function DraftsTab({ search }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmNote, setConfirmNote] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/emails/drafts");
      setItems(data.items);
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar os rascunhos"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? items.filter((n) => `${n.customer_name} ${n.pending_client_send?.subject} ${n.pending_client_send?.to}`.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div>
      <p className="mt-3 text-sm text-slate-500">{filtered.length} rascunho{filtered.length === 1 ? "" : "s"} por confirmar</p>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileClock} text="Sem rascunhos por enviar." />
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.map((n) => {
            const p = n.pending_client_send;
            return (
              <button key={n.id} data-testid={`draft-email-${n.id}`} onClick={() => setConfirmNote(n)}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-left transition-colors hover:bg-emerald-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
                  <p className="truncate text-xs text-slate-600">{p?.subject}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {p?.pdf_filename ? `${p.pdf_filename} · ` : ""}
                    {p?.total != null ? `${Number(p.total).toFixed(2)} € c/ IVA · ` : ""}
                    {timeAgo(p?.created_at)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                  <Send className="h-3.5 w-3.5" /> Rever e enviar
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ConfirmSendDialog
        open={!!confirmNote}
        onOpenChange={(v) => { if (!v) setConfirmNote(null); }}
        note={confirmNote}
        onDone={load}
      />
    </div>
  );
}

export default function Emails() {
  const [tab, setTab] = useState("inbox");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 sm:text-sm">Toda a atividade de email</p>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
          <Mail className="h-6 w-6 text-slate-700 sm:h-8 sm:w-8" /> Emails
        </h1>
        <p className="text-sm text-slate-500">
          Caixa de entrada completa, enviados e rascunhos por confirmar — mesmo sem relação com um pedido registado.
        </p>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input data-testid="emails-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar por remetente, destinatário ou assunto..." className="h-11 rounded-xl pl-10" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inbox" data-testid="emails-tab-inbox"><Inbox className="mr-1.5 h-3.5 w-3.5" /> Recebidos</TabsTrigger>
          <TabsTrigger value="sent" data-testid="emails-tab-sent"><Send className="mr-1.5 h-3.5 w-3.5" /> Enviados</TabsTrigger>
          <TabsTrigger value="drafts" data-testid="emails-tab-drafts"><FileClock className="mr-1.5 h-3.5 w-3.5" /> Rascunhos</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="focus-visible:outline-none"><InboxTab search={debounced} /></TabsContent>
        <TabsContent value="sent" className="focus-visible:outline-none"><SentTab search={debounced} /></TabsContent>
        <TabsContent value="drafts" className="focus-visible:outline-none"><DraftsTab search={debounced} /></TabsContent>
      </Tabs>
    </div>
  );
}
