import { useLayoutEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  capitalizeName, normalizeName, NAME_LONG_THRESHOLD, nameHasUnexpectedChars, parseContactPaste,
} from "@/lib/nameFormat";
import { cleanPastedText } from "@/lib/textClean";
import { haptics } from "@/lib/haptics";

// Campo de nome com capitalização automática em tempo real (§ pedido do
// utilizador) — "bernardo santos" -> "Bernardo Santos", mantendo em
// minúsculas as partículas de nomes compostos (da/de/do/das/dos/e) quando
// não são a primeira palavra: "maria da conceição" -> "Maria da
// Conceição". Ao colar cai na mesma via do onChange (React trata paste
// como uma mudança de valor normal), por isso não precisa de handler à
// parte para a capitalização — mas TEM um onPaste próprio para o
// "detalhe que impressiona": colar uma linha como "Bernardo Santos -
// 917100512" ou "Bernardo Santos 917100512 bernardo@gmail.com" separa o
// telefone/email automaticamente, se `onDetectContact` for passado (só
// faz sentido onde o telefone/email também são campos editáveis ao lado).
// No onBlur faz uma passagem final que também apara espaços a mais.
export default function NameInput({
  value, onChange, onBlur, onKeyDown, testId = "input-name", placeholder, onDetectContact, inputRef: externalRef,
  highlighted = false,
}) {
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);
  const tooLong = value.length > NAME_LONG_THRESHOLD;
  const unexpected = nameHasUnexpectedChars(value);
  const valid = value.trim().length > 0 && !unexpected;

  // capitalizeName nunca muda o comprimento da string (só a capitalização
  // de cada letra), por isso a posição do cursor pode ser reaproveitada
  // tal e qual — ao contrário do PhoneInput, não é preciso recontar nada.
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
          value={value}
          onChange={(e) => {
            pendingCursor.current = e.target.selectionStart ?? e.target.value.length;
            onChange(capitalizeName(e.target.value));
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData("text");
            const parsed = pasted && onDetectContact ? parseContactPaste(pasted) : null;
            if (parsed) {
              e.preventDefault();
              onDetectContact(parsed);
              return;
            }
            // Nome simples colado (sem telefone/email a extrair) — ainda
            // assim limpa lixo invisível típico de WhatsApp/Outlook (aspas
            // tipográficas, traços esquisitos, caracteres de largura zero)
            // antes de deixar seguir o fluxo normal de capitalização.
            if (!pasted) return;
            const cleaned = cleanPastedText(pasted);
            if (cleaned === pasted) return; // nada a limpar — segue o onChange normal
            e.preventDefault();
            const el = e.target;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            const nextRaw = el.value.slice(0, start) + cleaned + el.value.slice(end);
            pendingCursor.current = start + cleaned.length;
            onChange(capitalizeName(nextRaw));
          }}
          onBlur={(e) => {
            const finalValue = normalizeName(e.target.value);
            onChange(finalValue);
            if (nameHasUnexpectedChars(finalValue)) haptics.warning();
            onBlur?.(e);
          }}
          onFocus={(e) => { e.target.select(); e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }}
          placeholder={placeholder}
          autoComplete="name"
          autoCapitalize="words"
          className={`pr-8 transition-all duration-150 ${unexpected ? "border-amber-400 focus-visible:ring-amber-400" : ""} ${highlighted ? "ring-2 ring-emerald-300 focus-visible:ring-emerald-300" : ""}`}
        />
        {valid ? (
          <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500 duration-150 animate-in zoom-in-50" />
        ) : unexpected ? (
          <AlertTriangle className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
        {unexpected ? <span className="text-amber-600">Nome com números ou símbolos pouco habituais</span> : <span />}
        {tooLong ? <span className="text-muted-foreground">{value.length} caracteres</span> : null}
      </div>
    </div>
  );
}
