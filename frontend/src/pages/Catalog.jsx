import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, BookOpenCheck, ExternalLink, RefreshCw,
  Ruler, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import CatalogIntelligence from "@/components/CatalogIntelligence";
import api, { getErrorMessage } from "@/lib/api";

export default function Catalog() {
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const selectedModel = searchParams.get("modelo") || "";

  const requestSeq = useRef(0);
  const retryBtnRef = useRef(null);
  const hadErrorBefore = useRef(false);
  const hasDataRef = useRef(false); // evita recriar loadCatalog a cada resposta (catalog mudaria de identidade)

  const loadCatalog = useCallback(async (signal) => {
    const seq = ++requestSeq.current;
    const hasData = hasDataRef.current;
    // Uma atualização em segundo plano (já há dados na página) não deve
    // esconder tudo atrás do spinner grande — só o primeiro carregamento
    // bloqueia a página inteira.
    if (hasData) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/caixilharia/catalog", { signal });
      if (seq !== requestSeq.current) return; // resposta ultrapassada por um pedido mais recente
      setCatalog(data);
      hasDataRef.current = true;
      setLastLoadedAt(Date.now());
    } catch (requestError) {
      if (axios.isCancel(requestError) || seq !== requestSeq.current) return;
      const message = getErrorMessage(requestError, "Não foi possível carregar o catálogo técnico.");
      if (hasData) {
        // Já havia catálogo na página — não vale a pena substituir tudo por
        // um ecrã de erro; o utilizador só perde uma atualização, não o que
        // já estava a ver.
        toast.error(message);
      } else {
        setError(message);
      }
    } finally {
      if (seq === requestSeq.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    // O controller pertence ao efeito, não ao loadCatalog — assim o cleanup
    // consegue cancelar o pedido a meio (mudança rápida de rota, StrictMode
    // a montar/desmontar duas vezes em dev), em vez de só descartar a resposta.
    const controller = new AbortController();
    loadCatalog(controller.signal);
    return () => controller.abort();
  }, [loadCatalog]);

  // Leva o foco para o botão de retry assim que o erro bloqueante aparece —
  // quem navega por teclado não fica perdido a meio da página.
  useEffect(() => {
    if (error && !hadErrorBefore.current) retryBtnRef.current?.focus();
    hadErrorBefore.current = !!error;
  }, [error]);

  // Ids de modelo conhecidos do catálogo — permite validar um deep-link
  // (?modelo=) sem depender de CatalogIntelligence já ter corrido.
  const catalogModelIds = useMemo(
    () => new Set(Object.keys(catalog?.analise_tecnica?.modelos || catalog?.modelos || {})),
    [catalog],
  );
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && selectedModel && catalogModelIds.size > 0 && !catalogModelIds.has(selectedModel)) {
      // eslint-disable-next-line no-console
      console.warn(`[Catalog] ?modelo=${selectedModel} não corresponde a nenhum modelo conhecido do catálogo.`);
    }
  }, [selectedModel, catalogModelIds]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="card-elevated relative overflow-hidden rounded-2xl border border-border bg-card sm:rounded-3xl">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dot-grid opacity-70" />
        <div className="relative p-4 sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-red-200/30 blur-3xl" />
          <Link to="/" className="relative inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos pedidos
          </Link>

          <div className="relative mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--pastel-blue-text)]">
                <BookOpenCheck className="h-4 w-4" /> Centro técnico BandAlumínios
              </div>
              <h1 className="mt-2 font-heading text-2xl font-black tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                Compara primeiro. Escolhe depois.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Rankings, classificações, normas e fontes ficam concentrados aqui, sem alongar o preenchimento do pedido.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-[var(--pastel-emerald-bg)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--pastel-emerald-text)]">
                  <ShieldCheck className="h-3 w-3" /> Apenas dados verificáveis
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                  <Ruler className="h-3 w-3 shrink-0" /> <span className="min-w-0">{catalog?.aviso || "Vãos vistos por dentro"}</span>
                </span>
              </div>
            </div>

            {catalog?.catalog_meta?.source_url ? (
              <a href={catalog.catalog_meta.source_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-input hover:shadow-md">
                Catálogo oficial <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex h-3 items-end justify-between overflow-hidden border-t border-border bg-muted/80 px-4 sm:px-6">
          {Array.from({ length: 32 }).map((_, index) => (
            <span key={index} className={`block w-px shrink-0 bg-amber-500/60 ${index % 5 === 0 ? "h-3" : "h-1.5"}`} />
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card">
          <div className="text-center text-muted-foreground">
            <Spinner className="mx-auto h-6 w-6" />
            <p className="mt-2 text-xs font-bold">A recalcular o catálogo…</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-[var(--pastel-red-bg)] p-4 text-[color:var(--pastel-red-text)]">
          <p className="flex items-start gap-2 text-sm font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>
          <Button ref={retryBtnRef} type="button" variant="outline" disabled={refreshing} onClick={() => loadCatalog()} className="mt-3 rounded-xl border-red-200 bg-card text-[color:var(--pastel-red-text)]">
            {refreshing ? <Spinner className="mr-1.5 h-4 w-4" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Tentar novamente
          </Button>
        </div>
      ) : (
        <CatalogIntelligence analysis={catalog?.analise_tecnica} initialModelId={selectedModel} loadedAt={lastLoadedAt} standalone />
      )}
    </div>
  );
}
