import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { haptics } from "@/lib/haptics";

export default function ThemeToggle({ variant = "desktop" }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const Icon = dark ? Sun : Moon;
  const nextLabel = dark ? "Ativar modo claro" : "Ativar modo escuro";

  return (
    <button
      type="button"
      data-testid={`theme-toggle-${variant}`}
      onClick={() => {
        haptics.tap();
        toggleTheme();
      }}
      className={
        variant === "mobile"
          ? "theme-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white/55 transition-all hover:bg-white/10 hover:text-white active:scale-90"
          : "theme-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/55 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
      }
      title={nextLabel}
      aria-label={nextLabel}
      aria-pressed={dark}
    >
      <Icon className={variant === "mobile" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </button>
  );
}
