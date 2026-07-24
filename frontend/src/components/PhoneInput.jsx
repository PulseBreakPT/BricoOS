import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  COUNTRY_CODES, DEFAULT_COUNTRY_CODE, MAX_DIGITS, splitPhone, formatNational,
  countDigitsUpTo, positionAfterNDigits, phoneLengthStatus,
} from "@/lib/phoneFormat";
import { haptics } from "@/lib/haptics";

export { COUNTRY_CODES, DEFAULT_COUNTRY_CODE };

// Campo de telefone com indicativo de país. Guarda sempre o valor combinado
// (ex.: "+351917100512") no form, para o "tel:" funcionar também com clientes
// de fora de Portugal.
export default function PhoneInput({
  value, onChange, onKeyDown, testId = "input-phone", placeholder = "917100512", inputRef: externalRef,
}) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [digits, setDigits] = useState("");
  const lastEmitted = useRef();
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const { country: c, digits: d } = splitPhone(value);
    setCountry(c);
    setDigits(d);
    lastEmitted.current = value;
  }, [value]);

  // Aplica a posição de cursor calculada no onChange depois do re-render que
  // reformata o texto — só corre quando o próprio campo de texto pediu (a
  // troca de país, por exemplo, não mexe no cursor).
  useLayoutEffect(() => {
    if (pendingCursor.current == null || !inputRef.current) return;
    inputRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
    pendingCursor.current = null;
  });

  const emit = (nextCountry, nextDigits) => {
    const combined = nextDigits ? `${nextCountry}${nextDigits}` : "";
    lastEmitted.current = combined;
    onChange(combined);
  };

  const formatted = formatNational(country, digits);
  const lengthStatus = phoneLengthStatus(country, digits);

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Select value={country} onValueChange={(c) => { setCountry(c); emit(c, digits); }}>
          <SelectTrigger data-testid={`${testId}-country`} className="w-[4.5rem] shrink-0 px-2 font-mono text-xs">
            <SelectValue>{country}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_CODES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.flag} {c.name} · {c.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-0 flex-1">
          <Input
            ref={(el) => { inputRef.current = el; if (externalRef) externalRef.current = el; }}
            data-testid={testId}
            value={formatted}
            maxLength={24}
            inputMode="tel"
            onChange={(e) => {
              const raw = e.target.value;
              // Colar um número completo com indicativo (+351917100512)
              // mesmo dentro deste campo só de dígitos — separa sozinho o
              // indicativo do resto, troca o país selecionado se for
              // diferente do atual, e substitui tudo (não junta ao que já
              // lá estava, que é o comportamento esperado ao colar).
              if (raw.includes("+")) {
                const { country: pastedCountry, digits: pastedDigits } = splitPhone(raw.replace(/[^\d+]/g, ""));
                const cleanPasted = pastedDigits.replace(/\D/g, "").slice(0, MAX_DIGITS);
                setCountry(pastedCountry);
                setDigits(cleanPasted);
                emit(pastedCountry, cleanPasted);
                return;
              }
              // Só dígitos ficam guardados no valor combinado — sem isto, colar
              // um número já formatado (espaços, hífens, parênteses) entrava tal
              // e qual no "tel:" e nas contagens de dígitos usadas para validar
              // noutros sítios. A formatação visual (grupos por país) é só no
              // que aparece no campo, nunca no valor emitido.
              const cursorInRaw = e.target.selectionStart ?? raw.length;
              const digitsBeforeCursor = countDigitsUpTo(raw, cursorInRaw);
              const clean = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
              setDigits(clean);
              emit(country, clean);
              pendingCursor.current = positionAfterNDigits(formatNational(country, clean), digitsBeforeCursor);
            }}
            onBlur={() => {
              if (lengthStatus === "short" || lengthStatus === "long") haptics.warning();
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={onKeyDown}
            className={`min-w-0 flex-1 pr-8 font-mono transition-colors duration-150 ${
              lengthStatus === "short" || lengthStatus === "long" ? "border-amber-400 focus-visible:ring-amber-400" : ""
            }`}
            placeholder={placeholder}
          />
          {lengthStatus === "ok" ? (
            <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500 duration-150 animate-in zoom-in-50" />
          ) : null}
        </div>
      </div>
      {lengthStatus === "short" || lengthStatus === "long" ? (
        <p className="text-[10px] font-semibold text-amber-600">
          {lengthStatus === "short" ? "Número parece incompleto" : "Número parece ter dígitos a mais"}
        </p>
      ) : null}
    </div>
  );
}
