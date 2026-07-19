import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Send, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";

// Ecrã de confirmação do envio ao cliente. Tudo já vem preparado pelo
// servidor (assunto, mensagem e PDF com preços finais em anexo); aqui o
// utilizador revê, altera o que quiser e confirma — ou cancela. Nada é
// enviado sem passar por este ecrã.
export default function ConfirmSendDialog({ open, onOpenChange, note, onDone }) {
  const pending = note?.pending_client_send || null;
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    if (open && pending) {
      setTo(pending.to || note?.email || "");
      setSubject(pending.subject || "");
      setBody(pending.body || "");
    }
  }, [open, pending, note]);

  if (!note || !pending) return null;

  const send = async () => {
    setSending(true);
    try {
      await api.post(`/notes/${note.id}/send-client-quote`, {
        to, subject, body, pdf_file_id: pending.pdf_file_id || "",
      });
      toast.success(`Orçamento enviado a ${to}`);
      onOpenChange(false);
      onDone && onDone();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar o email"));
    } finally {
      setSending(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Descartar o rascunho preparado? Nada foi enviado e o PDF continua guardado no pedido.")) return;
    setDiscarding(true);
    try {
      await api.delete(`/notes/${note.id}/pending-client-send`);
      toast.message("Rascunho descartado — nada foi enviado.");
      onOpenChange(false);
      onDone && onDone();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível descartar"));
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="confirm-send-dialog" className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
          <DialogTitle className="font-heading text-lg font-extrabold tracking-tight">
            Confirmar envio ao cliente
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {note.customer_name || "Cliente"} · preparado automaticamente — revê e confirma. Nada é enviado sem a tua confirmação.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* PDF anexado */}
          <a
            data-testid="confirm-send-pdf"
            href={withDeviceToken(`${API}/notes/${note.id}/files/${pending.pdf_file_id}`)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900">{pending.pdf_filename || "Orçamento (PDF)"}</span>
              <span className="block text-xs text-slate-500">
                {pending.total != null ? `${Number(pending.total).toFixed(2)} € c/ IVA` : ""}
                {pending.eff_margin_pct != null ? ` · margem final ${Number(pending.eff_margin_pct).toFixed(1)}%` : ""}
                {" · toca para rever o PDF"}
              </span>
            </span>
          </a>

          <div className="mt-4 space-y-1.5">
            <Label>Para</Label>
            <Input data-testid="confirm-send-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email do cliente" />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>Assunto</Label>
            <Input data-testid="confirm-send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={pending.subject_needs_review ? "border-amber-400 bg-amber-50" : ""} />
            {pending.subject_needs_review ? (
              <p data-testid="subject-review-warning" className="text-xs text-amber-700">
                {(pending.obra_candidates || []).length > 1
                  ? `O PDF tem vários números de obra possíveis (${pending.obra_candidates.join(", ")}) — confirma o assunto antes de enviar.`
                  : "Não foi possível ler o número da obra no PDF — confirma o assunto antes de enviar."}
              </p>
            ) : (
              pending.obra ? <p className="text-[11px] text-slate-400">Nº da obra lido automaticamente do PDF: {pending.obra}</p> : null
            )}
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea data-testid="confirm-send-body" value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="font-mono text-xs" />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button data-testid="confirm-send-btn" onClick={send} disabled={sending || discarding || !to.trim()} className="rounded-xl">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Confirmar e enviar
            </Button>
            <Button data-testid="confirm-send-discard" variant="outline" onClick={discard} disabled={sending || discarding} className="rounded-xl border-red-200 text-red-600 hover:bg-red-50">
              {discarding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Descartar
            </Button>
            <p className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Envio só com confirmação
            </p>
          </div>
          {!to.trim() ? <p className="mt-1.5 text-xs text-amber-600">Falta o email do cliente — preenche «Para» ou adiciona-o nos Detalhes do pedido.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
