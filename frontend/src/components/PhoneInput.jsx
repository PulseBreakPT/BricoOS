import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Indicativos mais comuns para clientes da loja de Faro — Portugal por defeito.
export const COUNTRY_CODES = [
  { code: "+351", flag: "🇵🇹", name: "Portugal" },
  { code: "+34", flag: "🇪🇸", name: "Espanha" },
  { code: "+33", flag: "🇫🇷", name: "França" },
  { code: "+44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "+49", flag: "🇩🇪", name: "Alemanha" },
  { code: "+31", flag: "🇳🇱", name: "Países Baixos" },
  { code: "+41", flag: "🇨🇭", name: "Suíça" },
  { code: "+352", flag: "🇱🇺", name: "Luxemburgo" },
  { code: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "+238", flag: "🇨🇻", name: "Cabo Verde" },
  { code: "+244", flag: "🇦🇴", name: "Angola" },
  { code: "+258", flag: "🇲🇿", name: "Moçambique" },
];

export const DEFAULT_COUNTRY_CODE = "+351";

// Ordenados uma única vez por comprimento de indicativo (do mais longo para
// o mais curto) — calcular isto de novo a cada splitPhone() (chamado a cada
// tecla, via o efeito abaixo) era um sort() desperdiçado sobre uma lista que
// nunca muda.
const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
const MAX_DIGITS = 15; // limite prático do E.164, generoso para qualquer indicativo suportado

function splitPhone(value) {
  // Um valor não-string (ex.: um número, se algum chamador passar por engano)
  // fazia .trim() rebentar — normaliza sempre para string primeiro.
  const v = String(value ?? "").trim();
  if (!v.startsWith("+")) return { country: DEFAULT_COUNTRY_CODE, digits: v };
  const match = COUNTRY_CODES_BY_LENGTH.find((c) => v.startsWith(c.code));
  return match
    ? { country: match.code, digits: v.slice(match.code.length).trim() }
    : { country: DEFAULT_COUNTRY_CODE, digits: v };
}

// Campo de telefone com indicativo de país. Guarda sempre o valor combinado
// (ex.: "+351917100512") no form, para o "tel:" funcionar também com clientes
// de fora de Portugal.
export default function PhoneInput({ value, onChange, onKeyDown, testId = "input-phone", placeholder = "917100512" }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [digits, setDigits] = useState("");
  const lastEmitted = useRef();

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const { country: c, digits: d } = splitPhone(value);
    setCountry(c);
    setDigits(d);
    lastEmitted.current = value;
  }, [value]);

  const emit = (nextCountry, nextDigits) => {
    const combined = nextDigits ? `${nextCountry}${nextDigits}` : "";
    lastEmitted.current = combined;
    onChange(combined);
  };

  return (
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
      <Input
        data-testid={testId}
        value={digits}
        maxLength={MAX_DIGITS}
        inputMode="tel"
        onChange={(e) => {
          // Só dígitos ficam guardados no valor combinado — sem isto, colar
          // um número formatado (espaços, hífens) entrava tal e qual no
          // "tel:" e nas contagens de dígitos usadas para validar noutros sítios.
          const clean = e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
          setDigits(clean);
          emit(country, clean);
        }}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 font-mono"
        placeholder={placeholder}
      />
    </div>
  );
}
