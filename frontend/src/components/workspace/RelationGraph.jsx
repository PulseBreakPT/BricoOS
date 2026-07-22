import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import api from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { KIND_ICONS } from "@/lib/explorerFolders";

const SIZE = 540;
const CENTER = SIZE / 2;
const RING_R = 170;

function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

async function fetchRelated(kind, id) {
  if (kind === "cliente") {
    const { data } = await api.get(`/explorer/clients/${encodeURIComponent(id)}`);
    return { pedidos: data.items || [] };
  }
  const { data } = await api.get("/explorer/related", { params: { kind, id } });
  return data;
}

// Agrupa os relacionados de qualquer nó em "raios" à volta do centro —
// entidades únicas (cliente/fornecedor) reenraízam o grafo ao clicar;
// grupos (emails/ficheiros/notas/pedidos) expandem-se em nós satélite.
function buildGroups(kind, data) {
  const groups = [];
  if (kind === "pedido") {
    if (data.cliente) groups.push({ key: "cliente", label: data.cliente.name || "Cliente", kind: "cliente", id: data.cliente.key, single: true });
    if (data.fornecedor) groups.push({ key: "fornecedor", label: data.fornecedor.name, kind: "fornecedor", id: data.fornecedor.id, single: true });
    if ((data.emails || []).length) {
      groups.push({ key: "emails", label: `Emails (${data.emails.length})`, kind: "email", items: data.emails.map((m) => ({ id: m.id, label: m.supplier_name || m.from_name || m.from_email })) });
    }
    const files = (data.ficheiros || []).filter((f) => f.is_current);
    if (files.length) groups.push({ key: "ficheiros", label: `Ficheiros (${files.length})`, kind: "ficheiro", items: files.map((f) => ({ id: f.id, label: f.filename })) });
    if ((data.notas || []).length) groups.push({ key: "notas", label: `Notas (${data.notas.length})`, kind: "tarefa", items: data.notas.map((t) => ({ id: t.id, label: t.title })) });
  } else if (kind === "fornecedor") {
    if ((data.pedidos || []).length) groups.push({ key: "pedidos", label: `Pedidos (${data.pedidos.length})`, kind: "pedido", items: data.pedidos.map((n) => ({ id: n.id, label: n.customer_name || "Sem nome" })) });
    const files = (data.ficheiros || []).filter((f) => f.is_current);
    if (files.length) groups.push({ key: "ficheiros", label: `Ficheiros (${files.length})`, kind: "ficheiro", items: files.map((f) => ({ id: f.id, label: f.filename })) });
  } else if (kind === "cliente") {
    if ((data.pedidos || []).length) groups.push({ key: "pedidos", label: `Pedidos (${data.pedidos.length})`, kind: "pedido", items: data.pedidos.map((n) => ({ id: n.id, label: n.customer_name || "Sem nome" })) });
  }
  return groups;
}

