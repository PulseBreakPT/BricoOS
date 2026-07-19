import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Delete, Hammer, Loader2, Lock, ShieldCheck, TimerReset } from "lucide-react";
import api from "@/lib/api";
import { clearDeviceToken, getDeviceId, getDeviceToken, setDeviceToken } from "@/lib/deviceAuth";

const PIN_LENGTH = 6;
// Pequena pausa antes de revelar a app: dá tempo ao "check" de sucesso ser
// visto, sem se tornar um atraso percetível a abrir a app.
const SUCCESS_DELAY_MS = 650;

// Tempo até a app se voltar a trancar sozinha — protege quem mostra o
// telemóvel a um cliente e é interrompido a meio. A contagem corre sempre,
// sem pausar com o uso normal da app; só um toque no contador a reinicia.
const IDLE_LIMIT_MS = 8 * 60 * 1000;
// Últimos segundos do contador em que o aviso fica vermelho, a chamar a atenção.
const IDLE_WARNING_MS = 30 * 1000;

// Letras por tecla, como nos telefones — detalhe tátil que dá densidade
// premium ao teclado sem ocupar espaço.
const KEY_LETTERS = { 2: "ABC", 3: "DEF", 4: "GHI", 5: "JKL", 6: "MNO", 7: "PQRS", 8: "TUV", 9: "WXYZ" };

// Ambiente do ecrã de PIN — fundo claro premium com brilho vermelho da marca,
// grelha de pontos subtil e halos suaves. Puramente decorativo.
function Ambient() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-dot-grid opacity-80" />
      <div className="absolute left-1/2 top-[-180px] h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-red-200/40 blur-3xl" />
      <div className="absolute bottom-[-160px] right-[-120px] h-[420px] w-[420px] rounded-full bg-blue-100/50 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(248,250,252,0.9)_100%)]" />
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
      <p className="font-mono text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">{time}</p>
      <p className="mt-1 text-xs font-semibold capitalize tracking-wide text-slate-400">{date}</p>
    </div>
  );
}

