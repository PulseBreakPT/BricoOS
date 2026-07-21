import { Skeleton } from "@/components/ui/skeleton";

// Skeletons partilhados de toda a app — cada esqueleto tem a MESMA silhueta
// do conteúdo real que substitui (cartão de pedido, linha de lista), para a
// página não "saltar" quando os dados chegam. Entram em cascata com
// animate-fade-up, como o conteúdo real.

export function PedidoCardSkeleton({ index = 0 }) {
  return (
    <div className="card-elevated animate-fade-up rounded-2xl border border-border bg-card p-4 sm:p-5" style={{ "--stagger-i": index }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-3/4" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function ListRowSkeleton({ index = 0 }) {
  return (
    <div className="animate-fade-up rounded-xl border border-border bg-card p-3" style={{ "--stagger-i": index }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  );
}

// Lista de linhas em carregamento — atalho para as páginas de listas.
export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} index={i} />
      ))}
    </div>
  );
}
