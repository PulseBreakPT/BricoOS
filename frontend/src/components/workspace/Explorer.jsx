import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { ROOT_FOLDERS, SMART_SPACES, iconForItem } from "@/lib/explorerFolders";
import api from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import ExplorerDetailPane from "@/components/workspace/ExplorerDetailPane";

// Entidades "contentoras" — ao clicar, abrem os seus relacionados numa
// nova coluna. As restantes (ficheiro/email/tarefa/produto/lixeira) são
// folhas: só selecionam, mostrando o painel de detalhe à direita.
const DRILLABLE = new Set(["pedido", "cliente", "fornecedor"]);

function relatedToNodes(kind, data) {
  if (kind === "pedido") {
    const nodes = [];
    if (data.fornecedor) {
      nodes.push({ kind: "fornecedor", id: data.fornecedor.id, label: data.fornecedor.name, sublabel: "Fornecedor", data: data.fornecedor });
    }
    (data.emails || []).forEach((m) => nodes.push({
      kind: "email", id: m.id, label: m.supplier_name || m.from_name || m.from_email,
      sublabel: m.subject || "(sem assunto)", data: m,
    }));
    (data.ficheiros || []).filter((f) => f.is_current).forEach((f) => nodes.push({
      kind: "ficheiro", id: f.id, label: f.version_count > 1 ? `${f.filename} (v${f.version})` : f.filename,
      sublabel: f.kind_label, data: f,
    }));
    (data.notas || []).forEach((t) => nodes.push({ kind: "tarefa", id: t.id, label: t.title, sublabel: t.due_date || "sem data", data: t }));
    return nodes;
  }
  if (kind === "cliente") {
    return (data.items || []).map((n) => ({
      kind: "pedido", id: n.id, label: n.customer_name || "Sem nome", sublabel: n.description || "", data: n,
    }));
  }
  if (kind === "fornecedor") {
    const nodes = (data.pedidos || []).map((n) => ({
      kind: "pedido", id: n.id, label: n.customer_name || "Sem nome", sublabel: n.description || "", data: n,
    }));
    (data.ficheiros || []).filter((f) => f.is_current).forEach((f) => nodes.push({
      kind: "ficheiro", id: f.id, label: f.version_count > 1 ? `${f.filename} (v${f.version})` : f.filename,
      sublabel: f.kind_label, data: f,
    }));
    return nodes;
  }
  return [];
}

async function fetchRelated(kind, id) {
  if (kind === "cliente") {
    const { data } = await api.get(`/explorer/clients/${encodeURIComponent(id)}`);
    return relatedToNodes(kind, data);
  }
  const { data } = await api.get("/explorer/related", { params: { kind, id } });
  return relatedToNodes(kind, data);
}

function FolderRow({ folder, onClick }) {
  const Icon = folder.icon;
  return (
    <button
      type="button"
      data-testid={`explorer-folder-${folder.key}`}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {folder.label}
    </button>
  );
}

function ItemRow({ item, active, onClick }) {
  const Icon = iconForItem(item);
  return (
    <button
      type="button"
      data-testid={`explorer-item-${item.kind}-${item.id}`}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${active ? "bg-foreground text-background" : "text-foreground hover:bg-muted"}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{item.label}</span>
        {item.sublabel ? <span className={`block truncate text-[11px] ${active ? "text-muted-foreground" : "text-muted-foreground"}`}>{item.sublabel}</span> : null}
      </span>
      {DRILLABLE.has(item.kind) ? <span className={`text-[10px] ${active ? "text-muted-foreground" : "text-muted-foreground"}`}>›</span> : null}
    </button>
  );
}

