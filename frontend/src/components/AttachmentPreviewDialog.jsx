import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileWarning } from "lucide-react";

// Determina se um anexo pode ser mostrado embutido (PDF ou imagem) — para
// tudo o resto, o botão "Descarregar" continua a funcionar normalmente.
export function previewKind(filename, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  // startsWith em vez de === — um content-type com parâmetros
  // (ex.: "application/pdf;charset=binary") deixava de ser reconhecido.
  if (ct.startsWith("application/pdf")) return "pdf";
  const ext = (filename || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) return "image";
  if (ext.endsWith(".pdf")) return "pdf";
  return null;
}

// Pré-visualização de anexos (PDF/imagens) sem sair da página — o botão
// "Descarregar" fica sempre disponível, mesmo quando o tipo não é
// pré-visualizável embutido.
export default function AttachmentPreviewDialog({ open, onOpenChange, attachment }) {
  // Um URL expirado/quebrado antes disto ficava com uma imagem partida ou um
  // iframe em branco, sem qualquer pista de que algo correu mal.
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => { setPreviewFailed(false); }, [attachment?.url]);

  if (!attachment) return null;
  const kind = previewFailed ? null : previewKind(attachment.filename, attachment.contentType);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="attachment-preview" className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{attachment.filename}</p>
            <a href={attachment.url} download={attachment.filename} target="_blank" rel="noreferrer" className="shrink-0">
              <Button size="sm" variant="outline" className="rounded-xl" data-testid="attachment-download">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Descarregar
              </Button>
            </a>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-muted">
            {kind === "image" ? (
              <img src={attachment.url} alt={attachment.filename} onError={() => setPreviewFailed(true)} className="mx-auto max-h-[75vh] w-auto object-contain" />
            ) : kind === "pdf" ? (
              <iframe title={attachment.filename} src={attachment.url} onError={() => setPreviewFailed(true)} className="h-[75vh] w-full border-0 bg-card" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-warning">
                <FileWarning className="h-6 w-6" />
                Pré-visualização não disponível para este tipo de ficheiro.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
