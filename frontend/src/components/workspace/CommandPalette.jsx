import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, ClipboardList, Mail, Truck, ListChecks, Plus, RefreshCw, BarChart3, FileClock, Zap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import api from "@/lib/api";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { routeMatchesPanelType } from "@/lib/panelRegistry";

function ResultGroup({ label, icon: Icon, children }) {
  return (
    <div className="mb-2">
      <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResultRow({ testid, title, subtitle, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick} className="flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
      <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
      {subtitle ? <span className="truncate text-xs text-slate-400">{subtitle}</span> : null}
    </button>
  );
}

// Pesquisa universal — Ctrl/Cmd+K no desktop, ícone de pesquisa no
// telemóvel. Abre imediatamente o pedido/painel certo em vez de obrigar a
// navegar entre páginas à procura.
export default function CommandPalette({ open, onOpenChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { openPanel, setActiveContext } = useWorkspace();
  const isDesktop = useIsDesktop();
  const timer = useRef(null);

  useEffect(() => {
    if (!open) { setQ(""); setResults(null); }
  }, [open]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) { setResults(null); setLoading(false); return undefined; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q: term } });
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const goTo = (path, panelType) => {
    if (isDesktop && panelType && !routeMatchesPanelType(location.pathname, panelType)) openPanel(panelType);
    else navigate(path);
    onOpenChange(false);
  };

  const goToNote = (n) => {
    // O deep-link "?open=" só é lido pela instância de Pedidos encaminhada
    // pelo router — nunca abre como painel flutuante, para não arriscar dois
    // diálogos do mesmo pedido em simultâneo (um por instância de Notes).
    setActiveContext({ kind: "pedido", id: n.id, label: n.customer_name || "Pedido" });
    navigate(`/?open=${n.id}`);
    onOpenChange(false);
  };

  const hasResults = results && (
    (results.notes || []).length || (results.suppliers || []).length
    || (results.tasks || []).length || (results.emails || []).length
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="command-palette" className="top-[10%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 py-3 pl-4 pr-10">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <Input
            data-testid="command-palette-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar pedidos, emails, fornecedores, tarefas…"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          {loading ? <Spinner className="h-4 w-4 shrink-0 text-slate-400" /> : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <ResultGroup label="Ações rápidas" icon={Zap}>
              {[
                { icon: Plus, label: "Novo pedido", run: () => { navigate("/?new=1"); onOpenChange(false); } },
                { icon: Mail, label: "Abrir emails", run: () => { navigate("/emails"); onOpenChange(false); } },
                {
                  icon: RefreshCw, label: "Verificar caixa de entrada agora",
                  run: async () => {
                    onOpenChange(false);
                    try {
                      const { data } = await api.post("/emails/sync");
                      const novos = (data.new_received || 0) + (data.new_sent || 0);
                      toast.success(novos ? `Sincronizado: ${novos} novidade(s)` : "Caixa verificada — sem novidades");
                    } catch {
                      toast.error("Não foi possível verificar a caixa de entrada");
                    }
                  },
                },
                { icon: FileClock, label: "Rascunhos por confirmar", run: () => { navigate("/emails"); onOpenChange(false); } },
                { icon: ListChecks, label: "Tarefas", run: () => { navigate("/tarefas"); onOpenChange(false); } },
                { icon: BarChart3, label: "Estatísticas", run: () => { navigate("/estatisticas"); onOpenChange(false); } },
              ].map((a) => {
                const AIcon = a.icon;
                return (
                  <button
                    key={a.label}
                    data-testid={`palette-action-${a.label}`}
                    onClick={a.run}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <AIcon className="h-4 w-4 shrink-0 text-slate-400" /> {a.label}
                  </button>
                );
              })}
            </ResultGroup>
          ) : !hasResults && !loading ? (
            <p className="p-4 text-center text-xs text-slate-400">Sem resultados para "{q}".</p>
          ) : (
            <>
              {(results?.notes || []).length ? (
                <ResultGroup label="Pedidos" icon={ClipboardList}>
                  {results.notes.map((n) => (
                    <ResultRow key={n.id} testid={`search-note-${n.id}`} title={n.customer_name || "Sem nome"} subtitle={n.description} onClick={() => goToNote(n)} />
                  ))}
                </ResultGroup>
              ) : null}
              {(results?.emails || []).length ? (
                <ResultGroup label="Emails" icon={Mail}>
                  {results.emails.map((m) => (
                    <ResultRow key={m.id} testid={`search-email-${m.id}`} title={m.subject || "(sem assunto)"} subtitle={m.supplier_name || m.from_name || m.from_email} onClick={() => goTo("/emails", "emails")} />
                  ))}
                </ResultGroup>
              ) : null}
              {(results?.suppliers || []).length ? (
                <ResultGroup label="Fornecedores" icon={Truck}>
                  {results.suppliers.map((s) => (
                    <ResultRow key={s.id} testid={`search-supplier-${s.id}`} title={s.name} subtitle={s.email} onClick={() => goTo("/fornecedores", "suppliers")} />
                  ))}
                </ResultGroup>
              ) : null}
              {(results?.tasks || []).length ? (
                <ResultGroup label="Tarefas" icon={ListChecks}>
                  {results.tasks.map((t) => (
                    <ResultRow key={t.id} testid={`search-task-${t.id}`} title={t.title} subtitle={t.done ? "Concluída" : "Por fazer"} onClick={() => goTo("/tarefas", "tasks")} />
                  ))}
                </ResultGroup>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
