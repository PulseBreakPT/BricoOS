import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Delete, Loader2, Lock, ShieldCheck, TimerReset } from "lucide-react";
import api from "@/lib/api";
import { clearDeviceToken, getDeviceId, getDeviceToken, setDeviceToken } from "@/lib/deviceAuth";

const PIN_LENGTH = 6;
// Pequena pausa antes de revelar a app: dá tempo ao "check" de sucesso ser
// visto, sem se tornar um atraso percetível a abrir a app.
const SUCCESS_DELAY_MS = 550;

// Ambiente decorativo do ecrã de PIN — dois círculos desfocados muito
// suaves, fixos atrás do cartão. Puramente visual, não interfere com nada.
function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="absolute bottom-0 right-0 h-[320px] w-[320px] translate-x-1/4 translate-y-1/4 rounded-full bg-red-600/[0.08] blur-3xl" />
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
  const timerRef = useRef(null);

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
        setPin("");
        setStatus("success");
        setTimeout(() => setStatus("ok"), SUCCESS_DELAY_MS);
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
      <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50">
        <Ambient />
        <Loader2 className="relative h-8 w-8 animate-spin text-slate-300" />
      </div>
    );
  }

  if (status === "success") {
    return (
      <div data-testid="pin-screen" className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 py-10">
        <Ambient />
        <div className="relative flex w-full max-w-xs flex-col items-center rounded-[28px] border border-slate-200/70 bg-white p-8 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.15)] animate-in fade-in-0 zoom-in-95 duration-300">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white ring-1 ring-inset ring-red-600 animate-in zoom-in-90 duration-300">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <p className="mt-4 font-heading text-lg font-extrabold tracking-tight text-slate-900">Acesso confirmado</p>
          <p className="mt-1 text-sm text-slate-500">A abrir…</p>
        </div>
      </div>
    );
  }

  const locked = lockSeconds > 0;
  const mm = String(Math.floor(lockSeconds / 60)).padStart(2, "0");
  const ss = String(lockSeconds % 60).padStart(2, "0");
  const ringPct = lockTotal > 0 ? Math.max(0, Math.min(100, (lockSeconds / lockTotal) * 100)) : 0;

  return (
    <div data-testid="pin-screen" className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 py-10">
      <Ambient />
      <div className="relative flex w-full max-w-xs flex-col items-center rounded-[28px] border border-slate-200/70 bg-white p-8 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.15)] animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors ${locked ? "bg-red-50 text-red-600 ring-red-100" : "bg-primary/[0.06] text-primary ring-primary/10"}`}>
          {locked ? <TimerReset className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
        </span>
        <span className="mt-4 h-1 w-10 rounded-full bg-gradient-to-r from-primary to-primary/20" />
        <h1 className="mt-3 font-heading text-xl font-extrabold tracking-tight text-slate-900">Brico Assistente</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          {locked ? "Acesso bloqueado por tentativas falhadas." : "Introduza o PIN de 6 dígitos para verificar este dispositivo."}
        </p>

        {locked ? (
          <div data-testid="pin-countdown" className="mt-6 flex flex-col items-center">
            <div
              className="relative flex h-32 w-32 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(#dc2626 ${ringPct}%, #fee2e2 ${ringPct}%)` }}
            >
              <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-white">
                <p className="font-mono text-2xl font-bold tabular-nums text-slate-900">{mm}:{ss}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">restante</p>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">Poderá tentar novamente quando o tempo terminar.</p>
          </div>
        ) : (
          <div data-testid="pin-dots" className={`mt-6 flex items-center gap-3 ${flash ? "animate-shake" : ""}`}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                  flash ? "border-red-500 bg-red-500"
                    : i < pin.length ? "scale-110 border-primary bg-primary"
                      : "border-slate-200 bg-transparent"
                }`}
              />
            ))}
          </div>
        )}

        <p className={`mt-3 h-5 text-center text-xs ${error ? "text-red-600" : "text-slate-400"}`}>
          {error || (!locked && attemptsLeft < 3 ? `${attemptsLeft} tentativa${attemptsLeft === 1 ? "" : "s"} restante${attemptsLeft === 1 ? "" : "s"}` : "")}
        </p>

        {/* Teclado em grelha — sem campos de texto, o teclado nativo nunca abre */}
        <div className="mt-6 grid w-full grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              data-testid={`pin-key-${d}`}
              onClick={() => press(d)}
              disabled={locked || checkingPin}
              className="h-16 rounded-2xl border border-slate-200/60 bg-slate-50 text-2xl font-semibold text-slate-900 transition-all active:translate-y-0 active:scale-95 active:border-slate-200 active:bg-slate-100 active:shadow-none disabled:opacity-30 sm:hover:-translate-y-0.5 sm:hover:border-slate-300 sm:hover:bg-white sm:hover:shadow-md"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            data-testid="pin-clear"
            onClick={clearAll}
            disabled={locked || checkingPin || !pin.length}
            className="h-16 rounded-2xl text-sm font-semibold text-slate-400 transition-all active:scale-95 active:bg-slate-100 disabled:opacity-30 sm:hover:bg-slate-50"
          >
            Limpar
          </button>
          <button
            type="button"
            data-testid="pin-key-0"
            onClick={() => press("0")}
            disabled={locked || checkingPin}
            className="h-16 rounded-2xl border border-slate-200/60 bg-slate-50 text-2xl font-semibold text-slate-900 transition-all active:translate-y-0 active:scale-95 active:border-slate-200 active:bg-slate-100 active:shadow-none disabled:opacity-30 sm:hover:-translate-y-0.5 sm:hover:border-slate-300 sm:hover:bg-white sm:hover:shadow-md"
          >
            0
          </button>
          <button
            type="button"
            data-testid="pin-backspace"
            onClick={backspace}
            disabled={locked || checkingPin || !pin.length}
            className="flex h-16 items-center justify-center rounded-2xl text-slate-400 transition-all active:scale-95 active:bg-slate-100 disabled:opacity-30 sm:hover:bg-slate-50"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[11px] text-slate-400">
          {checkingPin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {checkingPin ? "A verificar…" : "Dispositivo verificado uma única vez neste navegador"}
        </p>
      </div>
    </div>
  );
}
