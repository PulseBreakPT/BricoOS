import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// Novo email livre — sem depender de um pedido em curso. Sugestões de
// destinatário vêm de clientes/fornecedores com email guardado, mas
// qualquer endereço pode ser escrito à mão.
export default function ComposeEmailDialog({ open, onOpenChange, onSent }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    if (!open) { setTo(""); setSubject(""); setBody(""); return; }
    api.get("/emails/contacts").then(({ data }) => setContacts(data.items)).catch(() => {});
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (open) api.get("/emails/contacts", { params: { search: to || undefined } }).then(({ data }) => setContacts(data.items)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [to, open]);

  const send = async () => {
    setSending(true);
    try {
      const label = contacts.find((c) => c.email === to.trim())?.label || "";
      await api.post("/emails/compose", { to: to.trim(), subject: subject.trim(), body, to_label: label });
      toast.success(`Email enviado a ${to.trim()}`);
      onOpenChange(false);
      onSent && onSent();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar o email"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="compose-email-dialog" className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="font-heading text-lg font-extrabold tracking-tight">Novo email</DialogTitle>
          <p className="text-xs text-slate-500">Escreva livremente — não fica associado a nenhum pedido.</p>
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
          <div className="mt-3 space-y-1.5">
            <Label>Assunto</Label>
            <Input data-testid="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea data-testid="compose-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
          <Button
            data-testid="compose-send-btn"
            onClick={send}
            disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
            className="rounded-xl"
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
