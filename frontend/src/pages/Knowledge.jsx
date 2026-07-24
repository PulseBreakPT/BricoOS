import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, CalendarDays, ClipboardList, Pin, Search, Sparkles,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { toast } from "sonner";
import KnowledgeArticleDialog from "@/components/KnowledgeArticleDialog";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "nao_lidas", label: "Não lidas" },
  { key: "fixadas", label: "Fixadas" },
  { key: "arquivadas", label: "Arquivadas" },
];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

function ArticleCard({ article, onOpen }) {
  const read = (article.read_count || 0) > 0;
  return (
    <button
      type="button"
      data-testid={`knowledge-article-${article.id}`}
      onClick={() => onOpen(article.id)}
      className="group flex w-full flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left card-elevated transition-all duration-150 hover:-translate-y-0.5 hover:border-input hover:shadow-md sm:p-5"
    >
      <div className="flex w-full items-start gap-2.5">
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${read ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          title={read ? "Já aberto" : "Nunca aberto"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-heading text-sm font-extrabold text-foreground">{article.title}</p>
            {article.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-foreground" /> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> {formatDate(article.issue_date || article.created_at)}
          </p>
        </div>
      </div>
      {article.highlights?.[0] ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <span className="line-clamp-2">{article.highlights[0]}</span>
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {article.important_count ? (
          <span className="rounded-full bg-[var(--pastel-red-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-red-text)]">
            {article.important_count} tema{article.important_count === 1 ? "" : "s"} importante{article.important_count === 1 ? "" : "s"}
          </span>
        ) : null}
        {article.action_count ? (
          <span className="flex items-center gap-1 rounded-full bg-[var(--pastel-amber-bg)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--pastel-amber-text)]">
            <ClipboardList className="h-3 w-3" /> {article.action_count} ação{article.action_count === 1 ? "" : "ões"}
          </span>
        ) : null}
        {article.attachment_count ? (
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {article.attachment_count} documento{article.attachment_count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default function Knowledge() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [openArticleId, setOpenArticleId] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = filter === "arquivadas" ? { archived: true } : {};
      if (filter === "fixadas") params.pinned = true;
      const { data } = await api.get("/knowledge/articles", { params });
      setArticles(filter === "arquivadas" ? data : data.filter((a) => !a.archived));
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar o Centro de Conhecimento"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Abrir diretamente a partir do link de uma notificação (?open=<id>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open");
    if (id) setOpenArticleId(id);
  }, []);

  // Pesquisa client-side sobre o que já vem na lista (título/etiquetas/
  // destaques) — mesmo padrão de Tasks.jsx, sem endpoint novo. O texto
  // completo das secções só é pesquisável dentro de cada artigo (a lista
  // não traz `sections` para se manter leve).
  const filtered = useMemo(() => {
    let list = articles;
    if (filter === "nao_lidas") list = list.filter((a) => !(a.read_count > 0));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => (
        (a.title || "").toLowerCase().includes(q)
        || (a.tags || []).some((t) => t.toLowerCase().includes(q))
        || (a.highlights || []).some((h) => h.toLowerCase().includes(q))
      ));
    }
    return list;
  }, [articles, filter, search]);

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="kicker">Correio Semanal, sempre à mão</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Centro de Conhecimento
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada edição fica guardada como um artigo permanente, organizado por assunto.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="knowledge-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por título, etiqueta ou destaque…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`knowledge-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${filter === f.key ? "bg-foreground text-background shadow-md shadow-slate-400/40" : "border border-border bg-card text-muted-foreground shadow-sm hover:-translate-y-0.5 hover:border-input hover:shadow-md"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? null : filtered.length === 0 ? (
        <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
          <EmptyMedia>
            <div className="card-elevated flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 text-red-600">
              <BookOpenCheck className="h-7 w-7" />
            </div>
          </EmptyMedia>
          <EmptyHeader className="max-w-xs gap-1">
            <EmptyTitle className="font-heading font-extrabold text-foreground">
              {articles.length === 0 ? "Ainda sem artigos" : "Nada por aqui"}
            </EmptyTitle>
            <EmptyDescription className="text-muted-foreground">
              {articles.length === 0
                ? "Assim que chegar o próximo Correio Semanal, o artigo aparece aqui automaticamente."
                : "Experimenta outro filtro ou termo de pesquisa."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} onOpen={setOpenArticleId} />
          ))}
        </div>
      )}

      <KnowledgeArticleDialog
        articleId={openArticleId}
        onOpenChange={(open) => { if (!open) setOpenArticleId(null); }}
        onChanged={load}
      />
    </div>
  );
}
