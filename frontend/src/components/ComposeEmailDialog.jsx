import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Send, Paperclip, FileText, X, Clock } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Novo email livre (ou reencaminhamento de um recebido, quando a prop
// `forward` é passada) — sem depender de um pedido em curso. Sugestões de
// destinatário vêm de clientes/fornecedores com email guardado, mas
// qualquer endereço pode ser escrito à mão.
export default function ComposeEmailDialog({ open, onOpenChange, onSent, forward }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setTo(""); setSubject(""); setBody(""); setAttachments([]); setScheduleOn(false); setScheduleAt("");
      return;
    }
    if (forward) setSubject(forward.subject || "");
    api.get("/emails/contacts").then(({ data }) => setContacts(data.items)).catch(() => {});
    if (!forward) api.get("/email-templates").then(({ data }) => setTemplates(data)).catch(() => {});
  }, [open, forward]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (open) api.get("/emails/contacts", { params: { search: to || undefined } }).then(({ data }) => setContacts(data.items)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [to, open]);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const encoded = await Promise.all(files.map(async (f) => ({ filename: f.name, size: f.size, data_b64: await readFileAsBase64(f) })));
    setAttachments((prev) => {
      const next = [...prev, ...encoded];
      const total = next.reduce((sum, a) => sum + a.size, 0);
      if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
        toast.error("Anexos demasiado grandes (máx. 20 MB no total).");
        return prev;
      }
      return next;
    });
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject || "");
    setBody(t.body || "");
  };

  const send = async () => {
    setSending(true);
    try {
      if (forward) {
        await api.post(`/emails/${forward.emailId}/forward`, { to: to.trim(), note: body });
        toast.success(`Email reencaminhado para ${to.trim()}`);
      } else {
        const label = contacts.find((c) => c.email === to.trim())?.label || "";
        const payload = {
          to: to.trim(), subject: subject.trim(), body, to_label: label,
          attachments: attachments.map((a) => ({ filename: a.filename, data_b64: a.data_b64 })),
        };
        if (scheduleOn && scheduleAt) payload.scheduled_at = new Date(scheduleAt).toISOString().replace("Z", "+00:00");
        const { data } = await api.post("/emails/compose", payload);
        toast.success(data.scheduled ? `Email agendado para ${to.trim()}` : `Email enviado a ${to.trim()}`);
      }
      onOpenChange(false);
      onSent && onSent();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar o email"));
    } finally {
      setSending(false);
    }
  };

  const canSend = !!to.trim() && (forward || (!!subject.trim() && !!body.trim() && (!scheduleOn || !!scheduleAt)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="compose-email-dialog" className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="font-heading text-lg font-extrabold tracking-tight">
            {forward ? "Reencaminhar email" : "Novo email"}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {forward ? `Assunto original: ${forward.subject || "(sem assunto)"}` : "Escreve livremente — não fica associado a nenhum pedido."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label>Para</Label>
            <Input
              data-testid="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@exemplo.com"
              list="compose-email-contacts"
              autoFocus
            />
            <datalist id="compose-email-contacts">
              {contacts.map((c) => (
                <option key={c.email} value={c.email}>{c.label} — {c.kind === "supplier" ? "Fornecedor" : "Cliente"}</option>
              ))}
            </datalist>
          </div>

          {!forward ? (
            <div className="mt-3 space-y-1.5">
              <Label>Assunto</Label>
              <Input data-testid="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          ) : null}

          {!forward && templates.length > 0 ? (
            <div className="mt-3">
              <Select onValueChange={applyTemplate}>
                <SelectTrigger data-testid="compose-template-select" className="h-9 w-auto min-w-[200px] text-xs">
                  <SelectValue placeholder="Inserir modelo..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="mt-3 space-y-1.5">
            <Label>{forward ? "Nota (opcional)" : "Mensagem"}</Label>
            <Textarea
              data-testid="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={forward ? 5 : 9}
              placeholder={forward ? "Adiciona uma nota antes da mensagem reencaminhada..." : undefined}
            />
          </div>

          {forward ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <p className="font-bold text-slate-600">Mensagem original</p>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">{forward.body || "(sem texto)"}</pre>
              {forward.attachmentsCount ? (
                <p className="mt-2 text-[11px]">{forward.attachmentsCount} anexo(s) original(is) incluído(s) automaticamente.</p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mt-3">
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <Button type="button" data-testid="compose-attach-btn" variant="outline" size="sm"
                  onClick={() => fileInputRef.current?.click()} className="h-8 rounded-lg text-xs">
                  <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Anexar ficheiros
                </Button>
                {attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attachments.map((a, i) => (
                      <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                        <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="max-w-[45vw] truncate sm:max-w-[200px]">{a.filename}</span>
                        <button type="button" onClick={() => removeAttachment(i)} className="shrink-0 text-slate-400 hover:text-red-600">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Switch data-testid="compose-schedule-toggle" checked={scheduleOn} onCheckedChange={setScheduleOn} id="compose-schedule" />
                <Label htmlFor="compose-schedule" className="cursor-pointer text-sm font-normal">Agendar envio</Label>
              </div>
              {scheduleOn ? (
                <Input
                  data-testid="compose-schedule-at"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="mt-2"
                />
              ) : null}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
          <Button
            data-testid="compose-send-btn"
            onClick={send}
            disabled={sending || !canSend}
            className="rounded-xl"
          >
            {sending ? <Spinner className="mr-2 h-4 w-4" /> : scheduleOn && !forward ? <Clock className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
            {forward ? "Reencaminhar" : scheduleOn ? "Agendar envio" : "Enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