// Contador fixo e discreto — mostra quanto tempo falta até a app se trancar
// sozinha. Um toque reinicia a contagem sem precisar de mexer no resto do
// ecrã. Fica no canto inferior esquerdo em ecrãs pequenos (o cabeçalho e o
// botão "+" de novo pedido já ocupam os outros cantos) e sobe para o topo
// direito a partir do "lg", onde o layout de secretária deixa esse canto livre.
function IdleCountdown({ msLeft, onExtend }) {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const warning = msLeft <= IDLE_WARNING_MS;
  return (
    <button
      type="button"
      data-testid="idle-countdown"
      onClick={onExtend}
      title="Toca para manter a sessão ativa"
      className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-50 flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums shadow-sm backdrop-blur transition-colors lg:bottom-auto lg:left-auto lg:right-3 lg:top-3 ${
        warning
          ? "animate-pulse border-red-300 bg-red-50 text-red-600"
          : "border-slate-200 bg-white/90 text-slate-400"
      }`}
    >
      <Lock className="h-3 w-3" />
      {mm}:{ss}
    </button>
  );
}

function BrandMark({ locked }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white transition-colors duration-300 ${locked ? "border border-red-200 bg-red-50" : "bg-gradient-to-br from-red-600 to-red-700 animate-glow-breathe"}`}>
        {locked ? <TimerReset className="h-7 w-7 text-red-500" /> : <Hammer className="h-7 w-7" strokeWidth={2.3} />}
      </span>
      <h1 className="mt-4 font-heading text-lg font-black uppercase tracking-[0.28em] text-slate-900">
        Brico<span className="text-red-600">·</span>Assistente
      </h1>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Acesso reservado</p>
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
  const [idleMsLeft, setIdleMsLeft] = useState(IDLE_LIMIT_MS);
  const timerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

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

  // Trava automaticamente ao fim de IDLE_LIMIT_MS — protege quem larga o
  // telemóvel destrancado ou o mostra a um cliente e é interrompido a meio.
  // A contagem corre sempre, sem pausar com o uso normal da app: só reinicia
  // com um toque explícito no contador (ver extendIdleSession).
  useEffect(() => {
    if (status !== "ok") return undefined;
    lastActivityRef.current = Date.now();
    setIdleMsLeft(IDLE_LIMIT_MS);

    const tick = () => {
      const left = IDLE_LIMIT_MS - (Date.now() - lastActivityRef.current);
      if (left <= 0) lockDevice("Sessão trancada por inatividade — introduz o PIN para continuar.");
      else setIdleMsLeft(left);
    };
    const idleInterval = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(idleInterval);
    };
  }, [status, lockDevice]);

  const extendIdleSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleMsLeft(IDLE_LIMIT_MS);
  }, []);

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
    return (
      <>
        {children}
        <IdleCountdown msLeft={idleMsLeft} onExtend={extendIdleSession} />
      </>
    );
  }

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
        <div className="card-elevated relative flex w-full max-w-xs flex-col items-center rounded-[28px] border border-slate-200 bg-white/90 p-8 backdrop-blur-xl animate-scale-in">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-[0_0_40px_-6px_rgba(220,38,38,0.55)] animate-in zoom-in-50 duration-300">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </span>
          <p className="mt-5 font-heading text-xl font-extrabold tracking-tight text-slate-900">Acesso confirmado</p>
          <p className="mt-1 text-sm text-slate-500">A preparar o teu painel…</p>
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-full origin-left animate-[fade-up_0.6s_ease-out] rounded-full bg-gradient-to-r from-red-600 to-red-400" />
          </div>
        </div>
      </div>
    );
  }

  const locked = lockSeconds > 0;
  const mm = String(Math.floor(lockSeconds / 60)).padStart(2, "0");
  const ss = String(lockSeconds % 60).padStart(2, "0");
  const ringPct = lockTotal > 0 ? Math.max(0, Math.min(100, (lockSeconds / lockTotal) * 100)) : 0;

  const keyBase = "group relative h-16 select-none rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-all duration-150 active:scale-95 active:bg-slate-100 disabled:opacity-25 sm:hover:border-slate-300 sm:hover:bg-slate-50 sm:hover:shadow-md";

  return (
    <div data-testid="pin-screen" className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 py-8">
      <Ambient />

      <div className="relative flex w-full max-w-xs flex-col items-center">
        <div className="animate-fade-up" style={{ "--stagger-i": 0 }}>
          <LiveClock />
        </div>

        <div className="mt-7 animate-fade-up" style={{ "--stagger-i": 1 }}>
          <BrandMark locked={locked} />
        </div>

        <p className="mt-3 h-4 animate-fade-up text-center text-xs text-slate-500" style={{ "--stagger-i": 2 }}>
          {locked
            ? "Acesso bloqueado por tentativas falhadas."
            : (lockMessage || "Introduz o PIN de 6 dígitos para verificar este dispositivo.")}
        </p>

        {locked ? (
          <div data-testid="pin-countdown" className="mt-7 flex animate-fade-up flex-col items-center" style={{ "--stagger-i": 3 }}>
            <div
              className="relative flex h-36 w-36 items-center justify-center rounded-full shadow-[0_18px_50px_-16px_rgba(220,38,38,0.45)]"
              style={{ background: `conic-gradient(#dc2626 ${ringPct}%, rgba(15,23,42,0.08) ${ringPct}%)` }}
            >
              <div className="flex h-[124px] w-[124px] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                <p className="font-mono text-3xl font-bold tabular-nums text-slate-900">{mm}:{ss}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">restante</p>
              </div>
            </div>
            <p className="mt-5 max-w-[220px] text-center text-xs leading-relaxed text-slate-400">
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
                        ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                        : filled
                          ? "animate-dot-fill bg-red-600 shadow-[0_0_14px_rgba(220,38,38,0.55)]"
                          : "border border-slate-300 bg-white shadow-sm"
                    }`}
                  />
                );
              })}
            </div>

            <p className={`mt-3 h-5 text-center text-xs font-semibold ${error ? "text-red-600" : "text-slate-400"}`}>
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
                  <span className="block text-2xl font-semibold leading-none">{d}</span>
                  <span className="mt-0.5 block h-3 font-mono text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-300">
                    {KEY_LETTERS[d] || ""}
                  </span>
                </button>
              ))}
              <button
                type="button"
                data-testid="pin-clear"
                onClick={clearAll}
                disabled={locked || checkingPin || !pin.length}
                className="h-16 rounded-2xl text-xs font-bold uppercase tracking-[0.14em] text-slate-400 transition-all duration-150 active:scale-95 active:bg-slate-200/70 disabled:opacity-20 sm:hover:bg-slate-100 sm:hover:text-slate-600"
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
                <span className="block text-2xl font-semibold leading-none">0</span>
                <span className="mt-0.5 block h-3" />
              </button>
              <button
                type="button"
                data-testid="pin-backspace"
                onClick={backspace}
                disabled={locked || checkingPin || !pin.length}
                className="flex h-16 items-center justify-center rounded-2xl text-slate-400 transition-all duration-150 active:scale-95 active:bg-slate-200/70 disabled:opacity-20 sm:hover:bg-slate-100 sm:hover:text-slate-600"
              >
                <Delete className="h-6 w-6" />
              </button>
            </div>
          </>
        )}

        <p className="mt-7 flex animate-fade-up items-center gap-1.5 text-[11px] font-medium text-slate-400" style={{ "--stagger-i": 5 }}>
          {checkingPin ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {checkingPin ? "A verificar o PIN…" : "Dispositivo verificado uma única vez neste navegador"}
        </p>
      </div>
    </div>
  );
}
