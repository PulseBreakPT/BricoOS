import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronDown, Pin, PinOff, Archive, ArchiveRestore, Share2, Printer, Plus,
  ClipboardList, Mail, Truck, Clock3, Sparkles, History as HistoryIcon, Cpu,
  Percent, Euro, MapPin, Tag, CalendarDays, ListTree,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import LabelEditor from "@/components/LabelEditor";
import AttachmentManager from "@/components/AttachmentManager";
import { TASK_STATUS_DOT, getTaskStatus } from "@/lib/taskMeta";
import { renderParagraphs } from "@/lib/knowledgeReading";

const HISTORY_ICON = {
  received: "📥", summarized: "🤖", created: "✅", tasks_created: "📋",
  read: "👤", pinned: "⭐", unpinned: "⭐", archived: "📦", unarchived: "📦",
  task_created: "📋",
};

const IMPLEMENTATION_ICON = { nao_iniciada: "⬜", em_curso: "🟡", concluida: "🟢" };
const IMPLEMENTATION_LABEL = { nao_iniciada: "Não iniciada", em_curso: "Em curso", concluida: "Concluída" };

const ENGINE_STATUS_META = {
  processado: { icon: "🟢", label: "Processado com o motor mais recente" },
  desatualizado: { icon: "🟡", label: "Motor mais recente disponível" },
  erro: { icon: "🔴", label: "Última tentativa falhou" },
};

function engineStatus(article) {
  if (article.last_error) return "erro";
  if ((article.engine_version || "") !== (article.current_engine_version || article.engine_version || "")) return "desatualizado";
  return "processado";
}

// Uma secção crítica/urgente ganha uma barra colorida à esquerda do cartão
// — chama a atenção sem exagerar, além da etiqueta de severidade discreta
// que já existe. Classes estáticas (não geradas dinamicamente) para o
// Tailwind conseguir encontrá-las na compilação.
const SEVERITY_BORDER = {
  critico: "border-l-4 border-l-[color:var(--pastel-red-text)]",
  urgente: "border-l-4 border-l-[color:var(--pastel-red-text)]",
};

// Chips por secção a partir de `section.facts` (já extraído pelo backend,
// ver extraction_patterns.py) — cada chave com o seu ícone/tom, sempre
// classes estáticas completas (ver nota acima).
const FACT_CHIP_META = {
  precos: { icon: Euro, cls: "bg-[var(--pastel-emerald-bg)] text-[color:var(--pastel-emerald-text)]" },
  descontos: { icon: Percent, cls: "bg-[var(--pastel-amber-bg)] text-[color:var(--pastel-amber-text)]" },
  locais: { icon: MapPin, cls: "bg-[var(--pastel-blue-bg)] text-[color:var(--pastel-blue-text)]" },
  itm: { icon: Tag, cls: "bg-[var(--pastel-purple-bg)] text-[color:var(--pastel-purple-text)]" },
  ean: { icon: Tag, cls: "bg-[var(--pastel-purple-bg)] text-[color:var(--pastel-purple-text)]" },
  contactos: { icon: Mail, cls: "bg-[var(--pastel-sky-bg)] text-[color:var(--pastel-sky-text)]" },
  datas: { icon: CalendarDays, cls: "bg-[var(--pastel-rose-bg)] text-[color:var(--pastel-rose-text)]" },
};
const FACT_CHIP_ORDER = ["precos", "descontos", "locais", "itm", "ean", "contactos", "datas"];
const FACT_CHIP_LIMIT = 6;

const READING_MODE_KEY = "brico_kc_reading_mode";

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

