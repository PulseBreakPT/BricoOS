import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronDown, Pin, PinOff, Archive, ArchiveRestore, Share2, Printer, Plus,
  ClipboardList, Mail, Truck, Clock3, Sparkles, History as HistoryIcon,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import LabelEditor from "@/components/LabelEditor";
import AttachmentManager from "@/components/AttachmentManager";
import { TASK_STATUS_DOT, getTaskStatus } from "@/lib/taskMeta";

const HISTORY_ICON = {
  received: "📥", summarized: "🤖", created: "✅", tasks_created: "📋",
  read: "👤", pinned: "⭐", unpinned: "⭐", archived: "📦", unarchived: "📦",
  task_created: "📋",
};

const IMPLEMENTATION_ICON = { nao_iniciada: "⬜", em_curso: "🟡", concluida: "🟢" };
const IMPLEMENTATION_LABEL = { nao_iniciada: "Não iniciada", em_curso: "Em curso", concluida: "Concluída" };

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function estimateReadingMinutes(sections) {
  const words = (sections || []).reduce(
    (n, s) => n + (s.text || "").split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 200));
}

function SectionBlock({ bucket, implementationByAction, onCreateTask, creatingActionId }) {
  const [open, setOpen] = useState(bucket.key === "acoes");
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid={`knowledge-bucket-${bucket.key}`}
          className="flex w-full items-center justify-between gap-2 p-3.5 text-left sm:p-4"
        >
          <span className="flex items-center gap-2 font-heading text-sm font-extrabold text-foreground">
            <span>{bucket.emoji}</span> {bucket.label}
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
              {bucket.key === "anexos" ? bucket.count : bucket.items.length}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2.5 border-t border-border/70 p-3.5 pt-3 sm:p-4">
        {bucket.key === "datas" ? (
          bucket.items.map((d, i) => (
            <div key={i} className="rounded-xl border border-border/70 bg-muted/40 p-2.5 text-sm">
              <p className="font-semibold text-foreground">{d.weekday} · {d.date}</p>
              {(d.items || []).map((it, j) => (
                <p key={j} className="mt-0.5 text-xs text-muted-foreground">{it}</p>
              ))}
            </div>
          ))
        ) : bucket.items.map((section, i) => {
          const impl = section.action_id ? implementationByAction[section.action_id] : null;
          return (
            <div key={i} className="rounded-xl border border-border/70 bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-foreground">
                  {impl ? <span className="mr-1.5">{IMPLEMENTATION_ICON[impl.state]}</span> : null}
                  {section.title}
                </p>
                {section.severity ? (
                  <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    {section.severity}
                  </span>
                ) : null}
              </div>
              {section.text ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{section.text}</p> : null}
              {section.checked_actions?.length ? (
                <ul className="mt-1.5 space-y-0.5 text-xs font-semibold text-foreground">
                  {section.checked_actions.map((a, j) => <li key={j}>• {a}</li>)}
                </ul>
              ) : null}
              {section.action_id ? (
                impl?.task_id ? (
                  <p className="mt-2 text-[11px] font-bold text-muted-foreground">
                    {IMPLEMENTATION_ICON[impl.state]} Já tem tarefa ligada ({IMPLEMENTATION_LABEL[impl.state]})
                  </p>
                ) : (
                  <Button
                    type="button" size="sm" variant="outline"
                    data-testid={`knowledge-create-task-${section.action_id}`}
                    disabled={creatingActionId === section.action_id}
                    onClick={() => onCreateTask(section.action_id)}
                    className="mt-2 h-7 rounded-lg px-2.5 text-xs"
                  >
                    {creatingActionId === section.action_id ? <Spinner className="mr-1.5 h-3 w-3" /> : <Plus className="mr-1.5 h-3 w-3" />}
                    Criar tarefa
                  </Button>
                )
              ) : null}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function KnowledgeArticleDialog({ articleId, onOpenChange, onChanged }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingActionId, setCreatingActionId] = useState(null);
  const [tags, setTags] = useState([]);

  useEffect(() => {
    if (!articleId) { setArticle(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/knowledge/articles/${articleId}`);
        if (cancelled) return;
        setArticle(data);
        setTags(data.tags || []);
        api.post(`/knowledge/articles/${articleId}/open`).catch(() => {});
      } catch (e) {
        if (!cancelled) toast.error(getErrorMessage(e, "Erro ao carregar o artigo"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [articleId]);

  const implementationByAction = useMemo(() => {
    const map = {};
    for (const item of article?.implementation?.items || []) map[item.action_id] = item;
    return map;
  }, [article]);

  const readingMinutes = useMemo(() => estimateReadingMinutes(article?.sections), [article]);
  const pendingActions = (article?.implementation?.items || []).filter((i) => i.state !== "concluida").length;
  const diff = article?.diff_since_previous;
  const changesCount = diff ? (diff.added_sections?.length || 0) + (diff.removed_sections?.length || 0) : 0;

  const patchArticle = async (patch) => {
    if (!article) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/knowledge/articles/${article.id}`, patch);
      setArticle((prev) => ({ ...prev, ...data }));
      onChanged?.();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar"));
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (actionId) => {
    setCreatingActionId(actionId);
    try {
      await api.post(`/knowledge/articles/${article.id}/create-task`, { action_id: actionId });
      toast.success("Tarefa criada", { description: "Ligada a esta ação do artigo." });
      const { data } = await api.get(`/knowledge/articles/${article.id}`);
      setArticle(data);
      onChanged?.();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar a tarefa"));
    } finally {
      setCreatingActionId(null);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/conhecimento?open=${article.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: article.title, url }); return; } catch { /* utilizador cancelou */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  return (
    <Dialog open={!!articleId} onOpenChange={onOpenChange}>
      <DialogContent data-testid="knowledge-article-dialog" className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {loading || !article ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl font-bold tracking-tight">{article.title}</DialogTitle>
            </DialogHeader>

            {article.highlights?.length ? (
              <div className="rounded-2xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-amber-text)]">
                  <Sparkles className="h-3.5 w-3.5" /> O mais importante desta edição
                </p>
                <ul className="mt-1.5 space-y-1 text-sm font-semibold text-foreground">
                  {article.highlights.map((h, i) => <li key={i}>• {h}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                ["Leitura", `${readingMinutes} min`],
                ["Importantes", article.important_count],
                ["Ações", pendingActions],
                ["Prazos", article.deadlines_calendar?.length || 0],
                ["Documentos", article.attachment_count],
                ["Alterações", changesCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted/40 p-2 text-center">
                  <p className="font-mono text-sm font-black tabular-nums text-foreground">{value ?? "–"}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {article.grouped_sections?.filter((b) => b.key !== "anexos").map((bucket) => (
              <SectionBlock
                key={bucket.key} bucket={bucket} implementationByAction={implementationByAction}
                onCreateTask={createTask} creatingActionId={creatingActionId}
              />
            ))}

            {(diff?.added_sections?.length || diff?.removed_sections?.length || article.recurring_themes?.length) ? (
              <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <p className="font-heading text-sm font-extrabold text-foreground">Comparar com a semana anterior</p>
                {diff?.added_sections?.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Novidades</p>
                    {diff.added_sections.map((t, i) => <p key={i} className="text-xs text-foreground">+ {t}</p>)}
                  </div>
                ) : null}
                {diff?.removed_sections?.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-red-600">Removido</p>
                    {diff.removed_sections.map((t, i) => <p key={i} className="text-xs text-foreground">− {t}</p>)}
                  </div>
                ) : null}
                {article.recurring_themes?.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Temas repetidos</p>
                    {article.recurring_themes.map((t, i) => <p key={i} className="text-xs text-foreground">↻ {t}</p>)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(article.linked_tasks?.length || article.related_notes?.length || article.related_suppliers?.length || article.attachment_count) ? (
              <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <p className="font-heading text-sm font-extrabold text-foreground">Relacionados</p>
                <div className="mt-2 space-y-1.5">
                  {article.linked_tasks?.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TASK_STATUS_DOT[getTaskStatus(t)]}`} />
                      <ClipboardList className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{t.title}</span>
                    </div>
                  ))}
                  {article.related_notes?.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 text-xs text-foreground">
                      <Mail className="h-3 w-3 shrink-0 text-muted-foreground" /> {n.customer_name || n.description || "Pedido"}
                    </div>
                  ))}
                  {article.related_suppliers?.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs text-foreground">
                      <Truck className="h-3 w-3 shrink-0 text-muted-foreground" /> {s.name}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {article.history?.length ? (
              <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <p className="flex items-center gap-1.5 font-heading text-sm font-extrabold text-foreground">
                  <HistoryIcon className="h-3.5 w-3.5" /> Timeline
                </p>
                <div className="mt-2 space-y-1.5">
                  {article.history.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0">{HISTORY_ICON[h.type] || "•"}</span>
                      <span className="flex-1 text-foreground">{h.message}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDateTime(h.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">Etiquetas</p>
              <LabelEditor
                testIdPrefix="knowledge-label"
                labels={tags}
                onChange={(next) => { setTags(next); patchArticle({ tags: next }); }}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">Anexos</p>
              <AttachmentManager ownerKind="knowledge_article" ownerId={article.id} />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button
                type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => patchArticle({ pinned: !article.pinned })}
                className="h-8 rounded-lg text-xs"
              >
                {article.pinned ? <PinOff className="mr-1.5 h-3.5 w-3.5" /> : <Pin className="mr-1.5 h-3.5 w-3.5" />}
                {article.pinned ? "Desafixar" : "Fixar"}
              </Button>
              <Button
                type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => patchArticle({ archived: !article.archived })}
                className="h-8 rounded-lg text-xs"
              >
                {article.archived ? <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
                {article.archived ? "Desarquivar" : "Arquivar"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={share} className="h-8 rounded-lg text-xs">
                <Share2 className="mr-1.5 h-3.5 w-3.5" /> Partilhar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()} className="h-8 rounded-lg text-xs">
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
              </Button>
              <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <Clock3 className="h-3 w-3" /> Lido {article.read_count || 0}×
                {article.last_read_at ? ` · última vez ${formatDateTime(article.last_read_at)}` : ""}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
