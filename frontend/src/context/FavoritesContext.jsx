import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "brico_favorites_v1";

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const FavoritesCtx = createContext(null);

// Favoritos unificados — fornecedor, email, ficheiro/PDF, tarefa: qualquer
// uma destas entidades pode ser fixada do mesmo jeito, e fica sempre
// acessível a partir do mesmo painel (FavoritesPanel). Só local ao
// dispositivo, como o resto da Área de Trabalho — sem novo campo no
// servidor. Pedidos ficam de fora de propósito: já têm o seu próprio
// favorito no servidor (note.favorite) usado também para filtrar a lista;
// o FavoritesPanel lê esses diretamente da API em vez de duplicar o estado.
export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(load);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); } catch { /* quota cheia ou modo privado */ }
  }, [favorites]);

  const isFavorite = useCallback((kind, id) => favorites.some((f) => f.kind === kind && f.id === id), [favorites]);

  // item: { kind, id, label, sublabel, to } — "to" é o caminho para onde
  // navegar ao tocar no favorito (rota da lista, ou o ficheiro em si no
  // caso de um PDF).
  const toggleFavorite = useCallback((item) => {
    setFavorites((prev) => (
      prev.some((f) => f.kind === item.kind && f.id === item.id)
        ? prev.filter((f) => !(f.kind === item.kind && f.id === item.id))
        : [{ ...item, addedAt: new Date().toISOString() }, ...prev]
    ));
  }, []);

  const removeFavorite = useCallback((kind, id) => {
    setFavorites((prev) => prev.filter((f) => !(f.kind === kind && f.id === id)));
  }, []);

  const value = useMemo(() => ({
    favorites, isFavorite, toggleFavorite, removeFavorite,
  }), [favorites, isFavorite, toggleFavorite, removeFavorite]);

  return <FavoritesCtx.Provider value={value}>{children}</FavoritesCtx.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesCtx);
  if (!ctx) throw new Error("useFavorites deve ser usado dentro de FavoritesProvider");
  return ctx;
}
