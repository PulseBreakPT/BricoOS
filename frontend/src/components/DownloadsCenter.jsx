import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Image as ImageIcon, Download, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { Spinner } from "@/components/ui/spinner";
import { timeAgo } from "@/lib/pedido";
import QuickPeekTrigger from "@/components/QuickPeek";

function fileUrl(item) {
  return item.source === "note_file"
    ? `${API}/notes/${item.note_id}/files/${item.id}`
    : `${API}/emails/${item.email_id}/attachments/${item.id}`;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

// Centro de Downloads — tudo o que entrou ou foi gerado, num único sítio:
// orçamentos de fornecedor, orçamentos ao cliente, fotos, anexos de email.
// Não substitui a ficha do pedido (que continua a ser onde se trabalha um
// ficheiro); é só o atalho para encontrar rapidamente "aquele PDF de
// terça-feira" sem saber já a que pedido pertence.
export default function DownloadsCenter() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/system/downloads")
      .then(({ data }) => setItems(data.items))
      .catch((e) => toast.error(getErrorMessage(e, "Erro ao carregar os downloads")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>;
  }
  if (items.length === 0) {
    return <p className="py-10 text-center text-xs text-muted-foreground">Ainda sem ficheiros guardados.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-xs text-muted-foreground">
        {items.length} ficheiro{items.length === 1 ? "" : "s"} — orçamentos, fotos e anexos de email, tudo num só lugar.
      </p>
      {items.map((it) => {
        const isImage = IMAGE_RE.test(it.filename);
        const Icon = isImage ? ImageIcon : FileText;
        return (
          <QuickPeekTrigger
            key={`${it.source}-${it.id}`}
            as="div"
            data-testid={`download-item-${it.id}`}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5"
            renderPeek={() => (
              isImage ? (
                <div className="space-y-2">
                  <img src={withDeviceToken(fileUrl(it))} alt={it.filename} className="max-h-56 w-full rounded-lg bg-muted object-contain" />
                  <p className="truncate text-xs font-bold text-foreground">{it.filename}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {it.kind_label}{it.note_label ? ` · ${it.note_label}` : ""} · {timeAgo(it.created_at)}
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{it.filename}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.kind_label}{it.note_label ? ` · ${it.note_label}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(it.created_at)}</p>
                  </div>
                </div>
              )
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">{it.filename}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {it.kind_label}{it.note_label ? ` · ${it.note_label}` : ""} · {timeAgo(it.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {it.note_id ? (
                <button
                  type="button"
                  title="Abrir pedido"
                  onClick={() => navigate(`/?open=${it.note_id}`)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <a
                href={withDeviceToken(fileUrl(it))}
                target="_blank"
                rel="noreferrer"
                title="Descarregar"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </QuickPeekTrigger>
        );
      })}
    </div>
  );
}
