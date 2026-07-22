import { useTheme } from "@/context/ThemeContext"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          // Voz do sistema — os toasts vestem o chrome claro da máquina,
          // com os ícones de estado (verde/vermelho/âmbar) como LEDs e o
          // botão de ação em tinta escura para contraste imediato.
          toast:
            "group toast group-[.toaster]:!bg-white group-[.toaster]:!text-neutral-900 group-[.toaster]:!border-neutral-900/10 group-[.toaster]:!shadow-[0_24px_60px_-18px_rgba(16,17,20,0.35)]",
          description: "group-[.toast]:!text-neutral-500",
          actionButton:
            "group-[.toast]:!bg-neutral-900 group-[.toast]:!text-white",
          cancelButton:
            "group-[.toast]:!bg-neutral-900/[0.06] group-[.toast]:!text-neutral-600",
          closeButton:
            "group-[.toast]:!bg-white group-[.toast]:!text-neutral-500 group-[.toast]:!border-neutral-900/10",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
