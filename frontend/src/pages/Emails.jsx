import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail, Inbox, Send, FileClock, Search, Loader2, FileText, RefreshCw,
  CheckCheck, ArrowRight, Truck, User, Paperclip, UserPlus, Reply, Pencil,
} from "lucide-react";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { timeAgo, formatDateTime } from "@/lib/pedido";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ConfirmSendDialog from "@/components/ConfirmSendDialog";
import ComposeEmailDialog from "@/components/ComposeEmailDialog";
import { toast } from "sonner";

const PAGE_SIZE = 30;

// Atualização silenciosa em segundo plano: a caixa é verificada
// automaticamente no servidor (IMAP), mas sem isto a página só refletia
// respostas novas depois de recarregar à mão. Sem spinner, sem interromper
// o que o utilizador está a ver (ex.: um email expandido).
function useAutoRefresh(callback, ms = 45000) {
  useEffect(() => {
    const id = setInterval(callback, ms);
    const onFocus = () => callback();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [callback, ms]);
}

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
  const [creatingId, setCreatingId] = useState(null);
  const [replyingId, setReplyingId] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/inbox", { params: { search: search || undefined, limit: PAGE_SIZE } });
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar a caixa de entrada"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [search]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  const createNoteFrom = async (m) => {
    setCreatingId(m.id);
    try {
      const { data } = await api.post(`/emails/${m.id}/create-note`);
      toast.success("Pedido criado a partir do email");
      navigate(`/?open=${data.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar o pedido"));
    } finally {
      setCreatingId(null);
    }
  };

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
    setReplyingId(null);
  };

  const startReply = (id) => { setReplyingId(id); setReplyBody(""); };

  const sendReply = async (m) => {
    if (!replyBody.trim()) return;
    setSendingReply(true);
    try {
      await api.post(`/emails/${m.id}/reply`, { body: replyBody });
      toast.success(`Resposta enviada a ${m.from_email}`);
      setReplyingId(null);
      setReplyBody("");
      load({ silent: true });
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar a resposta"));
    } finally {
      setSendingReply(false);
    }
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
                    <span className="truncate text-sm font-bold text-slate-900">{m.supplier_name || m.from_name || m.from_email}</span>
                    {m.matched ? <KindBadge kind={m.reply_kind || "supplier"} /> : <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">Sem pedido associado</span>}
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {m.note_id ? (
                      <button onClick={() => navigate(`/?open=${m.note_id}&tab=${m.reply_kind === "client" ? "cronologia" : "orcamentos"}`)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
                        Abrir pedido associado <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : !m.matched ? (
                      <Button
                        data-testid={`inbox-create-note-${m.id}`}
                        size="sm"
                        disabled={creatingId === m.id}
                        onClick={() => createNoteFrom(m)}
                        className="h-8 rounded-lg text-xs"
                      >
                        {creatingId === m.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                        Criar pedido a partir deste email
                      </Button>
                    ) : null}
                    {replyingId !== m.id ? (
                      <Button
                        data-testid={`inbox-reply-${m.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => startReply(m.id)}
                        className="h-8 rounded-lg text-xs"
                      >
                        <Reply className="mr-1.5 h-3.5 w-3.5" /> Responder
                      </Button>
                    ) : null}
                  </div>
                  {replyingId === m.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        data-testid={`inbox-reply-body-${m.id}`}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={`Responder a ${m.from_email}...`}
                        rows={4}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          data-testid={`inbox-reply-send-${m.id}`}
                          size="sm"
                          disabled={sendingReply || !replyBody.trim()}
                          onClick={() => sendReply(m)}
                          className="h-8 rounded-lg text-xs"
                        >
                          {sendingReply ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                          Enviar resposta
                        </Button>
                        <Button size="sm" variant="ghost" disabled={sendingReply} onClick={() => setReplyingId(null)} className="h-8 rounded-lg text-xs">
                          Cancelar
                        </Button>
                      </div>
                    </div>
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

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/sent", {
        params: { search: search || undefined, kind: kind === "todos" ? undefined : kind, limit: PAGE_SIZE },
      });
      setItems(data.items); setTotal(data.total);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar os emails enviados"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [search, kind]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

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

  const load = useCallback(async (opts = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const { data } = await api.get("/emails/drafts");
      setItems(data.items);
    } catch (e) {
      if (!opts.silent) toast.error(getErrorMessage(e, "Erro ao carregar os rascunhos"));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(useCallback(() => load({ silent: true }), [load]));

  const filtered = (search
    ? items.filter((n) => `${n.customer_name} ${n.pending_client_send?.subject} ${n.pending_client_send?.to}`.toLowerCase().includes(search.toLowerCase()))
    : items
  // O mais antigo primeiro: o que está há mais tempo por confirmar é o que
  // mais precisa de atenção, não o que acabou de chegar.
  ).slice().sort((a, b) => (a.pending_client_send?.created_at || "").localeCompare(b.pending_client_send?.created_at || ""));

  const isStale = (iso) => iso && (Date.now() - new Date(iso).getTime()) > 24 * 60 * 60 * 1000;

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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-bold text-slate-900">{n.customer_name || "Sem nome"}</p>
                    {isStale(p?.created_at) ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Há mais de 24h</span>
                    ) : null}
                  </div>
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [sentKey, setSentKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 sm:text-sm">Toda a atividade de email</p>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
            <Mail className="h-6 w-6 text-slate-700 sm:h-8 sm:w-8" /> Emails
          </h1>
          <p className="text-sm text-slate-500">
            Caixa de entrada completa, enviados e rascunhos por confirmar — mesmo sem relação com um pedido registado.
          </p>
        </div>
        <Button data-testid="emails-compose-btn" onClick={() => setComposeOpen(true)} className="mt-2 h-10 shrink-0 rounded-xl sm:mt-1">
          <Pencil className="mr-1.5 h-4 w-4" /> Novo email
        </Button>
      </div>

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onSent={() => { setTab("sent"); setSentKey((k) => k + 1); }}
      />

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
        <TabsContent value="sent" className="focus-visible:outline-none"><SentTab key={sentKey} search={debounced} /></TabsContent>
        <TabsContent value="drafts" className="focus-visible:outline-none"><DraftsTab search={debounced} /></TabsContent>
      </Tabs>
    </div>
  );
}