function ExplorerColumn({ column, query, selectedId, onOpenFolder, onOpenItem }) {
  if (column.type === "root") {
    return (
      <div className="w-56 shrink-0 overflow-y-auto border-r border-border p-1.5">
        <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Loja</p>
        {ROOT_FOLDERS.map((f) => <FolderRow key={f.key} folder={f} onClick={() => onOpenFolder(f)} />)}
        <p className="mt-3 px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Espaços inteligentes</p>
        {SMART_SPACES.map((f) => <FolderRow key={f.key} folder={f} onClick={() => onOpenFolder(f)} />)}
      </div>
    );
  }
  if (column.type === "loading") {
    return <div className="flex w-56 shrink-0 items-center justify-center border-r border-border p-4"><Spinner className="h-4 w-4 text-muted-foreground" /></div>;
  }
  const term = query.trim().toLowerCase();
  const filtered = term ? column.items.filter((it) => `${it.label} ${it.sublabel}`.toLowerCase().includes(term)) : column.items;
  return (
    <div className="w-64 shrink-0 overflow-y-auto border-r border-border p-1.5">
      <p className="truncate px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
        {column.label} ({filtered.length})
      </p>
      {filtered.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">{column.error ? "Erro ao carregar." : "Vazio."}</p> : null}
      {filtered.map((it) => (
        <ItemRow key={`${it.kind}-${it.id}`} item={it} active={selectedId === it.id} onClick={() => onOpenItem(it)} />
      ))}
    </div>
  );
}

// Explorador Inteligente — toda a informação da loja organizada em pastas
// virtuais (nada existe fisicamente num sítio: são vistas calculadas sobre
// pedidos/fornecedores/emails/ficheiros já existentes) com navegação em
// colunas, ao estilo do Finder do macOS: cada entidade "contentora"
// (pedido/cliente/fornecedor) abre os seus relacionados numa coluna nova à
// direita; ficheiros/emails/tarefas são folhas — selecionam e mostram o
// painel de detalhe.
export default function Explorer() {
  const [columns, setColumns] = useState([{ type: "root" }]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  // Um clique rápido noutra pasta/item da mesma coluna dispara um novo
  // pedido antes do anterior responder — sem sequência por índice, a
  // resposta mais lenta podia chegar depois e substituir a coluna certa
  // pela do clique já abandonado.
  const columnSeqRef = useRef({});

  const openFolder = async (folder, atIndex) => {
    const seq = (columnSeqRef.current[atIndex] = (columnSeqRef.current[atIndex] || 0) + 1);
    setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "loading" }]);
    setSelected(null);
    try {
      const items = await folder.fetch();
      if (columnSeqRef.current[atIndex] !== seq) return;
      setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "items", label: folder.label, items }]);
    } catch {
      if (columnSeqRef.current[atIndex] !== seq) return;
      setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "items", label: folder.label, items: [], error: true }]);
    }
  };

  const openItem = async (item, atIndex) => {
    setSelected(item);
    columnSeqRef.current[atIndex] = (columnSeqRef.current[atIndex] || 0) + 1;
    if (!DRILLABLE.has(item.kind)) {
      setColumns((prev) => prev.slice(0, atIndex + 1));
      return;
    }
    const seq = columnSeqRef.current[atIndex];
    setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "loading" }]);
    try {
      const items = await fetchRelated(item.kind, item.id);
      if (columnSeqRef.current[atIndex] !== seq) return;
      setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "items", label: item.label, items }]);
    } catch {
      if (columnSeqRef.current[atIndex] !== seq) return;
      setColumns((prev) => [...prev.slice(0, atIndex + 1), { type: "items", label: item.label, items: [], error: true }]);
    }
  };

  // Reenraíza a navegação a partir de qualquer sítio — ex.: um link em
  // "Relacionados" no painel de detalhe salta direto para essa entidade,
  // sem ter de reconstruir o caminho de colunas manualmente.
  const openEntity = (kind, id, label) => {
    setColumns([{ type: "root" }]);
    openItem({ kind, id, label: label || "" }, 0);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          data-testid="explorer-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar dentro da pasta aberta..."
          className="h-8 w-full border-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex min-h-0 flex-1 overflow-x-auto rounded-xl border border-border bg-card">
        {columns.map((col, i) => (
          <ExplorerColumn
            key={i}
            column={col}
            query={query}
            selectedId={selected?.id}
            onOpenFolder={(f) => openFolder(f, i)}
            onOpenItem={(it) => openItem(it, i)}
          />
        ))}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-border bg-muted/60 p-3">
          <ExplorerDetailPane item={selected} onNavigate={openEntity} />
        </div>
      </div>
    </div>
  );
}
