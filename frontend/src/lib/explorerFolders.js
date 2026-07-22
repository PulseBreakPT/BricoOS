import {
  ClipboardList, Users, Truck, Mail, FileText, Image as ImageIcon, FileSpreadsheet,
  StickyNote, Calendar, Package, Archive, Trash2, Inbox, RefreshCw, AlertTriangle, CheckCircle2,
} from "lucide-react";
import api from "@/lib/api";

async function fetchNotes(params) {
  const { data } = await api.get("/notes", { params });
  return (data.items || []).map((n) => ({
    kind: "pedido", id: n.id, label: n.customer_name || "Sem nome",
    sublabel: n.description || "", data: n,
  }));
}

// Pastas de ficheiros mostram sempre a versão atual — o histórico completo
// fica no painel de detalhe (ver ExplorerDetailPane), não como linhas
// repetidas na listagem.
async function fetchFiles(type) {
  const { data } = await api.get("/explorer/files", { params: { type } });
  return (data.items || [])
    .filter((f) => f.is_current)
    .map((f) => ({
      kind: "ficheiro", id: f.id,
      label: f.version_count > 1 ? `${f.filename} (v${f.version})` : f.filename,
      sublabel: [f.note_label, f.supplier_label, f.task_label].filter(Boolean).join(" · ") || f.kind_label,
      data: f,
    }));
}

// Pastas de topo — a árvore fixa do Explorador. Cada pasta é uma vista
// calculada sobre os dados que já existem (não há ficheiros "soltos"
// nalgum sítio à parte); "fetch" devolve os nós de primeiro nível dessa
// pasta.
export const ROOT_FOLDERS = [
  { key: "pedidos", label: "Pedidos", icon: ClipboardList, fetch: () => fetchNotes({}) },
  {
    key: "clientes", label: "Clientes", icon: Users,
    fetch: async () => {
      const { data } = await api.get("/explorer/clients");
      return (data.items || []).map((c) => ({
        kind: "cliente", id: c.key, label: c.name,
        sublabel: `${c.pedidos_count} pedido${c.pedidos_count === 1 ? "" : "s"}${c.phone ? ` · ${c.phone}` : ""}`,
        data: c,
      }));
    },
  },
  {
    key: "fornecedores", label: "Fornecedores", icon: Truck,
    fetch: async () => {
      const { data } = await api.get("/suppliers");
      return (data || []).map((s) => ({
        kind: "fornecedor", id: s.id, label: s.name, sublabel: s.email || s.phone || "", data: s,
      }));
    },
  },
  {
    key: "emails", label: "Emails", icon: Mail,
    fetch: async () => {
      const { data } = await api.get("/emails/inbox", { params: { limit: 150 } });
      return (data.items || []).map((m) => ({
        kind: "email", id: m.id, label: m.supplier_name || m.from_name || m.from_email,
        sublabel: m.subject || "(sem assunto)", data: m,
      }));
    },
  },
  { key: "pdfs", label: "PDFs", icon: FileText, fetch: () => fetchFiles("pdf") },
  { key: "imagens", label: "Imagens", icon: ImageIcon, fetch: () => fetchFiles("image") },
  { key: "excel", label: "Excel", icon: FileSpreadsheet, fetch: () => fetchFiles("excel") },
  {
    key: "notas", label: "Notas / Lembretes", icon: StickyNote,
    fetch: async () => {
      const { data } = await api.get("/tasks");
      return (data || []).map((t) => ({
        kind: "tarefa", id: t.id, label: t.title, sublabel: t.due_date || "sem data", data: t,
      }));
    },
  },
  {
    key: "calendario", label: "Calendário", icon: Calendar,
    fetch: async () => {
      const { data } = await api.get("/tasks");
      return (data || [])
        .filter((t) => t.due_date)
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
        .map((t) => ({ kind: "tarefa", id: t.id, label: t.title, sublabel: t.due_date, data: t }));
    },
  },
  {
    key: "produtos", label: "Produtos", icon: Package,
    fetch: async () => {
      const { data } = await api.get("/caixilharia/catalog");
      return Object.entries(data.modelos || {}).map(([key, m]) => ({
        kind: "produto", id: key, label: m?.nome || m?.name || key,
        sublabel: m?.descricao || m?.material || "Catálogo técnico", data: m,
      }));
    },
  },
  { key: "arquivo", label: "Arquivo", icon: Archive, fetch: () => fetchNotes({ archived: true }) },
  {
    key: "reciclagem", label: "Reciclagem", icon: Trash2,
    fetch: async () => {
      const { data } = await api.get("/trash");
      return (data.items || []).map((it) => ({
        kind: "lixeira", id: `${it.kind}-${it.id}`, label: it.label, sublabel: `${it.kind} · ${it.sublabel || ""}`, data: it,
      }));
    },
  },
];

// Espaços inteligentes — pastas virtuais focadas no que precisa de ação
// agora, não na organização por tipo. Mesmos dados dos Pedidos, outro corte.
export const SMART_SPACES = [
  {
    key: "inbox", label: "Caixa de Entrada", icon: Inbox,
    fetch: async () => {
      const { data } = await api.get("/emails/unseen");
      return (data.items || []).map((m) => ({
        kind: "email", id: m.id, label: m.supplier_name || m.from_name || m.from_email,
        sublabel: m.subject || "(sem assunto)", data: m,
      }));
    },
  },
  { key: "processamento", label: "Em Processamento", icon: RefreshCw, fetch: () => fetchNotes({ status: "pendente,em_preparacao,enviado_fornecedor" }) },
  {
    key: "espera", label: "À Espera", icon: ClipboardList,
    fetch: async () => {
      const [sup, cli] = await Promise.all([fetchNotes({ waiting: "supplier" }), fetchNotes({ waiting: "client" })]);
      const seen = new Set();
      return [...sup, ...cli].filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
    },
  },
  { key: "atencao", label: "Requer Atenção", icon: AlertTriangle, fetch: () => fetchNotes({ overdue: true }) },
  {
    key: "concluido_hoje", label: "Concluído Hoje", icon: CheckCircle2,
    fetch: async () => {
      const items = await fetchNotes({ status: "concluido,aprovado,encomendado" });
      const today = new Date().toDateString();
      return items.filter((n) => {
        const at = n.data.status_updated_at || n.data.updated_at;
        return at && new Date(at).toDateString() === today;
      });
    },
  },
  { key: "arquivados", label: "Arquivados", icon: Archive, fetch: () => fetchNotes({ archived: true }) },
];

// Ícone por tipo de nó — reutilizado nas colunas e no painel de detalhe.
export const KIND_ICONS = {
  pedido: ClipboardList, cliente: Users, fornecedor: Truck, email: Mail,
  tarefa: StickyNote, produto: Package, lixeira: Trash2,
};

export function iconForItem(item) {
  if (item.kind === "ficheiro") {
    if (item.data?.file_type === "image") return ImageIcon;
    if (item.data?.file_type === "excel") return FileSpreadsheet;
    return FileText;
  }
  return KIND_ICONS[item.kind] || FileText;
}
