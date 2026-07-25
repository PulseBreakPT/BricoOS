import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  COUNTRY_CODES, DEFAULT_COUNTRY_CODE, MAX_DIGITS, splitPhone, formatNational,
  countDigitsUpTo, positionAfterNDigits, phoneLengthStatus, detectPastedCountry,
} from "@/lib/phoneFormat";
import { haptics } from "@/lib/haptics";

export { COUNTRY_CODES, DEFAULT_COUNTRY_CODE };

// Lembra o último país escolhido manualmente — só usado como ponto de
// partida de um número novo (ainda vazio); um valor já existente (a editar
// um pedido antigo) continua sempre a mandar no país mostrado.
const LAST_COUNTRY_KEY = "brico_last_phone_country";
function rememberedCountry() {
  try {
    const saved = localStorage.getItem(LAST_COUNTRY_KEY);
    return COUNTRY_CODES.some((c) => c.code === saved) ? saved : DEFAULT_COUNTRY_CODE;
  } catch {
    return DEFAULT_COUNTRY_CODE;
  }
}

// Campo de telefone com indicativo de país. Guarda sempre o valor combinado
// (ex.: "+351917100512") no form, para o "tel:" funcionar também com clientes
// de fora de Portugal.
export default function PhoneInput({
  value, onChange, onKeyDown, testId = "input-phone", placeholder = "917100512", inputRef: externalRef,
  onComplete, highlighted = false,
}) {
  const [country, setCountry] = useState(() => (value ? splitPhone(value).country : rememberedCountry()));
  const [digits, setDigits] = useState(() => (value ? splitPhone(value).digits : ""));
  const lastEmitted = useRef();
  const inputRef = useRef(null);
  const pendingCursor = useRef(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    // Um valor vazio não deve "roubar" o país já escolhido (ex.: o país
    // lembrado de um pedido anterior) — só sincroniza quando há de facto
    // um número a refletir.
    if (!value) { lastEmitted.current = value; return; }
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
        <Select
          value={country}
          onValueChange={(c) => {
            setCountry(c);
            emit(c, digits);
            try { localStorage.setItem(LAST_COUNTRY_KEY, c); } catch { /* noop */ }
          }}
        >
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
              const wasComplete = phoneLengthStatus(country, digits) === "ok";
              const nowComplete = phoneLengthStatus(country, clean) === "ok";
              setDigits(clean);
              emit(country, clean);
              pendingCursor.current = positionAfterNDigits(formatNational(country, clean), digitsBeforeCursor);
              // Avança para o campo seguinte assim que o número atinge o
              // comprimento esperado do país — só ao escrever (mais dígitos
              // do que antes), nunca ao apagar nem ao colar (o paste já tem
              // o seu próprio fluxo acima/abaixo).
              if (onComplete && !wasComplete && nowComplete && clean.length > digits.length) onComplete();
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData("text") || "";
              if (!pasted || pasted.includes("+")) return; // "+..." já tratado acima, no onChange
              const detected = detectPastedCountry(pasted.replace(/\D/g, ""), country);
              if (!detected) return; // número nacional comum — segue o onChange normal
              e.preventDefault();
              setCountry(detected.country);
              setDigits(detected.digits);
              emit(detected.country, detected.digits);
            }}
            onBlur={() => {
              if (lengthStatus === "short" || lengthStatus === "long") haptics.warning();
            }}
            onFocus={(e) => { e.target.select(); e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }}
            onKeyDown={onKeyDown}
            autoComplete="tel"
            className={`min-w-0 flex-1 pr-8 font-mono transition-all duration-150 ${
              lengthStatus === "short" || lengthStatus === "long" ? "border-warning focus-visible:ring-warning" : ""
            } ${highlighted ? "ring-2 ring-emerald-300 focus-visible:ring-emerald-300" : ""}`}
            placeholder={placeholder}
          />
          {lengthStatus === "ok" ? (
            <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-success duration-150 animate-in zoom-in-50" />
          ) : null}
        </div>
      </div>
      {lengthStatus === "short" || lengthStatus === "long" ? (
        <p className="text-[10px] font-semibold text-warning">
          {lengthStatus === "short" ? "Número parece incompleto" : "Número parece ter dígitos a mais"}
        </p>
      ) : null}
    </div>
  );
}
