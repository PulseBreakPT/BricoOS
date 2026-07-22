import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Flag } from "lucide-react";

function formatElapsed(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

// Cronómetro simples — para medir o tempo de uma chamada, de uma tarefa na
// oficina, etc. requestAnimationFrame em vez de setInterval: não deriva
// com o tempo, e para sozinho quando a janela é fechada (sem temporizador
// a correr às escondidas).
export default function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState([]);
  const startRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      setElapsed(Date.now() - startRef.current);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [running]);

  const start = () => { startRef.current = Date.now() - elapsed; setRunning(true); };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setElapsed(0); setLaps([]); };
  const lap = () => setLaps((cur) => [elapsed, ...cur]);

  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-4">
      <p data-testid="stopwatch-display" className="font-mono text-4xl font-black tabular-nums text-foreground">{formatElapsed(elapsed)}</p>
      <div className="flex gap-2">
        {running ? (
          <button type="button" data-testid="stopwatch-pause" onClick={pause} className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600">
            <Pause className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" data-testid="stopwatch-start" onClick={start} className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
            <Play className="h-4 w-4" />
          </button>
        )}
        <button type="button" data-testid="stopwatch-lap" onClick={lap} disabled={!running} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30">
          <Flag className="h-4 w-4" />
        </button>
        <button type="button" data-testid="stopwatch-reset" onClick={reset} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      {laps.length > 0 ? (
        <div className="max-h-40 w-full space-y-1 overflow-y-auto">
          {laps.map((l, i) => (
            <div key={i} className="flex justify-between rounded-lg bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground">
              <span>Volta {laps.length - i}</span><span>{formatElapsed(l)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
