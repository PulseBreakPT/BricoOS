import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Delete, Hammer, ShieldCheck, TimerReset } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import api from "@/lib/api";
import { clearDeviceToken, getDeviceId, getDeviceToken, setDeviceToken } from "@/lib/deviceAuth";

const PIN_LENGTH = 6;
// Pequena pausa antes de revelar a app: dá tempo ao "check" de sucesso ser
// visto, sem se tornar um atraso percetível a abrir a app.
const SUCCESS_DELAY_MS = 650;

// Fundo do ecrã de PIN — a face grafite da máquina desligada: grelha de
// pontos técnica e um halo de sinal muito ténue vindo de cima, como uma
// luz de standby.
function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-dot-grid-dark opacity-60" />
      <div className="absolute left-1/2 top-[-25%] h-[440px] w-[440px] -translate-x-1/2 rounded-full bg-red-600/10 blur-3xl" />
    </div>
  );
}

// Relógio ao vivo — hora em destaque no topo do cofre. Atualiza ao minuto.
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="flex flex-col items-center">
      <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">{time}</p>
      <p className="mt-1 text-xs font-semibold capitalize tracking-wide text-[color:var(--chrome-muted)]">{date}</p>
    </div>
  );
}

function BrandMark({ locked }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl text-white transition-colors duration-300 ${locked ? "border border-red-500/30 bg-red-950/50" : "bg-gradient-to-br from-red-600 to-red-800 shadow-[0_14px_34px_-10px_rgba(217,38,38,0.6)] ring-1 ring-white/15"}`}>
        {locked ? <TimerReset className="h-7 w-7 text-red-500" /> : <Hammer className="h-7 w-7" strokeWidth={2.3} />}
        {!locked ? <span className="led led-ok absolute -right-1 -top-1 ring-2 ring-[color:var(--chrome-deep)]" /> : null}
      </span>
      <h1 className="mt-4 font-heading text-lg font-black uppercase tracking-[0.28em] text-white">
        Brico<span className="text-red-500">·</span>Assistente
      </h1>
      <p className="engraved mt-1.5">Acesso reservado</p>
    </div>
  );
}

// Porta de entrada de toda a aplicação: nada é montado enquanto o dispositivo
// não estiver verificado. Como envolve o Router inteiro, qualquer página atual
// ou futura fica protegida automaticamente — e após validar o PIN o utilizador
// continua exatamente no URL que tentou abrir.
export default function PinGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | locked | success | ok
  const [pin, setPin] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [lockTotal, setLockTotal] = useState(0);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const timerRef = useRef(null);

  // Ponto único de bloqueio: usado tanto por um 401 vindo do servidor como
  // pelo temporizador de inatividade abaixo. Limpa sempre o token local, para
  // que um simples refresh não volte a entrar sozinho.
  const lockDevice = useCallback((message = "") => {
    clearDeviceToken();
    setPin("");
    setLockMessage(message);
    setStatus("locked");
  }, []);

  const startCountdown = useCallback((seconds) => {
    setLockSeconds(seconds);
    setLockTotal(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setLockSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setAttemptsLeft(3);
          setError("");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const applyServerState = useCallback((data) => {
    if (data.locked && data.retry_in_seconds > 0) {
      startCountdown(data.retry_in_seconds);
      setAttemptsLeft(0);
    } else if (typeof data.attempts_left === "number") {
      setAttemptsLeft(data.attempts_left);
    }
  }, [startCountdown]);

  // Verificação inicial: acontece antes de qualquer página ser carregada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getDeviceToken();
      try {
        const { data } = await api.get("/auth/status", { params: { device_id: getDeviceId() } });
        if (cancelled) return;
        applyServerState(data);
        if (token && data.verified) {
          setStatus("ok");
        } else {
          clearDeviceToken();
          setStatus("locked");
        }
      } catch {
        if (cancelled) return;
        // O interceptor já limpou o token se foi 401; sem rede, pede o PIN na
        // mesma — é o estado seguro por omissão.
        setStatus("locked");
      }
    })();
    return () => { cancelled = true; };
  }, [applyServerState]);

  // Qualquer 401 vindo de qualquer página (atual ou futura) volta a trancar.
  useEffect(() => {
    const onAuthRequired = () => lockDevice();
    window.addEventListener("brico-auth-required", onAuthRequired);
    return () => window.removeEventListener("brico-auth-required", onAuthRequired);
  }, [lockDevice]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const submit = useCallback(async (candidate) => {
    setCheckingPin(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-pin", { pin: candidate, device_id: getDeviceId() });
      if (data.ok && data.token) {
        setDeviceToken(data.token);
        setPin("");
        setLockMessage("");
        setStatus("success");
        setTimeout(() => setStatus("ok"), SUCCESS_DELAY_MS);
        return;
      }
      setPin("");
      setFlash(true);
      setTimeout(() => setFlash(false), 650);
      if (data.locked) {
        applyServerState(data);
        setError("Demasiadas tentativas. Aguarda para tentar novamente.");
      } else {
        setAttemptsLeft(data.attempts_left ?? 0);
        setError(`PIN incorreto. Resta${data.attempts_left === 1 ? "" : "m"} ${data.attempts_left} tentativa${data.attempts_left === 1 ? "" : "s"}.`);
      }
    } catch {
      setPin("");
      setError("Não foi possível verificar o PIN. Tenta novamente.");
    } finally {
      setCheckingPin(false);
    }
  }, [applyServerState]);

  const press = useCallback((digit) => {
    if (checkingPin || lockSeconds > 0) return;
    setError("");
    setPin((p) => {
      if (p.length >= PIN_LENGTH) return p;
      const next = p + digit;
      if (next.length === PIN_LENGTH) submit(next);
      return next;
    });
  }, [checkingPin, lockSeconds, submit]);

  const backspace = useCallback(() => {
    if (checkingPin || lockSeconds > 0) return;
    setPin((p) => p.slice(0, -1));
  }, [checkingPin, lockSeconds]);

  const clearAll = useCallback(() => {
    if (checkingPin || lockSeconds > 0) return;
    setPin("");
  }, [checkingPin, lockSeconds]);

  // Teclado físico como atalho em computadores — sem nenhum campo de texto,
  // por isso o teclado virtual do telemóvel nunca aparece.
  useEffect(() => {
    if (status !== "locked") return undefined;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape") clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, press, backspace, clearAll]);

  if (status === "ok") {
    return children;
  }

  if (status === "checking") {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[color:var(--chrome-deep)]">
        <Ambient />
        <Spinner className="relative h-8 w-8 text-white/25" />
      </div>
    );
  }

  if (status === "success") {
    return (
      <div data-testid="pin-screen" className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[color:var(--chrome-deep)] px-6 py-10">
        <Ambient />
        {/* Momento de ignição — a máquina liga: check verde, barra de
            arranque determinada, e a app entra logo a seguir. */}
        <div className="relative flex w-full max-w-xs flex-col items-center rounded-[28px] border border-white/10 bg-white/[0.05] p-8 shadow-[0_40px_90px_-20px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] animate-scale-in">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_16px_40px_-12px_rgba(16,185,129,0.6)] animate-in zoom-in-50 duration-300">
            <Check className="h-8 w-8" strokeWidth={2.5} />
            <span className="led led-ok absolute -right-1 -top-1 ring-2 ring-[color:var(--chrome-deep)]" />
          </span>
          <p className="mt-5 font-heading text-xl font-extrabold tracking-tight text-white">Acesso confirmado</p>
          <p className="mt-1 text-sm text-[color:var(--chrome-muted)]">A preparar o teu painel…</p>
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="animate-boot-bar h-full w-full rounded-full bg-gradient-to-r from-red-600 to-red-400" />
          </div>
        </div>
      </div>
    );
  }

  const locked = lockSeconds > 0;
  const mm = String(Math.floor(lockSeconds / 60)).padStart(2, "0");
  const ss = String(lockSeconds % 60).padStart(2, "0");
  const ringPct = lockTotal > 0 ? Math.max(0, Math.min(100, (lockSeconds / lockTotal) * 100)) : 0;

  // Teclas físicas da máquina — rebaixadas no grafite, com curso curto ao
  // toque (active:scale) e realce discreto no hover de rato.
  const keyBase = "group relative flex h-16 select-none items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 active:scale-95 active:bg-white/[0.12] disabled:opacity-25 sm:hover:border-white/25 sm:hover:bg-white/[0.10]";

  return (
    <div data-testid="pin-screen" className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[color:var(--chrome-deep)] px-6 py-8">
      <Ambient />

      <div className="relative flex w-full max-w-xs flex-col items-center">
        <div className="animate-fade-up" style={{ "--stagger-i": 0 }}>
          <LiveClock />
        </div>

        <div className="mt-7 animate-fade-up" style={{ "--stagger-i": 1 }}>
          <BrandMark locked={locked} />
        </div>

        <p className="mt-3 h-4 animate-fade-up text-center text-xs text-[color:var(--chrome-muted)]" style={{ "--stagger-i": 2 }}>
          {locked
            ? "Acesso bloqueado por tentativas falhadas."
            : (lockMessage || "Introduz o PIN de 6 dígitos para verificar este dispositivo.")}
        </p>

        {locked ? (
          <div data-testid="pin-countdown" className="mt-7 flex animate-fade-up flex-col items-center" style={{ "--stagger-i": 3 }}>
            <div
              className="relative flex h-36 w-36 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#d92626 ${ringPct}%, rgba(255,255,255,0.08) ${ringPct}%)` }}
            >
              <div className="flex h-[124px] w-[124px] flex-col items-center justify-center rounded-full bg-[color:var(--chrome)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]">
                <p className="font-mono text-3xl font-bold tabular-nums text-white">{mm}:{ss}</p>
                <p className="engraved mt-0.5">restante</p>
              </div>
            </div>
            <p className="mt-5 max-w-[220px] text-center text-xs leading-relaxed text-[color:var(--chrome-faint)]">
              Por segurança, o teclado volta a ficar disponível quando o tempo terminar.
            </p>
          </div>
        ) : (
          <>
            <div data-testid="pin-dots" className={`mt-6 flex animate-fade-up items-center gap-3.5 ${flash ? "animate-shake" : ""}`} style={{ "--stagger-i": 3 }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < pin.length;
                return (
                  <span
                    key={i}
                    className={`h-3.5 w-3.5 rounded-full transition-colors duration-150 ${
                      flash
                        ? "bg-red-500 shadow-[0_0_10px_rgba(217,38,38,0.7)]"
                        : filled
                          ? "animate-dot-fill bg-red-600 shadow-[0_0_10px_rgba(217,38,38,0.55)]"
                          : "border border-white/25 bg-white/[0.06]"
                    }`}
                  />
                );
              })}
            </div>

            <p className={`mt-3 h-5 text-center text-xs font-semibold ${error ? "text-red-400" : "text-[color:var(--chrome-faint)]"}`}>
              {error || (attemptsLeft < 3 ? `${attemptsLeft} tentativa${attemptsLeft === 1 ? "" : "s"} restante${attemptsLeft === 1 ? "" : "s"}` : "")}
            </p>

            {/* Teclado em grelha — sem campos de texto, o teclado nativo nunca abre */}
            <div className="mt-4 grid w-full animate-fade-up grid-cols-3 gap-2.5" style={{ "--stagger-i": 4 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`pin-key-${d}`}
                  onClick={() => press(d)}
                  disabled={locked || checkingPin}
                  className={keyBase}
                >
                  <span className="text-2xl font-semibold leading-none">{d}</span>
                </button>
              ))}
              <button
                type="button"
                data-testid="pin-clear"
                onClick={clearAll}
                disabled={locked || checkingPin || !pin.length}
                className="h-16 rounded-2xl text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--chrome-faint)] transition-all duration-150 active:scale-95 active:bg-white/10 disabled:opacity-20 sm:hover:bg-white/[0.06] sm:hover:text-[color:var(--chrome-muted)]"
              >
                Limpar
              </button>
              <button
                type="button"
                data-testid="pin-key-0"
                onClick={() => press("0")}
                disabled={locked || checkingPin}
                className={keyBase}
              >
                <span className="text-2xl font-semibold leading-none">0</span>
              </button>
              <button
                type="button"
                data-testid="pin-backspace"
                onClick={backspace}
                disabled={locked || checkingPin || !pin.length}
                className="flex h-16 items-center justify-center rounded-2xl text-[color:var(--chrome-faint)] transition-all duration-150 active:scale-95 active:bg-white/10 disabled:opacity-20 sm:hover:bg-white/[0.06] sm:hover:text-[color:var(--chrome-muted)]"
              >
                <Delete className="h-6 w-6" />
              </button>
            </div>
          </>
        )}

        <p className="mt-7 flex animate-fade-up items-center gap-1.5 text-[11px] font-medium text-[color:var(--chrome-faint)]" style={{ "--stagger-i": 5 }}>
          {checkingPin ? <Spinner className="h-3.5 w-3.5 text-red-500" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {checkingPin ? "A verificar o PIN…" : "Este dispositivo fica confiado enquanto estiver em uso"}
        </p>
      </div>
    </div>
  );
}