function MarkedText({ segments }) {
  return (
    <>
      {(segments || []).map((seg, i) => (
        seg.type === "mark" ? (
          <mark key={i} className="rounded bg-[var(--pastel-amber-bg)] px-0.5 font-semibold text-[color:var(--pastel-amber-text)]">
            {seg.value}
          </mark>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      ))}
    </>
  );
}

// Parágrafos reais (título/texto/lista) em vez de um único bloco de texto —
// ver frontend/src/lib/knowledgeReading.js. Sem `section.paragraphs` (artigo
// ainda não reprocessado com o motor atual), degrada para um parágrafo a
// partir de `section.text`.
function ParagraphBlocks({ section }) {
  const blocks = useMemo(() => renderParagraphs(section?.paragraphs, section), [section]);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return <p key={i} className="mt-3 font-bold text-[#111827] first:mt-0">{block.text}</p>;
        }
        if (block.kind === "list") {
          return (
            <div key={i} className="mt-2 space-y-1">
              {block.items.map((item, j) => (
                item.code ? (
                  <div key={j} className="flex items-baseline gap-2 rounded-lg bg-muted/40 px-2 py-1">
                    <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">{item.code}</span>
                    <span className="text-[16px] leading-[1.6] text-[color:var(--tone-slate-text)]">{item.rest}</span>
                  </div>
                ) : (
                  <div key={j} className="flex items-start gap-1.5 text-[16px] leading-[1.75] text-[color:var(--tone-slate-text)]">
                    <span className="mt-1 shrink-0 text-muted-foreground">•</span>
                    <span><MarkedText segments={item.segments} /></span>
                  </div>
                )
              ))}
            </div>
          );
        }
        return (
          <p key={i} className="mt-2 text-[16px] font-normal leading-[1.75] text-[color:var(--tone-slate-text)] first:mt-0">
            <MarkedText segments={block.segments} />
          </p>
        );
      })}
    </>
  );
}

