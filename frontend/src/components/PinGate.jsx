import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Loader2, Lock, ShieldCheck, TimerReset } from "lucide-react";
import api from "@/lib/api";
import { clearDeviceToken, getDeviceId, getDeviceToken, setDeviceToken } from "@/lib/deviceAuth";

const PIN_LENGTH = 6;

// Porta de entrada de toda a aplicação: nada é montado enquanto o dispositivo
// não estiver verificado. Como envolve o Router inteiro, qualquer página atual
// ou futura fica protegida automaticamente — e após validar o PIN o utilizador
// continua exatamente no URL que tentou abrir.
export default function PinGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | locked | ok
  const [pin, setPin] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const timerRef = useRef(null);

  const startCountdown = useCallback((seconds) => {
    setLockSeconds(seconds);
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
    const onAuthRequired = () => { setPin(""); setStatus("locked"); };
    window.addEventListener("brico-auth-required", onAuthRequired);
    return () => window.removeEventListener("brico-auth-required", onAuthRequired);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const submit = useCallback(async (candidate) => {
    setCheckingPin(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-pin", { pin: candidate, device_id: getDeviceId() });
      if (data.ok && data.token) {
        setDeviceToken(data.token);
        setStatus("ok");
        setPin("");
        return;
      }
      setPin("");
      setFlash(true);
      setTimeout(() => setFlash(false), 650);
      if (data.locked) {
        applyServerState(data);
        setError("Demasiadas tentativas. Aguarde para tentar novamente.");
      } else {
        setAttemptsLeft(data.attempts_left ?? 0);
        setError(`PIN incorreto. Resta${data.attempts_left === 1 ? "" : "m"} ${data.attempts_left} tentativa${data.attempts_left === 1 ? "" : "s"}.`);
      }
    } catch {
      setPin("");
      setError("Não foi possível verificar o PIN. Tente novamente.");
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

  if (status === "ok") return children;

  if (status === "checking") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const locked = lockSeconds > 0;
  const mm = String(Math.floor(lockSeconds / 60)).padStart(2, "0");
  const ss = String(lockSeconds % 60).padStart(2, "0");

  return (
    <div data-testid="pin-screen" className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="flex w-full max-w-xs flex-col items-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${locked ? "bg-red-500/15 text-red-400" : "bg-white/10 text-slate-200"}`}>
          {locked ? <TimerReset className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
        </span>
        <h1 className="mt-4 font-heading text-xl font-extrabold tracking-tight">Brico2 · Acesso protegido</h1>
        <p className="mt-1 text-center text-sm text-slate-400">
          {locked ? "Acesso bloqueado por tentativas falhadas." : "Introduza o PIN de 6 dígitos para verificar este dispositivo."}
        </p>

        {locked ? (
          <div data-testid="pin-countdown" className="mt-6 rounded-2xl bg-red-500/10 px-6 py-4 text-center">
            <p className="font-mono text-3xl font-bold tabular-nums text-red-300">{mm}:{ss}</p>
            <p className="mt-1 text-xs text-red-300/80">Poderá tentar novamente quando o tempo terminar.</p>
          </div>
        ) : (
          <div data-testid="pin-dots" className={`mt-6 flex items-center gap-3 ${flash ? "animate-pulse" : ""}`}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                  flash ? "border-red-400 bg-red-400"
                    : i < pin.length ? "border-white bg-white"
                      : "border-slate-600 bg-transparent"
                }`}
              />
            ))}
          </div>
        )}

        <p className={`mt-3 h-5 text-center text-xs ${error ? "text-red-400" : "text-slate-500"}`}>
          {error || (!locked && attemptsLeft < 3 ? `${attemptsLeft} tentativa${attemptsLeft === 1 ? "" : "s"} restante${attemptsLeft === 1 ? "" : "s"}` : "")}
        </p>

        {/* Teclado em grelha — sem campos de texto, o teclado nativo nunca abre */}
        <div className="mt-4 grid w-full grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              data-testid={`pin-key-${d}`}
              onClick={() => press(d)}
              disabled={locked || checkingPin}
              className="h-16 rounded-2xl bg-white/5 text-2xl font-semibold text-white transition-colors active:bg-white/25 disabled:opacity-30 sm:hover:bg-white/15"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            data-testid="pin-clear"
            onClick={clearAll}
            disabled={locked || checkingPin || !pin.length}
            className="h-16 rounded-2xl text-sm font-semibold text-slate-400 transition-colors active:bg-white/10 disabled:opacity-30 sm:hover:bg-white/10"
          >
            Limpar
          </button>
          <button
            type="button"
            data-testid="pin-key-0"
            onClick={() => press("0")}
            disabled={locked || checkingPin}
            className="h-16 rounded-2xl bg-white/5 text-2xl font-semibold text-white transition-colors active:bg-white/25 disabled:opacity-30 sm:hover:bg-white/15"
          >
            0
          </button>
          <button
            type="button"
            data-testid="pin-backspace"
            onClick={backspace}
            disabled={locked || checkingPin || !pin.length}
            className="flex h-16 items-center justify-center rounded-2xl text-slate-400 transition-colors active:bg-white/10 disabled:opacity-30 sm:hover:bg-white/10"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[11px] text-slate-600">
          {checkingPin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {checkingPin ? "A verificar…" : "Dispositivo verificado uma única vez neste navegador"}
        </p>
      </div>
    </div>
  );
}
