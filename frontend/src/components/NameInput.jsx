import { useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { capitalizeName, normalizeName } from "@/lib/nameFormat";

// Campo de nome com capitalização automática em tempo real (§ pedido do
// utilizador) — "bernardo santos" -> "Bernardo Santos", mantendo em
// minúsculas as partículas de nomes compostos (da/de/do/das/dos/e) quando
// não são a primeira palavra: "maria da conceição" -> "Maria da Conceição".
// Ao colar cai na mesma via do onChange (React trata paste como uma
// mudança de valor normal), por isso não precisa de handler à parte. No
// onBlur faz uma passagem final que também apara espaços a mais.
export default function NameInput({ value, onChange, onBlur, testId = "input-name", placeholder }) {
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);

  // capitalizeName nunca muda o comprimento da string (só a capitalização
  // de cada letra), por isso a posição do cursor pode ser reaproveitada
  // tal e qual — ao contrário do PhoneInput, não é preciso recontar nada.
  useLayoutEffect(() => {
    if (pendingCursor.current == null || !inputRef.current) return;
    inputRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
    pendingCursor.current = null;
  });

  return (
    <Input
      ref={inputRef}
      data-testid={testId}
      value={value}
      onChange={(e) => {
        pendingCursor.current = e.target.selectionStart ?? e.target.value.length;
        onChange(capitalizeName(e.target.value));
      }}
      onBlur={(e) => {
        onChange(normalizeName(e.target.value));
        onBlur?.(e);
      }}
      placeholder={placeholder}
    />
  );
}
