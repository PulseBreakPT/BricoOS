import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ListChecks } from "lucide-react";
import api from "@/lib/api";
import { CATEGORY_LIST, getCategory } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CategoryBadge } from "@/components/CategoryBadge";
import { toast } from "sonner";

const PRIORITIES = { alta: { label: "Alta", color: "#DC2626" }, normal: { label: "Normal", color: "#64748B" } };

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("todos");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("construcao");
  const [priority, setPriority] = useState("normal");

  const load = useCallback(async () => {
    const { data } = await api.get("/tasks");
    setTasks(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!title.trim()) { toast.error("Escreva a tarefa."); return; }
    await api.post("/tasks", { title: title.trim(), category, priority });
    setTitle("");
    toast.success("Tarefa adicionada");
    load();
  };

  const toggle = async (t) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await api.patch(`/tasks/${t.id}/toggle`);
  };

  const remove = async (id) => {
    await api.delete(`/tasks/${id}`);
    load();
  };

  const filtered = tasks.filter((t) => filter === "todos" || t.category === filter);
  const pending = filtered.filter((t) => !t.done);
  const done = filtered.filter((t) => t.done);

  const Row = ({ t }) => {
    const c = getCategory(t.category);
    const p = PRIORITIES[t.priority] || PRIORITIES.normal;
    return (
      <div
        data-testid={`task-row-${t.id}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
      >
        <Checkbox
          data-testid={`task-toggle-${t.id}`}
          checked={t.done}
          onCheckedChange={() => toggle(t)}
          className="h-5 w-5 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold text-slate-900 ${t.done ? "line-through opacity-50" : ""}`}>{t.title}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <CategoryBadge category={t.category} />
            {t.priority === "alta" && !t.done ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: `${p.color}1a`, color: p.color }}>
                {p.label}
              </span>
            ) : null}
          </div>
        </div>
        <button data-testid={`delete-task-${t.id}`} onClick={() => remove(t.id)} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Coisas por fazer</p>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Tarefas</h1>
        <p className="text-sm text-slate-500">Por secção: construção, bricolagem, decoração e jardim.</p>
      </div>

      {/* Add task */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            data-testid="task-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nova tarefa..."
            className="h-11 flex-1 rounded-xl"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="task-category-select" className="h-11 rounded-xl sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_LIST.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger data-testid="task-priority-select" className="h-11 rounded-xl sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
          <Button data-testid="add-task-btn" onClick={add} className="h-11 rounded-xl">
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          data-testid="task-filter-todos"
          onClick={() => setFilter("todos")}
          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold ${filter === "todos" ? "bg-primary text-primary-foreground" : "border border-slate-200 bg-white text-slate-600"}`}
        >
          Todas
        </button>
        {CATEGORY_LIST.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              data-testid={`task-filter-${c.key}`}
              onClick={() => setFilter(c.key)}
              className="shrink-0 rounded-full px-3.5 py-2 text-xs font-bold"
              style={{ backgroundColor: active ? c.accent : c.bg, color: active ? "#fff" : c.text }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-2">
        {pending.map((t) => <Row key={t.id} t={t} />)}
      </div>

      {done.length > 0 ? (
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Concluídas ({done.length})</p>
          <div className="space-y-2">
            {done.map((t) => <Row key={t.id} t={t} />)}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ListChecks className="h-7 w-7" />
          </div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900">Sem tarefas</p>
          <p className="text-sm text-slate-500">Adicione a primeira tarefa acima.</p>
        </div>
      ) : null}
    </div>
  );
}
