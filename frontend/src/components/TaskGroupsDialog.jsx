import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Trash2, Pencil, FolderTree, ListChecks, ArrowLeft } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "@/components/ui/empty";
import { toast } from "sonner";

// Gestão de Grupos de Tarefas — antes uma página/aplicação própria
// (pages/TaskGroups.jsx), agora vive dentro de Tarefas, aberta a partir do
// botão "Grupos" no cabeçalho. Mesma lógica de sempre (listar/criar/editar/
// eliminar), só a apresentação passou de página cheia para diálogo.
export default function TaskGroupsDialog({ open, onOpenChange, onChanged }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null); // null = lista; {} = novo; {id,...} = a editar
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const { data } = await api.get("/task-groups");
      if (seq !== loadSeq.current) return;
      setGroups(data);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      toast.error(getErrorMessage(e, "Erro ao carregar grupos"));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { setForm(null); load(); }
  }, [open, load]);

  const openNew = () => setForm({ name: "" });
  const openEdit = (g) => setForm({ id: g.id, name: g.name });

  const save = async () => {
    if (saving) return;
    const trimmed = (form.name || "").trim();
    if (!trimmed) { toast.error("Indica o nome do grupo."); return; }
    const clash = groups.find((g) => g.id !== form.id && g.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) { toast.error(`Já existe um grupo chamado "${clash.name}".`); return; }
    setSaving(true);
    try {
      if (form.id) await api.put(`/task-groups/${form.id}`, { name: trimmed });
      else await api.post("/task-groups", { name: trimmed });
      toast.success(form.id ? "Grupo atualizado" : "Grupo criado");
      setForm(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao guardar"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    if (deletingId === g.id) return;
    if (!window.confirm(`Eliminar o grupo "${g.name}"? As tarefas associadas ficam sem grupo.`)) return;
    setDeletingId(g.id);
    try {
      await api.delete(`/task-groups/${g.id}`);
      toast.success("Grupo eliminado");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao eliminar"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="taskgroups-dialog" className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 font-heading text-h3">
            {form ? (
              <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Voltar à lista">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <FolderTree className="h-4 w-4 text-muted-foreground" />
            )}
            {form ? (form.id ? "Editar grupo" : "Novo grupo") : "Grupos de Tarefas"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {form ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  autoFocus
                  data-testid="taskgroup-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Obra da Cozinha"
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                />
              </div>
              <Button data-testid="save-taskgroup-btn" onClick={save} disabled={saving} className="w-full rounded-xl">
                {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {form.id ? "Guardar" : "Adicionar"}
              </Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-10"><Spinner className="h-5 w-5 text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <Empty className="rounded-2xl border-2 border-dashed border-border bg-card/60 px-6 py-10">
              <EmptyMedia>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
                  <FolderTree className="h-6 w-6" />
                </div>
              </EmptyMedia>
              <EmptyHeader className="gap-1">
                <EmptyTitle className="font-heading font-extrabold text-foreground">Ainda sem grupos</EmptyTitle>
                <EmptyDescription className="text-text-body">Cria grupos para organizar as tarefas por obra, área ou projeto.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button data-testid="add-taskgroup-btn-empty" onClick={openNew} className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" /> Criar grupo
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => (
                <div
                  key={g.id}
                  data-testid={`taskgroup-row-${g.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                    <FolderTree className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{g.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-meta text-text-tertiary">
                      <ListChecks className="h-3 w-3" /> {g.tasks_count || 0} tarefa{g.tasks_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button data-testid={`edit-taskgroup-${g.id}`} onClick={() => openEdit(g)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button data-testid={`delete-taskgroup-${g.id}`} disabled={deletingId === g.id} onClick={() => remove(g)} className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-[var(--pastel-red-bg)] hover:text-destructive disabled:opacity-50">
                      {deletingId === g.id ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!form && groups.length > 0 ? (
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">
            <Button data-testid="add-taskgroup-btn" onClick={openNew} className="w-full rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Novo grupo
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
