import { createContext, useContext, useMemo } from "react";

/* BRICO OS é exclusivamente light mode. Este contexto mantém a mesma API
   pública de sempre (useTheme, ThemeProvider, initializeTheme) para que os
   consumidores (ex.: sonner) continuem a funcionar, mas o tema é fixo. */

const STORAGE_KEY = "brico_os_theme";
const LEGACY_STORAGE_KEYS = ["theme", "brico_theme"]; // nomes usados por experiências anteriores de dark mode
const THEME_LOCKED = true;
const ThemeContext = createContext(null);

let didInitialize = false;
let themeColorMetaEl; // cache do lookup — evita repetir querySelector a cada applyTheme()

function getThemeColorMeta() {
  if (themeColorMetaEl !== undefined) return themeColorMetaEl;
  try {
    themeColorMetaEl = document.querySelector('meta[name="theme-color"]') || null;
  } catch {
    // ambientes muito restritivos (ex.: certas sandboxes/CSPs) podem bloquear
    // querySelector — o tema fixo continua a aplicar-se via CSS na mesma.
    themeColorMetaEl = null;
  }
  return themeColorMetaEl;
}

export function getInitialTheme() {
  return "light";
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  // Idempotente: se já está aplicado, poupa uma escrita/reflow desnecessária
  // em chamadas repetidas (StrictMode, remounts em HMR, etc.).
  if (document.documentElement.dataset.theme === "light") return;
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
  getThemeColorMeta()?.setAttribute("content", "#f7f6f3");
}

export function initializeTheme() {
  applyTheme();
  if (!didInitialize) {
    didInitialize = true;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      LEGACY_STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* armazenamento bloqueado: o tema fixo já está aplicado */
    }
  }
  return "light";
}

export function useIsThemeLocked() {
  return THEME_LOCKED;
}

function warnThemeLocked(fnName) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[ThemeContext] ${fnName}() não faz nada — o tema está fixo em "light". Remove a UI que o chama.`);
  }
}

export function ThemeProvider({ children, initialTheme }) {
  if (process.env.NODE_ENV !== "production" && initialTheme && initialTheme !== "light") {
    // eslint-disable-next-line no-console
    console.warn(`[ThemeContext] initialTheme="${initialTheme}" foi ignorado — o tema está fixo em "light".`);
  }

  const value = useMemo(
    () => ({
      theme: "light",
      setTheme: () => warnThemeLocked("setTheme"),
      toggleTheme: () => warnThemeLocked("toggleTheme"),
    }),
    [],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error(
      "useTheme deve ser usado dentro de ThemeProvider — verifica se o componente está montado dentro de <ThemeProvider> (ver index.js).",
    );
  }
  return context;
}
