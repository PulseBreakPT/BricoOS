import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Combobox reutilizável — Popover + Command, sem dependências novas.
// `options` é uma lista de { value, label }.
const Combobox = React.forwardRef(
  (
    {
      options = [],
      value,
      onChange,
      placeholder = "Selecionar...",
      searchPlaceholder = "Procurar...",
      emptyText = "Sem resultados.",
      loading = false,
      clearable = false,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const selected = options.find((o) => o.value === value)

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
            {...props}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            {clearable && selected ? (
              <X
                className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange?.(undefined)
                }}
              />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              {/* Sem distinguir "a carregar" de "sem resultados", uma lista
                  ainda a chegar da rede mostrava por instantes a mensagem
                  errada de lista vazia. */}
              <CommandEmpty>{loading ? "A carregar..." : emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    disabled={option.disabled}
                    onSelect={() => {
                      if (option.disabled) return
                      onChange?.(option.value)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        option.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
)
Combobox.displayName = "Combobox"

export { Combobox }
