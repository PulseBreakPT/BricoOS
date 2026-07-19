import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  ));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Mesmo ponto de quebra "lg" do Tailwind — só aí faz sentido janelas
// flutuantes; em ecrãs mais pequenos a Área de Trabalho usa navegação normal.
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
