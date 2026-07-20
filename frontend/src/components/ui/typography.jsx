import { cn } from "@/lib/utils"

// Blocos de tipografia prontos — usam o mesmo par de fontes da app
// (Cabinet Grotesk nos títulos via .font-heading, Manrope no resto).

function TypographyH1({ className, ...props }) {
  return (
    <h1
      className={cn(
        "font-heading scroll-m-20 text-4xl font-extrabold tracking-tight text-balance",
        className
      )}
      {...props}
    />
  )
}

function TypographyH2({ className, ...props }) {
  return (
    <h2
      className={cn(
        "font-heading scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  )
}

function TypographyH3({ className, ...props }) {
  return (
    <h3
      className={cn(
        "font-heading scroll-m-20 text-2xl font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function TypographyH4({ className, ...props }) {
  return (
    <h4
      className={cn(
        "font-heading scroll-m-20 text-xl font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function TypographyP({ className, ...props }) {
  return (
    <p className={cn("leading-7 [&:not(:first-child)]:mt-6", className)} {...props} />
  )
}

function TypographyBlockquote({ className, ...props }) {
  return (
    <blockquote className={cn("mt-6 border-l-2 pl-6 italic", className)} {...props} />
  )
}

function TypographyInlineCode({ className, ...props }) {
  return (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
        className
      )}
      {...props}
    />
  )
}

function TypographyLead({ className, ...props }) {
  return <p className={cn("text-xl text-muted-foreground", className)} {...props} />
}

function TypographyLarge({ className, ...props }) {
  return <div className={cn("text-lg font-semibold", className)} {...props} />
}

function TypographySmall({ className, ...props }) {
  return (
    <small className={cn("text-sm leading-none font-medium", className)} {...props} />
  )
}

function TypographyMuted({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function TypographyList({ className, ...props }) {
  return <ul className={cn("my-6 ml-6 list-disc [&>li]:mt-2", className)} {...props} />
}

export {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyInlineCode,
  TypographyLead,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
  TypographyList,
}
