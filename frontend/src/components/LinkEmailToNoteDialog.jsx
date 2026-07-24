import { toast } from "sonner";

import api, { getErrorMessage } from "@/lib/api";
import { getStatusCfg } from "@/lib/pedido";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import PedidoPicker from "@/components/PedidoPicker";

// Associa um email recebido (ex.: um orçamento respondido fora do fluxo
// automático) a um pedido já existente. A pesquisa/seleção de pedido (com
// filtro por tipo — Cliente/Geral/Banda Alumínios) vem de PedidoPicker,
// partilhado com o compositor de email (ComposeEmailDialog.jsx).
export default function LinkEmailToNoteDialog({ email, onOpenChange, onLinked }) {
  const open = !!email;

  const link = async ({ note_id }) => {
    try {
      const { data } = await api.post(`/emails/${email.id}/link-note`, { note_id });
      const base = "Email associado ao pedido";
      toast.success(data.status_changed ? `${base} — estado passou a "${getStatusCfg(data.status).label}"` : base);
      onLinked?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível associar o email"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="link-email-dialog" className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="font-heading text-lg font-extrabold tracking-tight">Associar a um pedido</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {email ? `${email.from_name || email.from_email} — ${email.subject || "(sem assunto)"}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {open ? (
            <PedidoPicker testIdPrefix="link-email" selected={null} onSelect={link} onClear={() => {}} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
