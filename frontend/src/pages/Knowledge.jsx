import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck, CalendarDays, CheckCircle2, ClipboardList, Clock,
  Download, Pin, RefreshCw, Search, Sparkles, Upload, X, XCircle, Zap,
} from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { toast } from "sonner";
import KnowledgeArticleDialog from "@/components/KnowledgeArticleDialog";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "nao_lidas", label: "Não lidas" },
  { key: "atencao", label: "Precisa de atenção" },
  { key: "fixadas", label: "Fixadas" },
  { key: "arquivadas", label: "Arquivadas" },
];

// Mesmo mapa de estados que Emails.jsx (CSN_STATUS_META) — cada ficheiro tem
// a sua cópia porque a etiqueta/cor muda ligeiramente de contexto (aqui é
// sempre sobre um email por processar, nunca sobre a inbox toda).
const CSN_STATUS_META = {
  nao_processado: { icon: "⚪", label: "Nunca processado" },
  processado: { icon: "🟢", label: "Processado" },
  desatualizado: { icon: "🟡", label: "Motor antigo" },
  erro: { icon: "🔴", label: "Erro no processamento" },
};

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

// Lote processado do lado do frontend, um pedido de cada vez (não em
// paralelo — a barra de progresso faz sentido e não sobrecarrega o servidor
// com vários PDFs grandes em simultâneo). Reaproveitado por "Importar",
// "Reprocessar desatualizados" e "Reprocessar tudo": só muda a lista de
// candidatos. Um item a falhar não pára o lote — fica registado no
// relatório final e o ciclo continua.
function useBatchProcessor(onDone) {
  const [state, setState] = useState(null);
  const cancelRef = useRef(false);

  const run = useCallback(async (items) => {
    cancelRef.current = false;
    const startedAt = Date.now();
    const results = [];
    setState({ running: true, done: 0, total: items.length, current: items[0]?.subject || "", cancelled: false, results: [] });
    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      const item = items[i];
      setState((s) => ({ ...s, current: item.subject, done: i }));
      try {
        const { data } = await api.post(`/emails/${item.email_id}/process-correio-semanal`);
        results.push({ email_id: item.email_id, subject: item.subject, ok: true, article_id: data.article_id });
      } catch (e) {
        results.push({ email_id: item.email_id, subject: item.subject, ok: false, error: getErrorMessage(e, "Falha ao processar") });
      }
      setState((s) => ({ ...s, done: i + 1, results: [...results] }));
    }
    setState((s) => ({
      ...s, running: false, cancelled: cancelRef.current,
      elapsedMs: Date.now() - startedAt, results,
    }));
    onDone?.();
  }, [onDone]);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);
  const reset = useCallback(() => setState(null), []);

  return { state, run, cancel, reset };
}

