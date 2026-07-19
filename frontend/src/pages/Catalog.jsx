import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, BookOpenCheck, ExternalLink, Loader2, RefreshCw,
  Ruler, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <header className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl sm:rounded-3xl">
        <div className="relative p-4 sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <Link to="/" className="relative inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos pedidos
          </Link>

          <div className="relative mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-300">
                <BookOpenCheck className="h-4 w-4" /> Centro técnico BandAlumínios
              </div>
              <h1 className="mt-2 font-heading text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
                Compare primeiro. Escolha depois.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Rankings, classificações, normas e fontes ficam concentrados aqui, sem alongar o preenchimento do pedido.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> Apenas dados verificáveis
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                  <Ruler className="h-3 w-3" /> {catalog?.aviso || "Vãos vistos por dentro"}
                </span>
              </div>
            </div>

            {catalog?.catalog_meta?.source_url ? (
              <a href={catalog.catalog_meta.source_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs font-bold text-white hover:bg-white/[0.1]">
                Catálogo oficial <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex h-3 items-end justify-between overflow-hidden border-t border-white/10 px-4 sm:px-6">
          {Array.from({ length: 32 }).map((_, index) => (
            <span key={index} className={`block w-px shrink-0 bg-amber-300/50 ${index % 5 === 0 ? "h-3" : "h-1.5"}`} />
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="text-center text-slate-500">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
            <p className="mt-2 text-xs font-bold">A recalcular o catálogo…</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="flex items-start gap-2 text-sm font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>
          <Button type="button" variant="outline" onClick={loadCatalog} className="mt-3 rounded-xl border-red-200 bg-white text-red-700">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <CatalogIntelligence analysis={catalog?.analise_tecnica} initialModelId={selectedModel} standalone />
      )}
    </div>
  );
}
