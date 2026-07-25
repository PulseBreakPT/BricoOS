import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  // Hover/active em cor sólida usam brightness em vez de opacidade — a
  // opacidade dilui a cor para o fundo claro (fica mais pálido, não mais
  // intenso); brightness escurece a própria cor, lendo como "mais firme"
  // ao passar o rato/premir, não como "mais transparente".
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:hover:brightness-100 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:brightness-125 hover:-translate-y-0.5 hover:shadow-lg active:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:brightness-90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-destructive/35 active:brightness-75",
        outline:
          "border-2 border-input shadow-sm hover:border-primary hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 hover:shadow-md",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:brightness-90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-secondary/35 active:brightness-75",
        success:
          "bg-success text-success-foreground shadow-sm hover:brightness-90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-success/35 active:brightness-75",
        warning:
          "bg-warning text-warning-foreground shadow-sm hover:brightness-90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-warning/35 active:brightness-75",
        info:
          "bg-info text-info-foreground shadow-sm hover:brightness-90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-info/35 active:brightness-75",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-7 rounded-md px-2.5 text-xs",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-xs": "h-7 w-7",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    // `loading` força o estado disabled e troca o conteúdo por um spinner
    // sobreposto — o botão não muda de largura, o texto fica invisível
    // mas continua a ocupar espaço (secção G: estado "loading" distinto
    // sem saltos de layout).
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span className="relative inline-flex items-center justify-center gap-2">
            <Spinner className="absolute size-4" />
            <span className="invisible inline-flex items-center gap-2">{children}</span>
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
