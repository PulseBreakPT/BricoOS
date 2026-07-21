import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          // Voz do sistema — os toasts vestem o chrome grafite da máquina,
          // com os ícones de estado (verde/vermelho/âmbar) como LEDs.
          toast:
            "group toast group-[.toaster]:!bg-[#1f2126] group-[.toaster]:!text-white group-[.toaster]:!border-white/10 group-[.toaster]:!shadow-[0_24px_60px_-18px_rgba(16,17,20,0.6)]",
          description: "group-[.toast]:!text-white/60",
          actionButton:
            "group-[.toast]:!bg-white group-[.toast]:!text-[#101114]",
          cancelButton:
            "group-[.toast]:!bg-white/10 group-[.toast]:!text-white/70",
          closeButton:
            "group-[.toast]:!bg-[#26282e] group-[.toast]:!text-white/70 group-[.toast]:!border-white/10",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
