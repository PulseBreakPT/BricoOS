import { cn } from "@/lib/utils";

// Logótipo escrito do BRICO OS (imagem, fundo transparente) — substitui as
// ocorrências do nome em texto simples nos pontos onde a marca é exibida
// como cabeçalho. Altura controlada por className; a largura acompanha
// sempre a proporção original da imagem.
export default function BrandWordmark({ className, alt = "BRICO OS" }) {
  return (
    <img
      src="/brico-os-wordmark.png"
      alt={alt}
      className={cn("inline-block h-6 w-auto shrink-0 select-none object-contain align-middle", className)}
      draggable={false}
    />
  );
}
