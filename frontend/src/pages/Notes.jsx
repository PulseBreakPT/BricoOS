import { useEffect, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, Search, Filter, Inbox } from "lucide-react";
import api from "@/lib/api";
import { CATEGORY_LIST } from "@/lib/categories";
import NoteCard from "@/components/NoteCard";
import NoteDialog from "@/components/NoteDialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [gmailStatus, setGmailStatus] = useState({ connected: false, configured: false });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [n, s, g] = await Promise.all([
      api.get("/notes"),
      api.get("/suppliers"),
      api.get("/gmail/status"),
    ]);
    setNotes(n.data);
    setSuppliers(s.data);
    setGmailStatus(g.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      toast.success("Gmail ligado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("gmail") === "error") {
      toast.error("Não foi possível ligar o Gmail.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const openNew = () => { setActive(null); setDialogOpen(true); };
  const openNote = (note) => { setActive(note); setDialogOpen(true); };

  const toggleDone = async (note) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)));
    await api.put(`/notes/${note.id}`, { done: !note.done });
  };
  const toggleFav = async (note) => {
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, favorite: !n.favorite } : n)));
    await api.put(`/notes/${note.id}`, { favorite: !note.favorite });
  };

  const filtered = notes.filter((n) => {
    const matchCat = filter === "todos" || n.category === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (n.customer_name || "").toLowerCase().includes(q) ||
      (n.description || "").toLowerCase().includes(q) ||
      (n.phone || "").includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Bloco de notas</p>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Clientes
        </h1>
        <p className="text-sm text-slate-500">Pedidos, preços e coisas à medida dos seus clientes.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="search-notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por nome, telefone ou pedido..."
            className="h-11 rounded-xl pl-10"
          />
        </div>

        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <FilterPill active={filter === "todos"} onClick={() => setFilter("todos")} testid="filter-todos">
            <Filter className="h-3.5 w-3.5" /> Todos
          </FilterPill>
          {CATEGORY_LIST.map((c) => {
            const Icon = c.icon;
            const isActive = filter === c.key;
            return (
              <button
                key={c.key}
                data-testid={`filter-${c.key}`}
                onClick={() => setFilter(c.key)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-transform duration-150 active:scale-95"
                style={{
                  backgroundColor: isActive ? c.accent : c.bg,
                  color: isActive ? "#fff" : c.text,
                }}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onOpen={openNote}
              onToggleDone={toggleDone}
              onToggleFavorite={toggleFav}
            />
          ))}
        </AnimatePresence>
      </div>

      {!loading && filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Inbox className="h-7 w-7" />
          </div>
          <p className="mt-4 font-heading text-lg font-bold text-slate-900">Sem notas</p>
          <p className="text-sm text-slate-500">Toque no botão + para criar a primeira nota.</p>
        </div>
      ) : null}

      <button
        data-testid="fab-new-note"
        onClick={openNew}
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-slate-400/40 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 lg:bottom-10 lg:right-10 lg:h-16 lg:w-16"
      >
        <Plus className="h-7 w-7" strokeWidth={2.4} />
      </button>

      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        note={active}
        suppliers={suppliers}
        gmailStatus={gmailStatus}
        onSaved={load}
      />
    </div>
  );
}

const FilterPill = ({ active, onClick, children, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-transform duration-150 active:scale-95 ${
      active ? "bg-primary text-primary-foreground" : "bg-white text-slate-600 border border-slate-200"
    }`}
  >
    {children}
  </button>
);
