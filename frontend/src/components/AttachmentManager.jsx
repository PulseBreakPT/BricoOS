import { useEffect, useState } from "react";
import { FileText, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { Spinner } from "@/components/ui/spinner";

// Anexos reutilizável — fornecedor ou tarefa (pedidos já têm o seu próprio
// fluxo de anexos/fotos). "Tudo pode ter anexos" (lógica base 15): emails e
// pedidos já suportavam ficheiros, isto estende o mesmo direito ao resto.
export default function AttachmentManager({ ownerKind, ownerId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const basePath = `/${ownerKind === "supplier" ? "suppliers" : "tasks"}/${ownerId}/files`;

  const load = () => {
    setLoading(true);
    api.get(basePath).then(({ data }) => setFiles(data)).catch(() => setFiles([])).finally(() => setLoading(false));
  };
  useEffect(() => { if (ownerId) load(); }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (fileList) => {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f));
      await api.post(basePath, fd);
      toast.success(`${list.length} ficheiro${list.length === 1 ? "" : "s"} adicionado${list.length === 1 ? "" : "s"}`);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível adicionar o ficheiro"));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (fileId) => {
    try {
      await api.delete(`${basePath}/${fileId}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível remover o ficheiro"));
    }
  };

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex justify-center py-3"><Spinner className="h-4 w-4 text-muted-foreground" /></div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem anexos.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} data-testid={`attachment-${f.id}`} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a href={withDeviceToken(`${API}/attachments/${f.id}`)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground hover:underline">
                {f.filename}
              </a>
              <button type="button" data-testid={`attachment-remove-${f.id}`} onClick={() => remove(f.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border p-2 text-xs font-semibold text-muted-foreground hover:border-input hover:text-foreground">
        {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} Adicionar ficheiro
        <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
  );
}
