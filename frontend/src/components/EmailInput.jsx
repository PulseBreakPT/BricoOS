import { useLayoutEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeEmailLive, isValidEmail, emailDomain, countNonSpaceUpTo } from "@/lib/emailFormat";

// Campo de email com minúsculas/sem-espaços automáticos, validação
// imediata (✓ verde quando válido) e o domínio destacado por baixo
// (gmail.com, outlook.com, ...) assim que o formato fica correto.
export default function EmailInput({
  value, onChange, onBlur, onKeyDown, testId = "input-email", placeholder, inputRef: externalRef,
}) {
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);
  const valid = isValidEmail(value);
  const domain = valid ? emailDomain(value) : "";

  useLayoutEffect(() => {
    if (pendingCursor.current == null || !inputRef.current) return;
    inputRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
    pendingCursor.current = null;
  });

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          ref={(el) => { inputRef.current = el; if (externalRef) externalRef.current = el; }}
          data-testid={testId}
          type="email"
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const cursor = e.target.selectionStart ?? raw.length;
            pendingCursor.current = countNonSpaceUpTo(raw, cursor);
            onChange(normalizeEmailLive(raw));
          }}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            onChange(normalizeEmailLive(e.target.value).trim());
            onBlur?.(e);
          }}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder}
          className={`pr-8 transition-colors duration-150 ${value && !valid ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
        />
        {valid ? (
          <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500 duration-150 animate-in zoom-in-50" />
        ) : null}
      </div>
      {domain ? (
        <span className="inline-block rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
          {domain}
        </span>
      ) : null}
    </div>
  );
}