function BatchProgress({ state, onCancel, onClose }) {
  if (!state) return null;
  if (state.running) {
    const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
    return (
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Spinner className="h-3.5 w-3.5" /> A processar… {state.done} / {state.total}
          </p>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-xs" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        <Progress value={pct} className="mt-2 h-1.5" />
        {state.current ? (
          <p className="mt-1.5 truncate text-meta text-text-tertiary">{state.current}</p>
        ) : null}
      </div>
    );
  }
  const ok = state.results.filter((r) => r.ok).length;
  const failed = state.results.filter((r) => !r.ok);
  const skipped = state.cancelled ? state.total - state.results.length : 0;
  const seconds = Math.max(1, Math.round((state.elapsedMs || 0) / 1000));
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">Lote concluído</p>
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {ok} processado{ok === 1 ? "" : "s"}</span>
        {failed.length ? (
          <span className="flex items-center gap-1 text-[color:var(--pastel-red-text)]"><XCircle className="h-3.5 w-3.5" /> {failed.length} erro{failed.length === 1 ? "" : "s"}</span>
        ) : null}
        {skipped ? (
          <span className="flex items-center gap-1 text-text-tertiary">⏭️ {skipped} ignorado{skipped === 1 ? "" : "s"} (cancelado)</span>
        ) : null}
        <span className="flex items-center gap-1 text-text-tertiary"><Clock className="h-3.5 w-3.5" /> {seconds}s</span>
      </div>
      {failed.length ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold text-text-tertiary">Ver detalhes dos erros</summary>
          <ul className="mt-1.5 space-y-1">
            {failed.map((r) => (
              <li key={r.email_id} className="flex flex-col gap-0.5 rounded-lg bg-[var(--pastel-red-bg)] p-2 text-[color:var(--pastel-red-text)]">
                <span className="font-semibold">{r.subject}</span>
                <span>{r.error}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
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
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${read ? "bg-success" : "bg-muted-foreground/30"}`}
          title={read ? "Já aberto" : "Nunca aberto"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-heading text-sm font-extrabold text-foreground">{article.title}</p>
            {article.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-foreground" /> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-meta text-text-tertiary">
            <CalendarDays className="h-3 w-3" /> {formatDate(article.issue_date || article.created_at)}
          </p>
        </div>
      </div>
      {article.highlights?.[0] ? (
        <p className="flex items-start gap-1.5 text-xs text-text-body">
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

function AttentionRow({ item, busy, onProcess, onOpenArticle }) {
  const meta = CSN_STATUS_META[item.status] || CSN_STATUS_META.nao_processado;
  return (
    <div
      data-testid={`knowledge-attention-${item.email_id}`}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
          {meta.icon} {item.subject}
        </p>
        <p className="mt-0.5 text-meta text-text-tertiary">
          {meta.label} · {formatDate(item.received_at)}
          {item.status === "erro" && item.error_message ? ` · ${item.error_message}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {item.article_id ? (
          <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => onOpenArticle(item.article_id)}>
            Ver artigo
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={busy} className="h-7 rounded-lg px-2.5 text-xs" onClick={onProcess}>
          {busy ? <Spinner className="mr-1.5 h-3 w-3" /> : <Zap className="mr-1.5 h-3 w-3" />}
          {item.status === "erro" ? "Tentar novamente" : item.status === "desatualizado" ? "Atualizar" : "Processar"}
        </Button>
      </div>
    </div>
  );
}

export default function Knowledge() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [openArticleId, setOpenArticleId] = useState(null);
  const [csnStatus, setCsnStatus] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importSelected, setImportSelected] = useState(() => new Set());
  const [singleBusy, setSingleBusy] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const correioUploadRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const params = filter === "arquivadas" ? { archived: true } : {};
      if (filter === "fixadas") params.pinned = true;
      const { data } = await api.get("/knowledge/articles", { params });
      setArticles(filter === "arquivadas" ? data : data.filter((a) => !a.archived));
    } catch (e) {
      toast.error(getErrorMessage(e, "Erro ao carregar o Correio Semanal"));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadCsnStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/emails/correio-semanal/status");
      setCsnStatus(data);
    } catch {
      // silencioso — as ferramentas/filtro de atenção simplesmente ficam vazios
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCsnStatus(); }, [loadCsnStatus]);

  const refreshAll = useCallback(() => { load(); loadCsnStatus(); }, [load, loadCsnStatus]);
  const batch = useBatchProcessor(refreshAll);

  // Abrir diretamente a partir do link de uma notificação (?open=<id>) ou
  // pré-selecionar um filtro a partir do widget do Dashboard (?filtro=atencao).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open");
    if (id) setOpenArticleId(id);
    const f = params.get("filtro");
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f);
  }, []);

  const unprocessed = useMemo(() => csnStatus.filter((i) => i.status === "nao_processado"), [csnStatus]);
  const outdatedOrError = useMemo(() => csnStatus.filter((i) => i.status === "desatualizado" || i.status === "erro"), [csnStatus]);
  const attention = useMemo(
    () => csnStatus.filter((i) => i.status !== "processado").sort((a, b) => (b.received_at || "").localeCompare(a.received_at || "")),
    [csnStatus],
  );

  const runImport = () => {
    const items = unprocessed.filter((i) => importSelected.has(i.email_id));
    if (!items.length) return;
    setImportOpen(false);
    batch.run(items);
  };

  const runOutdated = () => {
    if (!outdatedOrError.length) return;
    batch.run(outdatedOrError);
  };

  const runAll = () => {
    if (!csnStatus.length) return;
    if (!window.confirm(`Reprocessar todas as ${csnStatus.length} edições? Pode demorar.`)) return;
    batch.run(csnStatus);
  };

  const processSingle = async (emailId) => {
    if (singleBusy.has(emailId)) return;
    setSingleBusy((prev) => new Set(prev).add(emailId));
    try {
      const { data } = await api.post(`/emails/${emailId}/process-correio-semanal`);
      toast.success("Correio Semanal processado", { description: "Artigo do arquivo atualizado." });
      await loadCsnStatus();
      setOpenArticleId(data.article_id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível processar este Correio Semanal"));
    } finally {
      setSingleBusy((prev) => { const next = new Set(prev); next.delete(emailId); return next; });
    }
  };

  // Quando o Correio Semanal não chegou por email (ex.: alguém reencaminha
  // só o PDF por outra via) — carrega-se o ficheiro diretamente e o
  // servidor gera o mesmo resumo/artigo, reaproveitando o pipeline normal.
  const uploadCorreioSemanal = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const { data } = await api.post("/emails/correio-semanal/upload", fd);
      toast.success("Correio Semanal importado", { description: "Artigo criado no arquivo." });
      setImportOpen(false);
      setOpenArticleId(data.article_id);
    } catch (e) {
      // Mesmo numa falha (ex.: PDF sem nº de edição reconhecível), o
      // registo fica gravado do lado do servidor — refreshAll() traz-o
      // para a lista de "atenção" com o botão "Tentar novamente", em vez
      // de o PDF enviado simplesmente desaparecer.
      toast.error(getErrorMessage(e, "Não foi possível processar o PDF"));
    } finally {
      setUploading(false);
      if (correioUploadRef.current) correioUploadRef.current.value = "";
      await refreshAll();
    }
  };

  const toggleImportSelected = (emailId) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId); else next.add(emailId);
      return next;
    });
  };

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

  const showingAttention = filter === "atencao";

  return (
    <div>
      <div className="flex flex-col gap-1">
        <p className="kicker">Correio Semanal, sempre à mão</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Correio Semanal
        </h1>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          data-testid="knowledge-tool-import"
          size="sm" variant="outline" className="h-9 rounded-xl text-xs"
          disabled={batch.state?.running}
          onClick={() => { setImportSelected(new Set(unprocessed.map((i) => i.email_id))); setImportOpen(true); }}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Importar Correios Semanais
          {unprocessed.length ? ` (${unprocessed.length})` : ""}
        </Button>
        <Button
          data-testid="knowledge-tool-outdated"
          size="sm" variant="outline" className="h-9 rounded-xl text-xs"
          disabled={!outdatedOrError.length || batch.state?.running}
          onClick={runOutdated}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reprocessar desatualizados
          {outdatedOrError.length ? ` (${outdatedOrError.length})` : ""}
        </Button>
        <Button
          data-testid="knowledge-tool-all"
          size="sm" variant="outline" className="h-9 rounded-xl text-xs"
          disabled={!csnStatus.length || batch.state?.running}
          onClick={runAll}
        >
          <Zap className="mr-1.5 h-3.5 w-3.5" /> Reprocessar tudo
        </Button>
      </div>

      {batch.state ? (
        <BatchProgress state={batch.state} onCancel={batch.cancel} onClose={batch.reset} />
      ) : null}

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
            {f.key === "atencao" && attention.length ? `${f.label} (${attention.length})` : f.label}
          </button>
        ))}
      </div>

      {showingAttention ? (
        attention.length === 0 ? (
          <Empty className="mt-10 rounded-3xl border-2 border-dashed border-border bg-card/60 px-6 py-14">
            <EmptyMedia>
              <div className="card-elevated flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-white to-slate-50 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </EmptyMedia>
            <EmptyHeader className="max-w-xs gap-1">
              <EmptyTitle className="font-heading font-extrabold text-foreground">Tudo em dia</EmptyTitle>
              <EmptyDescription className="text-text-body">
                Não há Correios Semanais por processar, desatualizados ou com erro.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mt-5 flex flex-col gap-2.5">
            {attention.map((item) => (
              <AttentionRow
                key={item.email_id}
                item={item}
                busy={singleBusy.has(item.email_id)}
                onProcess={() => processSingle(item.email_id)}
                onOpenArticle={setOpenArticleId}
              />
            ))}
          </div>
        )
      ) : loading ? null : filtered.length === 0 ? (
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
            <EmptyDescription className="text-text-body">
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

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Importar Correios Semanais</SheetTitle>
          </SheetHeader>

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <p className="text-xs font-bold text-foreground">Não chegou por email?</p>
            <p className="mt-0.5 text-xs text-text-tertiary">Carrega o PDF diretamente — o resumo é gerado da mesma forma.</p>
            <input
              ref={correioUploadRef}
              data-testid="correio-semanal-upload-input"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => uploadCorreioSemanal(e.target.files)}
            />
            <Button
              data-testid="correio-semanal-upload-trigger"
              size="sm" variant="outline" disabled={uploading}
              onClick={() => correioUploadRef.current?.click()}
              className="mt-2 h-8 rounded-lg text-xs"
            >
              {uploading ? <Spinner className="mr-1.5 h-3 w-3" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {uploading ? "A processar…" : "Carregar PDF"}
            </Button>
          </div>

          <p className="px-1 text-xs font-bold text-text-tertiary">Ou escolhe da lista de emails já recebidos</p>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">{importSelected.size} selecionado{importSelected.size === 1 ? "" : "s"}</p>
            <Button
              size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-xs"
              onClick={() => setImportSelected(
                importSelected.size === unprocessed.length ? new Set() : new Set(unprocessed.map((i) => i.email_id)),
              )}
            >
              {importSelected.size === unprocessed.length ? "Limpar seleção" : "Selecionar todos"}
            </Button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {unprocessed.map((item) => (
              <label
                key={item.email_id}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-xs font-semibold text-foreground"
              >
                <Checkbox
                  checked={importSelected.has(item.email_id)}
                  onCheckedChange={() => toggleImportSelected(item.email_id)}
                />
                <span className="min-w-0 flex-1 truncate">{item.subject}</span>
                <span className="shrink-0 text-meta font-normal text-text-tertiary">{formatDate(item.received_at)}</span>
              </label>
            ))}
            {unprocessed.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Não há Correios Semanais por importar.</p>
            ) : null}
          </div>
          <Button
            data-testid="knowledge-import-confirm"
            disabled={!importSelected.size}
            onClick={runImport}
            className="w-full rounded-xl"
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Processar {importSelected.size || ""} selecionado{importSelected.size === 1 ? "" : "s"}
          </Button>
        </SheetContent>
      </Sheet>

      <KnowledgeArticleDialog
        articleId={openArticleId}
        onOpenChange={(open) => { if (!open) setOpenArticleId(null); }}
        onChanged={refreshAll}
      />
    </div>
  );
}
