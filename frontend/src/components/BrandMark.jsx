import { cn } from "@/lib/utils";

// Logótipo do BRICO OS — usado em todos os sítios onde antes existia o
// selo "B" desenhado a CSS (os-brand-beacon), agora substituído pela
// imagem real da marca. Um só componente para não repetir o mesmo <img>
// em cinco ficheiros diferentes.
export default function BrandMark({ className, alt = "BRICO OS" }) {
  return (
    <img
      src="/logo512.png"
      alt={alt}
      className={cn("shrink-0 select-none object-contain", className)}
      draggable={false}
    />
  );
}
