import { motion } from "framer-motion";
import { Star, Ruler, Phone, ChevronRight } from "lucide-react";
import { CategoryBadge, StatusPill } from "@/components/CategoryBadge";
import { getCategory } from "@/lib/categories";
import { Checkbox } from "@/components/ui/checkbox";

export default function NoteCard({ note, onOpen, onToggleDone, onToggleFavorite }) {
  const c = getCategory(note.category);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      data-testid={`note-card-${note.id}`}
      onClick={() => onOpen(note)}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-input hover:shadow-lg hover:shadow-slate-200/60 active:scale-[0.99]"
    >
      <span className="absolute inset-y-0 left-0 w-1.5 transition-all duration-200 group-hover:w-2" style={{ backgroundColor: c.accent }} />
      <div className="flex items-start gap-3 pl-2">
        <div onClick={(e) => e.stopPropagation()} className="pt-0.5 transition-transform duration-150 hover:scale-110 active:scale-90">
          <Checkbox
            data-testid={`note-done-${note.id}`}
            checked={note.done}
            onCheckedChange={() => onToggleDone(note)}
            className="h-5 w-5 rounded-md"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={`truncate font-heading text-base font-extrabold tracking-tight text-foreground ${
                note.done ? "line-through opacity-50" : ""
              }`}
            >
              {note.customer_name || "Sem nome"}
            </h3>
            <button
              data-testid={`note-fav-${note.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(note);
              }}
              className="shrink-0 rounded-lg p-1 text-muted-foreground transition-transform duration-150 hover:scale-125 hover:text-amber-400 active:scale-90"
            >
              <Star key={note.favorite} className={`h-4 w-4 ${note.favorite ? "fill-amber-400 text-amber-400 animate-pop" : ""}`} />
            </button>
          </div>

          {note.phone ? (
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {note.phone}
            </p>
          ) : null}

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{note.description}</p>

          {note.measurements ? (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
              <Ruler className="h-3 w-3" /> {note.measurements}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CategoryBadge category={note.category} />
            <StatusPill status={note.status} />
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
