import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Secção K: alertas importantes destacam-se imediatamente — barra
// lateral colorida + fundo levemente tingido + ícone maior + título
// bold, formalizando o padrão já usado em SupplierEmailAlert
// (Layout.jsx) para as 4 severidades.
const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:h-5 [&>svg]:w-5 [&>svg~*]:pl-8",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground [&>svg]:text-foreground",
        destructive:
          "border-l-4 border-l-destructive bg-destructive/[0.06] text-destructive [&>svg]:text-destructive",
        success:
          "border-l-4 border-l-success bg-success-bg/60 text-success [&>svg]:text-success",
        warning:
          "border-l-4 border-l-warning bg-warning-bg/60 text-warning [&>svg]:text-warning",
        info:
          "border-l-4 border-l-info bg-info-bg/60 text-info [&>svg]:text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props} />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-bold leading-none tracking-tight", className)}
    {...props} />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props} />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
