import { useEffect, useState } from "react";

function compute(a, b, operator) {
  switch (operator) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function Btn({ label, onClick, className = "" }) {
  return (
    <button
      type="button"
      data-testid={`calc-btn-${label}`}
      onClick={onClick}
      className={`flex h-12 items-center justify-center rounded-xl text-base font-bold transition-colors active:scale-95 ${className}`}
    >
      {label}
    </button>
  );
}

// Calculadora simples — para conferir preços e margens sem sair da app.
// Só quatro operações + percentagem/sinal, de propósito: não é uma
// folha de cálculo, é a calculadora que já estava na secretária.
export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [waitingNew, setWaitingNew] = useState(false);

  const inputDigit = (d) => {
    // Depois de um "Erro" (ex.: divisão por zero), continuar a escrever
    // dígitos concatenava ao texto do erro ("Erro5") — trata-se como se
    // estivesse à espera de um número novo.
    if (waitingNew || display === "Erro") { setDisplay(d); setWaitingNew(false); return; }
    setDisplay((cur) => (cur === "0" ? d : cur + d));
  };
  const inputDot = () => {
    if (waitingNew || display === "Erro") { setDisplay("0."); setWaitingNew(false); return; }
    setDisplay((cur) => (cur.includes(".") ? cur : cur + "."));
  };
  const clear = () => { setDisplay("0"); setPrev(null); setOp(null); setWaitingNew(false); };
  const backspace = () => setDisplay((cur) => (cur.length > 1 ? cur.slice(0, -1) : "0"));
  const toggleSign = () => setDisplay((cur) => (cur.startsWith("-") ? cur.slice(1) : cur === "0" ? cur : `-${cur}`));
  const percent = () => setDisplay((cur) => String(parseFloat(cur) / 100));

  const chooseOp = (nextOp) => {
    const current = parseFloat(display);
    if (prev != null && op && !waitingNew) {
      const result = compute(prev, current, op);
      setDisplay(Number.isFinite(result) ? String(+result.toFixed(10)) : "Erro");
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setWaitingNew(true);
  };
  const equals = () => {
    if (op == null || prev == null) return;
    const current = parseFloat(display);
    const result = compute(prev, current, op);
    setDisplay(Number.isFinite(result) ? String(+result.toFixed(10)) : "Erro");
    setPrev(null);
    setOp(null);
    setWaitingNew(true);
  };

  // Uso comum também dá jeito com o teclado físico — desde que o foco não
  // esteja noutro campo de texto da janela (ex.: um input de outra App).
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key >= "0" && e.key <= "9") { inputDigit(e.key); return; }
      if (e.key === ".") { inputDot(); return; }
      if (e.key === "+") { chooseOp("+"); return; }
      if (e.key === "-") { chooseOp("-"); return; }
      if (e.key === "*") { chooseOp("×"); return; }
      if (e.key === "/") { e.preventDefault(); chooseOp("÷"); return; }
      if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); return; }
      if (e.key === "Backspace") { backspace(); return; }
      if (e.key === "Escape") { clear(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="mx-auto flex max-w-xs flex-col gap-3">
      <div data-testid="calc-display" className="overflow-x-auto rounded-2xl bg-foreground px-4 py-5 text-right font-mono text-3xl font-bold text-background">
        {display}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Btn label="C" onClick={clear} className="bg-muted text-foreground hover:bg-slate-300" />
        <Btn label="±" onClick={toggleSign} className="bg-muted text-foreground hover:bg-slate-300" />
        <Btn label="%" onClick={percent} className="bg-muted text-foreground hover:bg-slate-300" />
        <Btn label="÷" onClick={() => chooseOp("÷")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="7" onClick={() => inputDigit("7")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="8" onClick={() => inputDigit("8")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="9" onClick={() => inputDigit("9")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="×" onClick={() => chooseOp("×")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="4" onClick={() => inputDigit("4")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="5" onClick={() => inputDigit("5")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="6" onClick={() => inputDigit("6")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="−" onClick={() => chooseOp("-")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="1" onClick={() => inputDigit("1")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="2" onClick={() => inputDigit("2")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="3" onClick={() => inputDigit("3")} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="+" onClick={() => chooseOp("+")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="0" onClick={() => inputDigit("0")} className="col-span-2 bg-muted text-foreground hover:bg-muted" />
        <Btn label="." onClick={inputDot} className="bg-muted text-foreground hover:bg-muted" />
        <Btn label="=" onClick={equals} className="bg-foreground text-background hover:bg-foreground" />
      </div>
      <button type="button" data-testid="calc-backspace" onClick={backspace} className="self-end text-xs font-bold text-muted-foreground hover:text-foreground">
        ⌫ Apagar último dígito
      </button>
    </div>
  );
}
