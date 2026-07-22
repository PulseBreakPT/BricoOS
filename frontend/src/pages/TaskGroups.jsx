import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Pencil, FolderTree, ListChecks } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia,
} from "@/components/ui/empty";
import { toast } from "sonner";

export default function TaskGroups() {
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const { data } = await api.get("/task-groups");
      if (seq !== loadSeq.current) return;
      setGroups(data);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar grupos"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setName(""); setOpen(true); };
  const openEdit = (g) => { setEditing(g); setName(g.name); setOpen(true); };

  const save = async () => {
    if (saving) return; // Enter repetido não deve disparar dois guardados concorrentes
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Indica o nome do grupo."); return; }
    // Verificação local antes de ir à rede — mesma comparação (case-insensitive)
    // que o backend já faz, só que instantânea em vez de à espera de um 409.
    const clash = groups.find((g) => g.id !== editing?.id && g.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) { toast.error(`Já existe um grupo chamado "${clash.name}".`); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/task-groups/${editing.id}`, { name: trimmed });
      else await api.post("/task-groups", { name: trimmed });
      toast.success(editing ? "Grupo atualizado" : "Grupo criado");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    if (deletingId === g.id) return; // já há uma remoção deste grupo em curso
    if (!window.confirm(`Eliminar o grupo "${g.name}"? As tarefas associadas ficam sem grupo.`)) return;
    setDeletingId(g.id);
    try {
      await api.delete(`/task-groups/${g.id}`);
      toast.success("Grupo eliminado");
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao eliminar"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="kicker">Organização</p>
          <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">Grupos de Tarefas</h1>
          <p className="text-sm text-muted-foreground">
            {groups.length > 0
              ? `${groups.length} grupo${groups.length === 1 ? "" : "s"} para organizar as tarefas.`
              : "Cria grupos para organizar as tarefas por obra, área ou projeto."}
          </p>
        </div>
        <Button data-testid="add-taskgroup-btn" onClick={openNew} className="hidden rounded-xl shadow-lg shadow-slate-400/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:inline-flex">
          <Plus className="mr-2 h-4 w-4" /> Novo grupo
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g, idx) => (
          <div
            key={g.id}
            data-testid={`taskgroup-card-${g.id}`}
            className="group relative animate-fade-up overflow-hidden rounded-2xl border border-border bg-card p-4 card-elevated card-elevated-hover transition-all duration-200 hover:-translate-y-1 hover:border-input sm:p-5"
            style={{ "--stagger-i": Math.min(idx, 8) }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground shadow-sm transition-transform duration-200 group-hover:scale-110">
                  <FolderTree className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-heading text-base font-extrabold tracking-tight text-foreground">{g.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" /> {g.tasks_count || 0} tarefa{g.tasks_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button data-testid={`edit-taskgroup-${g.id}`} onClick={() => openEdit(g)} className="rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:scale-110 hover:bg-muted hover:text-foreground active:scale-90">
                  <Pencil className="h-4 w-4" />
                </button>
                <button data-testid={`delete-taskgroup-${g.id}`} disabled={deletingId === g.id} onClick={() => remove(g)} className="rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:scale-110 hover:bg-[var(--pastel-red-bg)] hover:text-red-600 active:scale-90 disabled:opacity-50">
                  {deletingId === g.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
          <EmptyMedia>
            <div className="relative">
              <div className="absolute inset-0 animate-float-slow rounded-3xl bg-muted/60 blur-xl" />
              <div className="card-elevated relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 text-red-600">
                <FolderTree className="h-7 w-7" />
              </div>
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-foreground">Ainda sem grupos</EmptyTitle>
            <EmptyDescription className="text-muted-foreground">Cria o primeiro grupo para começar a organizar as tarefas.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-lg shadow-slate-400/40 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95">
              <Plus className="h-4 w-4" strokeWidth={2.6} /> Criar grupo
            </button>
          </EmptyContent>
        </Empty>
      ) : null}

      {createPortal(
        <button
          data-testid="fab-new-taskgroup"
          onClick={() => {
            haptics.tap();
            openNew();
          }}
          aria-label="Novo grupo"
          title="Novo grupo"
          className="group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 select-none touch-manipulation items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-black text-white shadow-[0_16px_35px_-8px_rgba(15,23,42,0.55)] ring-1 ring-black/10 transition-all duration-150 will-change-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/50 active:scale-90 active:duration-75 sm:hidden"
        >
          <Plus className="h-7 w-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.4} />
        </button>,
        document.body,
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="taskgroup-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold tracking-tight">
              {editing ? "Editar grupo" : "Novo grupo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                data-testid="taskgroup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Obra da Cozinha"
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              />
            </div>
            <Button data-testid="save-taskgroup-btn" onClick={save} disabled={saving} className="w-full rounded-xl">
              {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {editing ? "Guardar" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
