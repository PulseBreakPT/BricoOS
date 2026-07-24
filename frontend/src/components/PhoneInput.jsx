import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Formatação em tempo real por país — só afeta o que é MOSTRADO no campo;
// o valor guardado/emitido (onChange) continua a ser sempre o indicativo +
// dígitos limpos (ex. "+351917100512"), exatamente como antes, para nada
// mudar no backend, na deteção de duplicados ou no link "tel:".
const GROUPS_BY_COUNTRY = {
  "+351": [3, 3, 3],      // Portugal: 917 100 512
  "+34": [3, 2, 2, 2],    // Espanha: 612 34 56 78
  "+33": [1, 2, 2, 2, 2], // França: 6 12 34 56 78
  "+44": [4, 6],          // Reino Unido: 7911 123456
  "+31": [1, 8],          // Países Baixos: 6 12345678
  "+41": [2, 3, 2, 2],    // Suíça: 79 123 45 67
  "+352": [3, 3, 3],      // Luxemburgo: 621 123 456
  "+238": [3, 2, 2],      // Cabo Verde: 991 23 45
  "+244": [3, 3, 3],      // Angola: 923 123 456
  "+258": [2, 3, 4],      // Moçambique: 84 123 4567
};

function groupDigits(digits, groups) {
  const parts = [];
  let idx = 0;
  for (const len of groups) {
    if (idx >= digits.length) break;
    parts.push(digits.slice(idx, idx + len));
    idx += len;
  }
  if (idx < digits.length) {
    // Sobra (mais dígitos do que o padrão previa) fica anexada ao último
    // grupo, nunca é cortada nem vira um grupo solto separado por espaço.
    if (parts.length) parts[parts.length - 1] += digits.slice(idx);
    else parts.push(digits.slice(idx));
  }
  return parts.join(" ");
}

// Alemanha: comprimento nacional variável (10-11 dígitos) — só dois blocos
// fixos (indicativo de área + resto), sem inventar uma grelha rígida que
// não existe de facto neste país.
function formatDE(digits) {
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

// Brasil: (DD) NNNNN-NNNN (móvel, com o 9º dígito) ou (DD) NNNN-NNNN (fixo)
// — o próprio comprimento à medida que se escreve decide qual dos dois.
function formatBR(digits) {
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `(${ddd}`;
  const firstLen = rest.length >= 9 ? 5 : 4;
  const first = rest.slice(0, firstLen);
  const second = rest.slice(firstLen);
  return second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`;
}

function formatNational(country, digits) {
  if (!digits) return "";
  if (country === "+49") return formatDE(digits);
  if (country === "+55") return formatBR(digits);
  const groups = GROUPS_BY_COUNTRY[country];
  return groups ? groupDigits(digits, groups) : digits;
}

// Cursor: ao formatar, o texto mostrado fica mais comprido do que o que a
// pessoa escreveu (espaços/parênteses/hífen inseridos automaticamente) — sem
// isto, o cursor saltaria sempre para o fim do campo a cada tecla, tornando
// impossível corrigir um dígito a meio do número.
function countDigitsUpTo(str, index) {
  let n = 0;
  for (let i = 0; i < index && i < str.length; i++) {
    if (/\d/.test(str[i])) n++;
  }
  return n;
}

function positionAfterNDigits(formatted, n) {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      count += 1;
      if (count === n) return i + 1;
    }
  }
  return formatted.length;
}

// Campo de telefone com indicativo de país. Guarda sempre o valor combinado
// (ex.: "+351917100512") no form, para o "tel:" funcionar também com clientes
// de fora de Portugal.
export default function PhoneInput({ value, onChange, onKeyDown, testId = "input-phone", placeholder = "917100512" }) {
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
        ref={inputRef}
        data-testid={testId}
        value={formatted}
        maxLength={24}
        inputMode="tel"
        onChange={(e) => {
          // Só dígitos ficam guardados no valor combinado — sem isto, colar
          // um número já formatado (espaços, hífens, parênteses) entrava tal
          // e qual no "tel:" e nas contagens de dígitos usadas para validar
          // noutros sítios. A formatação visual (grupos por país) é só no
          // que aparece no campo, nunca no valor emitido.
          const raw = e.target.value;
          const cursorInRaw = e.target.selectionStart ?? raw.length;
          const digitsBeforeCursor = countDigitsUpTo(raw, cursorInRaw);
          const clean = raw.replace(/\D/g, "").slice(0, MAX_DIGITS);
          setDigits(clean);
          emit(country, clean);
          pendingCursor.current = positionAfterNDigits(formatNational(country, clean), digitsBeforeCursor);
        }}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 font-mono"
        placeholder={placeholder}
      />
    </div>
  );
}
