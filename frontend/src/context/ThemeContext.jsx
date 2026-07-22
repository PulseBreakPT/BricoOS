import { createContext, useContext, useMemo } from "react";

/* BRICO OS é exclusivamente light mode. Este contexto mantém a mesma API
   pública de sempre (useTheme, ThemeProvider, initializeTheme) para que os
   consumidores (ex.: sonner) continuem a funcionar, mas o tema é fixo. */

const STORAGE_KEY = "brico_os_theme";
const ThemeContext = createContext(null);

export function getInitialTheme() {
  return "light";
}

export function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", "#f7f6f3");
}

export function initializeTheme() {
  applyTheme();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* armazenamento bloqueado: o tema fixo já está aplicado */
  }
  return "light";
}

export function ThemeProvider({ children }) {
  const value = useMemo(
    () => ({
      theme: "light",
      setTheme: () => {},
      toggleTheme: () => {},
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
    throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  }
  return context;
}
