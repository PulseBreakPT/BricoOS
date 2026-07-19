import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileWarning } from "lucide-react";

// Determina se um anexo pode ser mostrado embutido (PDF ou imagem) — para
// tudo o resto, o botão "Descarregar" continua a funcionar normalmente.
export function previewKind(filename, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct === "application/pdf") return "pdf";
  const ext = (filename || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) return "image";
  if (ext.endsWith(".pdf")) return "pdf";
  return null;
}

// Pré-visualização de anexos (PDF/imagens) sem sair da página — o botão
// "Descarregar" fica sempre disponível, mesmo quando o tipo não é
// pré-visualizável embutido.
export default function AttachmentPreviewDialog({ open, onOpenChange, attachment }) {
  if (!attachment) return null;
  const kind = previewKind(attachment.filename, attachment.contentType);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="attachment-preview" className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{attachment.filename}</p>
            <a href={attachment.url} download={attachment.filename} target="_blank" rel="noreferrer" className="shrink-0">
              <Button size="sm" variant="outline" className="rounded-xl" data-testid="attachment-download">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Descarregar
              </Button>
            </a>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
            {kind === "image" ? (
              <img src={attachment.url} alt={attachment.filename} className="mx-auto max-h-[75vh] w-auto object-contain" />
            ) : kind === "pdf" ? (
              <iframe title={attachment.filename} src={attachment.url} className="h-[75vh] w-full border-0 bg-white" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-500">
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
