import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Waypoints, Download, RotateCcw, Clock, ArrowRight, History, Upload, Star,
} from "lucide-react";
import { toast } from "sonner";
import api, { API, getErrorMessage } from "@/lib/api";
import { withDeviceToken } from "@/lib/deviceAuth";
import { formatDateTime, timeAgo, getStatusCfg } from "@/lib/pedido";
import { previewKind } from "@/components/AttachmentPreviewDialog";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import FavoriteToggle from "@/components/FavoriteToggle";
import RelationGraph from "@/components/workspace/RelationGraph";

function fileUrl(f) {
  if (f.source === "note_file") return `${API}/notes/${f.note_id}/files/${f.id}`;
  if (f.source === "email_attachment") return `${API}/emails/${f.email_id}/attachments/${f.id}`;
  return `${API}/attachments/${f.id}`;
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function RelatedLink({ icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:border-input hover:bg-muted">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function PedidoDetailSection({ item, onNavigate }) {
  const note = item.data;
  const st = getStatusCfg(note.status);
  const [activities, setActivities] = useState([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [favorite, setFavorite] = useState(!!note.favorite);
  const navigate = useNavigate();

  useEffect(() => {
    setFavorite(!!note.favorite);
    api.get(`/notes/${item.id}/activities`).then(({ data }) => setActivities((data || []).slice(0, 6))).catch(() => setActivities([]));
  }, [item.id, note.favorite]);

  const toggleFav = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      await api.put(`/notes/${item.id}`, { favorite: next });
      toast.success(next ? "Adicionado aos favoritos" : "Removido dos favoritos");
    } catch (e) {
      setFavorite(!next);
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.dot }} />{st.label}
        </span>
      </div>
      {note.description ? <p className="text-xs text-muted-foreground">{note.description}</p> : null}
      {note.next_action ? (
        <div className="rounded-lg bg-muted p-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Próxima ação</p>
          <p className="mt-0.5 text-xs font-semibold text-foreground">{note.next_action}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => navigate(`/?open=${item.id}`)}>
          Abrir pedido
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setGraphOpen(true)}>
          <Waypoints className="mr-1.5 h-3.5 w-3.5" /> Ver grafo
        </Button>
        <button type="button" onClick={toggleFav} title="Favorito" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-amber-400">
          <Star className={`h-4 w-4 ${favorite ? "fill-amber-400 text-amber-400" : ""}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Relacionados</p>
        {note.customer_name ? <RelatedLink label={`Cliente: ${note.customer_name}`} onClick={() => onNavigate("pedido", item.id, note.customer_name)} /> : null}
        {note.supplier_id ? <RelatedLink label="Ver fornecedor" onClick={() => onNavigate("fornecedor", note.supplier_id, "Fornecedor")} /> : null}
      </div>
      {activities.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Linha temporal</p>
          <div className="space-y-1.5">
            {activities.map((a) => (
              <div key={a.id} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{a.message}</span>
                <span className="shrink-0 text-muted-foreground">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {graphOpen ? (
        <RelationGraph rootKind="pedido" rootId={item.id} rootLabel={note.customer_name || "Pedido"} onClose={() => setGraphOpen(false)} />
      ) : null}
    </div>
  );
}

function FornecedorDetailSection({ item, onNavigate }) {
  const s = item.data;
  const [graphOpen, setGraphOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Field label="Email" value={s.email} />
      <Field label="Telefone" value={s.phone} />
      <Field label="Notas" value={s.notes} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setGraphOpen(true)}>
          <Waypoints className="mr-1.5 h-3.5 w-3.5" /> Ver grafo
        </Button>
        <FavoriteToggle item={{ kind: "fornecedor", id: s.id, label: s.name, sublabel: s.email || s.phone || "", to: "/fornecedores" }} />
      </div>
      {graphOpen ? <RelationGraph rootKind="fornecedor" rootId={s.id} rootLabel={s.name} onClose={() => setGraphOpen(false)} /> : null}
    </div>
  );
}

function ClienteDetailSection({ item }) {
  const c = item.data;
  const [graphOpen, setGraphOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Field label="Telefone" value={c.phone} />
      <Field label="Email" value={c.email} />
      <Field label="Pedidos" value={`${c.pedidos_count} (${c.active_count} ativo${c.active_count === 1 ? "" : "s"})`} />
      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setGraphOpen(true)}>
        <Waypoints className="mr-1.5 h-3.5 w-3.5" /> Ver grafo
      </Button>
      {graphOpen ? <RelationGraph rootKind="cliente" rootId={c.key} rootLabel={c.name} onClose={() => setGraphOpen(false)} /> : null}
    </div>
  );
}

function EmailDetailSection({ item, onNavigate }) {
  const m = item.data;
  return (
    <div className="space-y-3">
      <Field label="De" value={m.supplier_name || m.from_name || m.from_email} />
      <Field label="Assunto" value={m.subject} />
      <Field label="Recebido" value={m.received_at ? formatDateTime(m.received_at) : ""} />
      {m.note_id ? <RelatedLink label="Ver pedido associado" onClick={() => onNavigate("pedido", m.note_id, "Pedido")} /> : null}
    </div>
  );
}

function TarefaDetailSection({ item, onNavigate }) {
  const t = item.data;
  return (
    <div className="space-y-3">
      <Field label="Data limite" value={t.due_date} />
      <Field label="Prioridade" value={t.priority !== "nenhuma" ? t.priority : ""} />
      <Field label="Secção" value={t.category} />
      {(t.labels || []).length > 0 ? <Field label="Etiquetas" value={t.labels.join(", ")} /> : null}
      {t.note_id ? <RelatedLink label="Ver pedido associado" onClick={() => onNavigate("pedido", t.note_id, "Pedido")} /> : null}
    </div>
  );
}

function FicheiroDetailSection({ item, onNavigate }) {
  const f = item.data;
  const [versions, setVersions] = useState(null);
  const [uploading, setUploading] = useState(false);
  const url = withDeviceToken(fileUrl(f));
  const kind = previewKind(f.filename, f.content_type);

  useEffect(() => {
    setVersions(null);
    if ((f.version_count || 1) <= 1) return;
    if (f.source === "attachment") {
      api.get(`/attachments/${f.id}/versions`).then(({ data }) => setVersions(data)).catch(() => setVersions([]));
    } else if (f.source === "note_file" && f.note_id) {
      api.get("/explorer/files", { params: { scope: `note:${f.note_id}` } })
        .then(({ data }) => setVersions((data.items || []).filter((v) => v.kind_label === f.kind_label).sort((a, b) => a.version - b.version)))
        .catch(() => setVersions([]));
    }
  }, [f.id, f.version_count, f.source, f.note_id, f.kind_label]);

  const canUploadVersion = f.source === "attachment";
  const uploadNewVersion = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const basePath = `/${f.supplier_id ? "suppliers" : "tasks"}/${f.supplier_id || f.task_id}/files/${f.id}/versions`;
      const fd = new FormData();
      fd.append("file", file);
      await api.post(basePath, fd);
      toast.success("Nova versão adicionada");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar a nova versão"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {kind === "image" ? (
        <img src={url} alt={f.filename} className="max-h-40 w-full rounded-lg border border-border bg-muted object-contain" />
      ) : kind === "pdf" ? (
        <iframe title={f.filename} src={url} className="h-40 w-full rounded-lg border border-border bg-card" />
      ) : null}
      <Field label="Fornecedor" value={f.supplier_label} />
      <Field label="Pedido" value={f.note_label} />
      <Field label="Tarefa" value={f.task_label} />
      <Field label="Recebido" value={f.created_at ? formatDateTime(f.created_at) : ""} />
      {f.version_count > 1 ? <Field label="Versão" value={`${f.version} de ${f.version_count}`} /> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <a href={url} download={f.filename} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs"><Download className="mr-1.5 h-3.5 w-3.5" /> Descarregar</Button>
        </a>
        {f.note_id ? (
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => onNavigate("pedido", f.note_id, f.note_label)}>Ver pedido</Button>
        ) : null}
        <FavoriteToggle item={{ kind: "pdf", id: `${f.source}-${f.id}`, label: f.filename, sublabel: f.kind_label, to: url, external: true }} />
      </div>
      {canUploadVersion ? (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border p-2 text-xs font-semibold text-muted-foreground hover:border-input hover:text-foreground">
          {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} Nova versão
          <input type="file" className="hidden" disabled={uploading} onChange={(e) => { uploadNewVersion(e.target.files); e.target.value = ""; }} />
        </label>
      ) : null}
      {versions && versions.length > 1 ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><History className="h-3 w-3" /> Versões</p>
          {versions.map((v) => (
            <a
              key={v.id} href={withDeviceToken(fileUrl(v))} target="_blank" rel="noreferrer"
              className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${v.is_current || v.id === f.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <span>v{v.version}</span>
              <span className="text-[11px] opacity-80">{timeAgo(v.created_at)}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const TRASH_RESTORE = {
  pedido: (id) => `/trash/notes/${id}/restore`,
  tarefa: (id) => `/trash/tasks/${id}/restore`,
  fornecedor: (id) => `/trash/suppliers/${id}/restore`,
};

function LixeiraDetailSection({ item }) {
  const it = item.data;
  const restore = async () => {
    try {
      await api.post(TRASH_RESTORE[it.kind](it.id));
      toast.success("Restaurado");
    } catch (e) { toast.error(getErrorMessage(e, "Não foi possível restaurar")); }
  };
  return (
    <div className="space-y-3">
      <Field label="Tipo" value={it.kind} />
      <Field label="Detalhe" value={it.sublabel} />
      <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={restore}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restaurar
      </Button>
    </div>
  );
}

function ProdutoDetailSection({ item }) {
  const p = item.data || {};
  return (
    <div className="space-y-3">
      <Field label="Descrição" value={p.descricao || p.description} />
      <Field label="Material" value={p.material} />
      <Field label="Fornecedor" value="Catálogo técnico (BandAluminios)" />
    </div>
  );
}

// Painel de detalhe do Explorador — o que aparece à direita das colunas
// para o item atualmente selecionado: metadados, pré-visualização,
// relacionados navegáveis e (para ficheiros) histórico de versões.
export default function ExplorerDetailPane({ item, onNavigate }) {
  if (!item) {
    return <p className="py-10 text-center text-xs text-muted-foreground">Seleciona um item para ver detalhes.</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="truncate font-heading text-sm font-extrabold text-foreground">{item.label}</p>
        {item.sublabel ? <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p> : null}
      </div>
      {item.kind === "pedido" ? <PedidoDetailSection item={item} onNavigate={onNavigate} /> : null}
      {item.kind === "fornecedor" ? <FornecedorDetailSection item={item} onNavigate={onNavigate} /> : null}
      {item.kind === "cliente" ? <ClienteDetailSection item={item} /> : null}
      {item.kind === "email" ? <EmailDetailSection item={item} onNavigate={onNavigate} /> : null}
      {item.kind === "tarefa" ? <TarefaDetailSection item={item} onNavigate={onNavigate} /> : null}
      {item.kind === "ficheiro" ? <FicheiroDetailSection item={item} onNavigate={onNavigate} /> : null}
      {item.kind === "lixeira" ? <LixeiraDetailSection item={item} /> : null}
      {item.kind === "produto" ? <ProdutoDetailSection item={item} /> : null}
    </div>
  );
}
