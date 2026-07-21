import { Star } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";

// Botão de fixar/desafixar, igual em qualquer sítio da app — fornecedor,
// email, ficheiro ou tarefa. item: { kind, id, label, sublabel, to, external }.
export default function FavoriteToggle({ item, className = "", size = "h-4 w-4" }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(item.kind, item.id);
  return (
    <button
      type="button"
      data-testid={`favorite-toggle-${item.kind}-${item.id}`}
      title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(item); }}
      className={`shrink-0 rounded-lg p-1.5 text-slate-300 transition-transform duration-150 hover:scale-125 hover:text-amber-400 active:scale-90 ${className}`}
    >
      <Star className={`${size} ${fav ? "fill-amber-400 text-amber-400" : ""}`} />
    </button>
  );
}
