import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Trash2, Send, Copy, Mail, Plus, Trophy, Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";
import api, { API } from "@/lib/api";
import { CATEGORY_LIST, STATUS } from "@/lib/categories";

const emptyNote = {
  customer_name: "", phone: "", description: "", details: "",
  category: "construcao", measurements: "", status: "aberto",
};

const buildEmail = (note) => {
  const subject = `Pedido de orçamento - ${note.description || "artigo"}`;
  const lines = [
    "Boa tarde,",
    "",
    "Somos o Bricomarché de Faro e gostaríamos de solicitar um orçamento para o seguinte artigo:",
    "",
    `Artigo: ${note.description || "-"}`,
  ];
  if (note.measurements) lines.push(`Medidas: ${note.measurements}`);
  if (note.details) lines.push(`Notas: ${note.details}`);
  lines.push("", "Agradecemos o envio do melhor preço e prazo de entrega disponíveis.", "",
    "Com os melhores cumprimentos,", "Bricomarché Faro");
  return { subject, body: lines.join("\n") };
};

export default function NoteDialog({ open, onOpenChange, note, suppliers, gmailStatus, onSaved, onGmailChange }) {
  const isEdit = Boolean(note && note.id);
  const [form, setForm] = useState(emptyNote);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("detalhes");

  const [quotes, setQuotes] = useState([]);
  const [newQuote, setNewQuote] = useState({ supplier_name: "", product: "", price: "", notes: "" });
  const [emailSupplier, setEmailSupplier] = useState("");
  const [emailData, setEmailData] = useState({ subject: "", body: "" });
  const [sending, setSending] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setTab("detalhes");
      setForm(note ? { ...emptyNote, ...note } : emptyNote);
      setNewQuote({ supplier_name: "", product: "", price: "", notes: "" });
      setEmailSupplier("");
      if (note) setEmailData(buildEmail(note));
    }
  }, [open, note]);

  const loadQuotes = useCallback(async () => {
    if (!isEdit) return;
    const { data } = await api.get(`/notes/${note.id}/quotes`);
    setQuotes(data);
  }, [isEdit, note]);

  useEffect(() => {
    if (open && isEdit) loadQuotes();
  }, [open, isEdit, loadQuotes]);

  const save = async () => {
    if (!form.customer_name && !form.description) {
      toast.error("Preencha o nome do cliente ou a descrição.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/notes/${note.id}`, form);
        toast.success("Nota atualizada");
      } else {
        await api.post("/notes", form);
        toast.success("Nota criada");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao guardar a nota");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.delete(`/notes/${note.id}`);
    toast.success("Nota eliminada");
    onSaved();
    onOpenChange(false);
  };

  const addQuote = async () => {
    if (!newQuote.supplier_name || !newQuote.price) {
      toast.error("Indique o fornecedor e o preço.");
      return;
    }
    await api.post(`/notes/${note.id}/quotes`, {
      supplier_name: newQuote.supplier_name,
      product: newQuote.product || form.description,
      price: parseFloat(newQuote.price),
      notes: newQuote.notes,
    });
    setNewQuote({ supplier_name: "", product: "", price: "", notes: "" });
    toast.success("Orçamento adicionado");
    loadQuotes();
    onSaved();
  };

  const deleteQuote = async (qid) => {
    await api.delete(`/notes/${note.id}/quotes/${qid}`);
    loadQuotes();
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(`${emailData.subject}\n\n${emailData.body}`);
    toast.success("Email copiado para a área de transferência");
  };

  const sendEmail = async () => {
    if (!emailSupplier) {
      toast.error("Escolha um fornecedor.");
      return;
    }
    setSending(true);
    try {
      await api.post(`/notes/${note.id}/send-quote-request`, {
        supplier_id: emailSupplier,
        subject: emailData.subject,
        body: emailData.body,
      });
      toast.success("Email enviado ao fornecedor!");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao enviar o email");
    } finally {
      setSending(false);
    }
  };

  const connectGmail = () => {
    window.location.href = `${API}/gmail/connect`;
  };

  const lowest = quotes.length
    ? Math.min(...quotes.filter((q) => q.price > 0).map((q) => q.price))
    : null;

  const selectedSupplier = suppliers.find((s) => s.id === emailSupplier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="note-dialog"
        className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle className="font-heading text-xl font-bold tracking-tight">
            {isEdit ? "Editar nota" : "Nova nota de cliente"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {isEdit ? "Detalhes, medidas e orçamentos de fornecedores." : "Registe o pedido do cliente."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="detalhes" data-testid="tab-detalhes">Detalhes</TabsTrigger>
              <TabsTrigger value="orcamentos" data-testid="tab-orcamentos" disabled={!isEdit}>
                Orçamentos
              </TabsTrigger>
            </TabsList>
          </div>

          {/* DETALHES */}
          <TabsContent value="detalhes" className="mt-0 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome do cliente</Label>
                <Input
                  data-testid="input-customer-name"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="Ex.: Teresa Mera"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  data-testid="input-phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="Ex.: 917100512"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label>Descrição / pedido</Label>
              <Input
                data-testid="input-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Ex.: Janela de correr alumínio"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Secção</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_LIST.map((c) => (
                      <SelectItem key={c.key} value={c.key} data-testid={`category-option-${c.key}`}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Medidas / à medida</Label>
                <Input
                  data-testid="input-measurements"
                  value={form.measurements}
                  onChange={(e) => set("measurements", e.target.value)}
                  placeholder="Ex.: 2000x1000mm"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label>Notas adicionais</Label>
              <Textarea
                data-testid="input-details"
                value={form.details}
                onChange={(e) => set("details", e.target.value)}
                placeholder="Detalhes, cor, referência, prazo..."
                rows={3}
              />
            </div>

            <div className="mt-4 space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger data-testid="select-status" className="sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-7 flex items-center gap-3">
              <Button data-testid="save-note-btn" onClick={save} disabled={saving} className="flex-1 rounded-xl">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEdit ? "Guardar alterações" : "Criar nota"}
              </Button>
              {isEdit ? (
                <Button
                  data-testid="delete-note-btn"
                  variant="outline"
                  onClick={remove}
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </TabsContent>

          {/* ORCAMENTOS */}
          <TabsContent value="orcamentos" className="mt-0 overflow-y-auto px-6 py-5">
            {/* Pedir preço */}
            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-700" />
                <h4 className="font-heading text-sm font-extrabold text-slate-900">Pedir preço a fornecedor</h4>
              </div>

              {!gmailStatus?.connected ? (
                <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Gmail ainda não está ligado</p>
                    <p className="text-xs">
                      Pode ligar o Gmail para enviar automaticamente, ou copiar o email e enviar manualmente.
                    </p>
                    {gmailStatus?.configured ? (
                      <Button
                        data-testid="connect-gmail-inline"
                        size="sm"
                        onClick={connectGmail}
                        className="mt-2 h-8 rounded-lg bg-amber-600 hover:bg-amber-700"
                      >
                        Ligar Gmail
                      </Button>
                    ) : (
                      <p className="mt-1 text-xs">Credenciais Google por configurar no servidor.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Ligado como {gmailStatus.email}
                </div>
              )}

              <div className="mt-4 space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={emailSupplier} onValueChange={setEmailSupplier}>
                  <SelectTrigger data-testid="select-email-supplier">
                    <SelectValue placeholder="Escolher fornecedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">Sem fornecedores. Adicione em "Fornecedores".</div>
                    ) : (
                      suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.email ? ` · ${s.email}` : " · (sem email)"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedSupplier && !selectedSupplier.email ? (
                  <p className="text-xs text-red-500">Este fornecedor não tem email. Adicione em "Fornecedores".</p>
                ) : null}
              </div>

              <div className="mt-3 space-y-1.5">
                <Label>Assunto</Label>
                <Input
                  data-testid="input-email-subject"
                  value={emailData.subject}
                  onChange={(e) => setEmailData((d) => ({ ...d, subject: e.target.value }))}
                />
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Mensagem</Label>
                <Textarea
                  data-testid="input-email-body"
                  value={emailData.body}
                  onChange={(e) => setEmailData((d) => ({ ...d, body: e.target.value }))}
                  rows={7}
                  className="font-mono text-xs"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  data-testid="send-email-btn"
                  onClick={sendEmail}
                  disabled={sending || !gmailStatus?.connected}
                  className="rounded-xl"
                >
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Enviar por Gmail
                </Button>
                <Button data-testid="copy-email-btn" variant="outline" onClick={copyEmail} className="rounded-xl">
                  <Copy className="mr-2 h-4 w-4" /> Copiar email
                </Button>
              </div>
            </section>

            {/* Comparar orçamentos */}
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-slate-700" />
                <h4 className="font-heading text-sm font-extrabold text-slate-900">Comparar orçamentos recebidos</h4>
              </div>

              <div className="mt-3 space-y-2">
                {quotes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                    Ainda sem orçamentos. Adicione os preços recebidos abaixo.
                  </p>
                ) : (
                  quotes.map((q) => {
                    const isBest = q.price === lowest && q.price > 0;
                    return (
                      <div
                        key={q.id}
                        data-testid={`quote-row-${q.id}`}
                        className={`flex items-center justify-between rounded-xl border p-3 ${
                          isBest ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{q.supplier_name}</p>
                            {isBest ? (
                              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                Melhor preço
                              </span>
                            ) : null}
                          </div>
                          {q.product ? <p className="truncate text-xs text-slate-500">{q.product}</p> : null}
                          {q.notes ? <p className="truncate text-xs text-slate-400">{q.notes}</p> : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-base font-bold ${isBest ? "text-emerald-700" : "text-slate-900"}`}>
                            {q.price.toFixed(2)} €
                          </span>
                          <button
                            data-testid={`delete-quote-${q.id}`}
                            onClick={() => deleteQuote(q.id)}
                            className="rounded-lg p-1 text-slate-300 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
                <Input
                  data-testid="quote-supplier-input"
                  placeholder="Fornecedor"
                  value={newQuote.supplier_name}
                  onChange={(e) => setNewQuote((q) => ({ ...q, supplier_name: e.target.value }))}
                />
                <Input
                  data-testid="quote-price-input"
                  type="number"
                  placeholder="Preço (€)"
                  value={newQuote.price}
                  onChange={(e) => setNewQuote((q) => ({ ...q, price: e.target.value }))}
                  className="font-mono"
                />
                <Input
                  data-testid="quote-product-input"
                  placeholder="Artigo (opcional)"
                  value={newQuote.product}
                  onChange={(e) => setNewQuote((q) => ({ ...q, product: e.target.value }))}
                />
                <Input
                  data-testid="quote-notes-input"
                  placeholder="Nota (prazo, ref...)"
                  value={newQuote.notes}
                  onChange={(e) => setNewQuote((q) => ({ ...q, notes: e.target.value }))}
                />
                <Button data-testid="add-quote-btn" onClick={addQuote} className="rounded-xl sm:col-span-2">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar orçamento
                </Button>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