function SectionChips({ section }) {
  const facts = section?.facts || {};
  const chips = [];
  outer:
  for (const key of FACT_CHIP_ORDER) {
    const meta = FACT_CHIP_META[key];
    for (const value of facts[key] || []) {
      if (chips.length >= FACT_CHIP_LIMIT) break outer;
      chips.push({ id: `${key}-${value}`, value, Icon: meta.icon, cls: meta.cls });
    }
  }
  if (!chips.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.id} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.cls}`}>
          <c.Icon className="h-2.5 w-2.5" /> {c.value}
        </span>
      ))}
    </div>
  );
}

// Renderiza os itens de um bucket — reaproveitado tanto pelo bloco sempre
// aberto "Informação importante" (acoes/datas) como pelas secções
// colapsáveis de "Conteúdo completo" (SectionBlock), para não duplicar a
// lógica de apresentação de cada tipo de item.
function BucketItems({ bucket, implementationByAction, onCreateTask, creatingActionId }) {
  if (bucket.key === "datas") {
    return (
      <div className="space-y-2.5">
        {bucket.items.map((d, i) => (
          <div key={i} className="rounded-xl border border-border/70 bg-muted/40 p-2.5 text-sm">
            <p className="font-semibold text-foreground">{d.weekday} · {d.date}</p>
            {(d.items || []).map((it, j) => (
              <p key={j} className="mt-0.5 text-xs text-muted-foreground">{it}</p>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {bucket.items.map((section, i) => {
        const impl = section.action_id ? implementationByAction[section.action_id] : null;
        const severityBorder = SEVERITY_BORDER[section.severity] || "";
        return (
          <div key={i} className={`rounded-xl border border-border/70 bg-muted/40 p-3 ${severityBorder}`}>
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
            <ParagraphBlocks section={section} />
            <SectionChips section={section} />
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
    </div>
  );
}

function SectionBlock({ bucket, implementationByAction, onCreateTask, creatingActionId, open, onToggle, sectionRef }) {
  return (
    <div ref={sectionRef} className="rounded-2xl border border-border bg-card">
      <Collapsible open={open} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-testid={`knowledge-bucket-${bucket.key}`}
            className="flex w-full items-center justify-between gap-2 p-3.5 text-left sm:p-4"
          >
            <span className="flex items-center gap-2 font-heading text-sm font-extrabold text-foreground">
              <span>{bucket.emoji}</span> {bucket.label}
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                {bucket.items.length}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/70 p-3.5 pt-3 sm:p-4">
          <BucketItems
            bucket={bucket} implementationByAction={implementationByAction}
            onCreateTask={onCreateTask} creatingActionId={creatingActionId}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Anexos/Histórico/auditoria do motor: mesma moldura colapsável, só muda o
// título/ícone/conteúdo — evita repetir a estrutura Collapsible 3 vezes.
function CollapsibleSection({ title, icon, defaultOpen, sectionRef, testId, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div ref={sectionRef} className="rounded-2xl border border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" data-testid={testId} className="flex w-full items-center justify-between gap-2 p-3.5 text-left sm:p-4">
            <span className="flex items-center gap-1.5 font-heading text-sm font-extrabold text-foreground">
              {icon}{title}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border/70 p-3.5 pt-3 sm:p-4">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Pastilhas horizontais (topo/cabeçalho fixo) ou lista vertical fixa
// (navegação lateral em ecrãs grandes) — mesmos itens, dois desenhos.
function TocNav({ items, activeKey, onJump, variant }) {
  if (variant === "side") {
    return (
      <nav className="space-y-0.5 text-xs">
        {items.map((it) => (
          <button
            key={it.key} type="button" onClick={() => onJump(it.key)}
            data-testid={`knowledge-toc-${it.key}`}
            className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left font-semibold transition-colors ${activeKey === it.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
          >
            {it.label}
          </button>
        ))}
      </nav>
    );
  }
  return (
    <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
      {items.map((it) => (
        <button
          key={it.key} type="button" onClick={() => onJump(it.key)}
          data-testid={`knowledge-toc-${it.key}`}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${activeKey === it.key ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// Resumo Executivo — cada item com `bucket_key` é clicável e faz scroll até
// essa secção; sem itens (não deve acontecer, é calculado a pedido — ver
// backend/knowledge.py: build_executive_summary), cai para `highlights`
// como acontecia antes desta funcionalidade, sem clique.
function ExecutiveSummary({ items, highlights, onJump }) {
  const hasItems = items && items.length > 0;
  if (!hasItems && !highlights?.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-[var(--pastel-amber-bg)] p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--pastel-amber-text)]">
        <Sparkles className="h-3.5 w-3.5" /> Resumo Executivo
      </p>
      <ul className="mt-1.5 space-y-1 text-sm font-semibold text-foreground">
        {hasItems ? items.map((item, i) => (
          <li key={i}>
            {item.bucket_key ? (
              <button
                type="button" data-testid={`knowledge-summary-jump-${item.bucket_key}`}
                onClick={() => onJump(item.bucket_key)}
                className="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                • {item.text}
              </button>
            ) : (
              <>• {item.text}</>
            )}
          </li>
        )) : highlights.map((h, i) => <li key={i}>• {h}</li>)}
      </ul>
    </div>
  );
}

export default function KnowledgeArticleDialog({ articleId, onOpenChange, onChanged }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingActionId, setCreatingActionId] = useState(null);
  const [tags, setTags] = useState([]);
  const [openBuckets, setOpenBuckets] = useState(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const [readingMode, setReadingMode] = useState(() => {
    try { return window.localStorage.getItem(READING_MODE_KEY) === "1"; } catch { return false; }
  });
  const [activeKey, setActiveKey] = useState("resumo");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

  const contentRef = useRef(null);
  const titleRef = useRef(null);
  const sectionRefs = useRef({});

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

  const groupedSections = article?.grouped_sections || [];
  const infoBuckets = useMemo(
    () => groupedSections.filter((b) => b.key === "acoes" || b.key === "datas"),
    [groupedSections],
  );
  const contentBuckets = useMemo(
    () => groupedSections.filter((b) => b.key !== "acoes" && b.key !== "datas" && b.key !== "anexos"),
    [groupedSections],
  );

  // Nova edição aberta: repõe o estado de leitura (secção aberta por
  // omissão, "ler mais" fechado, posição do índice) — nunca herda o
  // estado do artigo anterior.
  useEffect(() => {
    if (!article) return;
    sectionRefs.current = {};
    setOpenBuckets(new Set(contentBuckets[0] ? [contentBuckets[0].key] : []));
    setExpanded(false);
    setActiveKey("resumo");
    setScrollProgress(0);
    setShowStickyHeader(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  const tocItems = useMemo(() => {
    const items = [{ key: "resumo", label: "Resumo" }];
    if (infoBuckets.length) items.push({ key: "informacao", label: "Informação importante" });
    for (const b of contentBuckets) items.push({ key: b.key, label: b.label });
    items.push({ key: "anexos", label: "Anexos" });
    if (article?.history?.length) items.push({ key: "historico", label: "Histórico" });
    return items;
  }, [infoBuckets, contentBuckets, article?.history]);

  // Salto a partir do Resumo Executivo/índice/cabeçalho fixo — se o alvo for
  // um bucket de "Conteúdo completo" ainda escondido atrás de "Ler artigo
  // completo", ou fechado, garante primeiro que fica visível e aberto antes
  // de fazer scroll (só espera pelo layout quando o DOM muda de facto).
  const jumpTo = useCallback((key) => {
    const idx = contentBuckets.findIndex((b) => b.key === key);
    const needsExpand = idx > 0 && !expanded;
    if (needsExpand) setExpanded(true);
    if (idx >= 0) setOpenBuckets((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    const scroll = () => sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (needsExpand) {
      requestAnimationFrame(() => requestAnimationFrame(scroll));
    } else {
      scroll();
    }
  }, [expanded, contentBuckets]);

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0);
    if (titleRef.current) {
      const titleBottom = titleRef.current.getBoundingClientRect().bottom;
      const contentTop = el.getBoundingClientRect().top;
      setShowStickyHeader(titleBottom < contentTop);
    }
  }, []);

  // Destaca no índice a secção visível no topo do conteúdo enquanto se faz
  // scroll — root é o próprio DialogContent (já é o elemento com scroll).
  useEffect(() => {
    if (!article || readingMode) return undefined;
    const root = contentRef.current;
    if (!root) return undefined;
    const entries = Object.entries(sectionRefs.current).filter(([, el]) => el);
    if (!entries.length) return undefined;
    const observer = new IntersectionObserver(
      (obsEntries) => {
        const visible = obsEntries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) {
          const found = entries.find(([, el]) => el === visible[0].target);
          if (found) setActiveKey(found[0]);
        }
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: [0, 1] },
    );
    entries.forEach(([, el]) => observer.observe(el));
    return () => observer.disconnect();
  }, [article, expanded, readingMode, openBuckets]);

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

  const toggleReadingMode = () => {
    setReadingMode((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(READING_MODE_KEY, next ? "1" : "0"); } catch { /* localStorage indisponível */ }
      return next;
    });
  };

  const toggleBucket = (key) => {
    setOpenBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const expandAll = () => setOpenBuckets(new Set(contentBuckets.map((b) => b.key)));
  const collapseAll = () => setOpenBuckets(new Set());

  return (
    <Dialog open={!!articleId} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onScroll={handleScroll}
        data-testid="knowledge-article-dialog"
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl"
      >
        {loading || !article ? (
          <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
        ) : (
          <>
            <div className="sticky top-0 z-30 -mx-4 h-[3px] bg-muted sm:-mx-6">
              <div
                className="h-full bg-[var(--signal)] transition-[width] duration-150"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>

            {showStickyHeader && !readingMode ? (
              <div className="sticky top-[3px] z-20 -mx-4 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
                <p className="shrink-0 truncate text-xs font-extrabold text-foreground">{article.title}</p>
                <div className="min-w-0 flex-1">
                  <TocNav items={tocItems} activeKey={activeKey} onJump={jumpTo} variant="top" />
                </div>
              </div>
            ) : null}

            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div ref={titleRef} className="min-w-0">
                  <DialogTitle className="font-heading text-xl font-bold tracking-tight">{article.title}</DialogTitle>
                  {article.week_label || article.issue_date ? (
                    <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {[article.week_label, article.issue_date].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button" size="sm" variant="outline" onClick={toggleReadingMode}
                  data-testid="knowledge-reading-mode-toggle"
                  className="h-8 shrink-0 rounded-lg text-xs"
                >
                  📖 {readingMode ? "Sair do modo leitura" : "Modo Leitura"}
                </Button>
              </div>
            </DialogHeader>

            <div className={`flex flex-col gap-6 ${readingMode ? "" : "lg:flex-row lg:items-start"}`}>
              {!readingMode && tocItems.length > 2 ? (
                <div className="lg:hidden">
                  <TocNav items={tocItems} activeKey={activeKey} onJump={jumpTo} variant="top" />
                </div>
              ) : null}

              <div className="mx-auto w-full min-w-0 max-w-[760px] flex-1 space-y-4">
                <div ref={(el) => { sectionRefs.current.resumo = el; }}>
                  <ExecutiveSummary items={article.executive_summary} highlights={article.highlights} onJump={jumpTo} />
                </div>

                {!readingMode ? (
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
                        <p className="font-mono text-lg font-black tabular-nums text-foreground">{value ?? "–"}</p>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {infoBuckets.length ? (
                  <div ref={(el) => { sectionRefs.current.informacao = el; }} className="space-y-3">
                    <p className="flex items-center gap-1.5 font-heading text-sm font-extrabold text-foreground">
                      ⚠️ Informação importante
                    </p>
                    {infoBuckets.map((bucket) => (
                      <div
                        key={bucket.key} ref={(el) => { sectionRefs.current[bucket.key] = el; }}
                        className="rounded-2xl border border-amber-200 bg-card p-3.5 sm:p-4"
                      >
                        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          <span>{bucket.emoji}</span> {bucket.label}
                        </p>
                        <BucketItems
                          bucket={bucket} implementationByAction={implementationByAction}
                          onCreateTask={createTask} creatingActionId={creatingActionId}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {contentBuckets.length ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-heading text-sm font-extrabold text-foreground">Conteúdo completo</p>
                      {expanded && contentBuckets.length > 1 ? (
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={expandAll} data-testid="knowledge-expand-all" className="h-7 rounded-lg px-2 text-[11px]">
                            Expandir tudo
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={collapseAll} data-testid="knowledge-collapse-all" className="h-7 rounded-lg px-2 text-[11px]">
                            Recolher tudo
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {(expanded ? contentBuckets : contentBuckets.slice(0, 1)).map((bucket) => (
                      <SectionBlock
                        key={bucket.key} bucket={bucket} implementationByAction={implementationByAction}
                        onCreateTask={createTask} creatingActionId={creatingActionId}
                        open={openBuckets.has(bucket.key)} onToggle={() => toggleBucket(bucket.key)}
                        sectionRef={(el) => { sectionRefs.current[bucket.key] = el; }}
                      />
                    ))}
                    {!expanded && contentBuckets.length > 1 ? (
                      <Button
                        type="button" variant="outline" onClick={() => setExpanded(true)}
                        data-testid="knowledge-expand-full" className="w-full rounded-xl"
                      >
                        Ler artigo completo (+{contentBuckets.length - 1} secç{contentBuckets.length - 1 === 1 ? "ão" : "ões"})
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {!readingMode && (diff?.added_sections?.length || diff?.removed_sections?.length || article.recurring_themes?.length) ? (
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

                {!readingMode && (article.linked_tasks?.length || article.related_notes?.length || article.related_suppliers?.length) ? (
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

                <CollapsibleSection
                  title="Anexos" icon={null} defaultOpen={!article.attachment_count}
                  sectionRef={(el) => { sectionRefs.current.anexos = el; }}
                  testId="knowledge-section-anexos"
                >
                  <AttachmentManager ownerKind="knowledge_article" ownerId={article.id} />
                </CollapsibleSection>

                {!readingMode && article.history?.length ? (
                  <CollapsibleSection
                    title="Histórico" icon={<HistoryIcon className="h-3.5 w-3.5" />}
                    sectionRef={(el) => { sectionRefs.current.historico = el; }}
                    testId="knowledge-section-historico"
                  >
                    <div className="space-y-1.5">
                      {article.history.map((h) => (
                        <div key={h.id} className="flex items-center gap-2 text-xs">
                          <span className="shrink-0">{HISTORY_ICON[h.type] || "•"}</span>
                          <span className="flex-1 text-foreground">{h.message}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDateTime(h.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                ) : null}

                {!readingMode ? (
                  <Collapsible className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button type="button" data-testid="knowledge-engine-audit-trigger" className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold text-muted-foreground">
                        <Cpu className="h-3 w-3 shrink-0" />
                        Processado com o motor {article.engine_version || "–"}
                        <ChevronDown className="ml-auto h-3 w-3 shrink-0" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                      <p>
                        {ENGINE_STATUS_META[engineStatus(article)].icon} {ENGINE_STATUS_META[engineStatus(article)].label}
                      </p>
                      {article.last_processed_at ? <p>Último processamento: {formatDateTime(article.last_processed_at)}</p> : null}
                      <p>Reprocessado {article.reprocess_count || 0}×</p>
                      {article.last_error ? <p className="text-[color:var(--pastel-red-text)]">Último erro: {article.last_error}</p> : null}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}

                {!readingMode ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-muted-foreground">Etiquetas</p>
                    <LabelEditor
                      testIdPrefix="knowledge-label"
                      labels={tags}
                      onChange={(next) => { setTags(next); patchArticle({ tags: next }); }}
                    />
                  </div>
                ) : null}
              </div>

              {!readingMode && tocItems.length > 2 ? (
                <div className="hidden lg:block lg:w-56 lg:shrink-0 lg:self-start lg:sticky lg:top-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <ListTree className="h-3.5 w-3.5" /> Índice
                  </p>
                  <TocNav items={tocItems} activeKey={activeKey} onJump={jumpTo} variant="side" />
                </div>
              ) : null}
            </div>

            {!readingMode ? (
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
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