function GraphNode({ x, y, label, kind, onClick, main, small }) {
  const Icon = KIND_ICONS[kind];
  const size = main ? 92 : small ? 56 : 76;
  return (
    <button
      type="button"
      data-testid={`graph-node-${kind}-${label}`}
      onClick={onClick}
      disabled={!onClick}
      className={`relation-graph-node absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border p-1 text-center shadow-sm transition-transform ${
        main ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
      } ${onClick ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
      style={{
        left: `${(x / SIZE) * 100}%`,
        top: `${(y / SIZE) * 100}%`,
        "--graph-node-size": `${(size / SIZE) * 100}%`,
      }}
    >
      {Icon ? <Icon className={`${small ? "h-3.5 w-3.5" : "h-4 w-4"} ${main ? "text-white" : "text-slate-400"}`} /> : null}
      <span className={`line-clamp-2 px-1.5 leading-tight ${small ? "text-[9px]" : "text-[10px]"} font-bold ${main ? "text-white" : "text-slate-700"}`}>
        {label}
      </span>
    </button>
  );
}

// Vista em grafo — em vez de listas/colunas, mostra como tudo está ligado a
// partir de um pedido/fornecedor/cliente. Clicar num nó único (cliente,
// fornecedor, ou um pedido dentro de um grupo) reenraíza o grafo nesse nó;
// clicar num grupo (emails/ficheiros/notas) expande-o em nós satélite.
export default function RelationGraph({ rootKind, rootId, rootLabel, onClose }) {
  const [root, setRoot] = useState({ kind: rootKind, id: rootId, label: rootLabel });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async (r) => {
    setLoading(true);
    setExpanded(null);
    try {
      setData(await fetchRelated(r.kind, r.id));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(root); }, [root, load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goTo = (kind, id, label) => {
    setHistory((h) => [...h, root]);
    setRoot({ kind, id, label });
  };
  const goBack = () => setHistory((h) => {
    if (!h.length) return h;
    setRoot(h[h.length - 1]);
    return h.slice(0, -1);
  });

  const groups = data ? buildGroups(root.kind, data) : [];
  const angleStep = groups.length ? 360 / groups.length : 0;
  const expandedGroup = groups.find((g) => g.key === expanded);

  return (
    <div data-testid="relation-graph" className="fixed inset-0 z-[75] flex flex-col items-center justify-center overflow-hidden bg-[#f0efeb]/85 p-2 backdrop-blur-md sm:p-4" onClick={onClose}>
      <div className="flex w-full max-w-[540px] min-w-0 items-center justify-center gap-2 pb-2 text-neutral-900 sm:pb-3" onClick={(e) => e.stopPropagation()}>
        {history.length > 0 ? (
          <button type="button" data-testid="graph-back" onClick={goBack} className="flex min-h-11 shrink-0 items-center rounded-xl px-3 text-xs font-bold hover:bg-neutral-900/[0.06]">← Voltar</button>
        ) : null}
        <p className="min-w-0 flex-1 text-center text-sm font-bold leading-tight">{root.label}</p>
        <button type="button" onClick={onClose} aria-label="Fechar grafo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-neutral-900/[0.06]"><X className="h-4 w-4" /></button>
      </div>
      <div className="relation-graph-canvas themed-surface relative overflow-hidden rounded-2xl border border-neutral-900/10 bg-white shadow-[0_40px_90px_-35px_rgba(16,17,20,0.5)]" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-slate-400" /></div>
        ) : (
          <>
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
              {groups.map((g, i) => {
                const pos = polar(CENTER, CENTER, RING_R, i * angleStep);
                return <line key={`line-${g.key}`} x1={CENTER} y1={CENTER} x2={pos.x} y2={pos.y} stroke="var(--graph-line)" strokeWidth={2} />;
              })}
              {expandedGroup ? expandedGroup.items.map((it, j, arr) => {
                const gi = groups.findIndex((g) => g.key === expanded);
                const base = gi * angleStep;
                const a = base + (arr.length > 1 ? (j / (arr.length - 1) - 0.5) * 44 : 0);
                const groupPos = polar(CENTER, CENTER, RING_R, base);
                const itemPos = polar(CENTER, CENTER, RING_R + 72, a);
                return <line key={`sline-${it.id}`} x1={groupPos.x} y1={groupPos.y} x2={itemPos.x} y2={itemPos.y} stroke="var(--graph-line)" strokeWidth={1.5} />;
              }) : null}
            </svg>
            <GraphNode x={CENTER} y={CENTER} label={root.label} kind={root.kind} main />
            {groups.map((g, i) => {
              const pos = polar(CENTER, CENTER, RING_R, i * angleStep);
              return (
                <GraphNode
                  key={g.key} x={pos.x} y={pos.y} label={g.label} kind={g.kind}
                  onClick={() => (g.single ? goTo(g.kind, g.id, g.label) : setExpanded((e) => (e === g.key ? null : g.key)))}
                />
              );
            })}
            {expandedGroup ? expandedGroup.items.map((it, j, arr) => {
              const gi = groups.findIndex((g) => g.key === expanded);
              const base = gi * angleStep;
              const a = base + (arr.length > 1 ? (j / (arr.length - 1) - 0.5) * 44 : 0);
              const itemPos = polar(CENTER, CENTER, RING_R + 72, a);
              const canReroot = expandedGroup.kind === "pedido" || expandedGroup.kind === "fornecedor";
              return (
                <GraphNode
                  key={it.id} x={itemPos.x} y={itemPos.y} label={it.label} kind={expandedGroup.kind} small
                  onClick={canReroot ? () => goTo(expandedGroup.kind, it.id, it.label) : undefined}
                />
              );
            }) : null}
          </>
        )}
      </div>
      <p className="mt-2 max-w-[540px] px-3 text-center text-[11px] font-semibold leading-relaxed text-neutral-500 sm:mt-3 sm:text-xs">Toca num nó único para reenraizar · toca num grupo para expandir · Esc para fechar</p>
    </div>
  );
}
