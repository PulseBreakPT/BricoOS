import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      className={cn("animate-shimmer rounded-md bg-primary/[0.08]", className)}
      {...props} />
  );
}

export { Skeleton }
