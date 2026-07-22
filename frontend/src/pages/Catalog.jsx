import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  const selectedModel = searchParams.get("modelo") || "";

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/caixilharia/catalog");
      setCatalog(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Não foi possível carregar o catálogo técnico."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

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
          <Button type="button" variant="outline" onClick={loadCatalog} className="mt-3 rounded-xl border-red-200 bg-card text-[color:var(--pastel-red-text)]">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <CatalogIntelligence analysis={catalog?.analise_tecnica} initialModelId={selectedModel} standalone />
      )}
    </div>
  );
}
