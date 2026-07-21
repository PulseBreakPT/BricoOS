import { useState } from "react";

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
    if (waitingNew) { setDisplay(d); setWaitingNew(false); return; }
    setDisplay((cur) => (cur === "0" ? d : cur + d));
  };
  const inputDot = () => {
    if (waitingNew) { setDisplay("0."); setWaitingNew(false); return; }
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

  return (
    <div className="mx-auto flex max-w-xs flex-col gap-3">
      <div data-testid="calc-display" className="overflow-x-auto rounded-2xl bg-slate-900 px-4 py-5 text-right font-mono text-3xl font-bold text-white">
        {display}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Btn label="C" onClick={clear} className="bg-slate-200 text-slate-700 hover:bg-slate-300" />
        <Btn label="±" onClick={toggleSign} className="bg-slate-200 text-slate-700 hover:bg-slate-300" />
        <Btn label="%" onClick={percent} className="bg-slate-200 text-slate-700 hover:bg-slate-300" />
        <Btn label="÷" onClick={() => chooseOp("÷")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="7" onClick={() => inputDigit("7")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="8" onClick={() => inputDigit("8")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="9" onClick={() => inputDigit("9")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="×" onClick={() => chooseOp("×")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="4" onClick={() => inputDigit("4")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="5" onClick={() => inputDigit("5")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="6" onClick={() => inputDigit("6")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="−" onClick={() => chooseOp("-")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="1" onClick={() => inputDigit("1")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="2" onClick={() => inputDigit("2")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="3" onClick={() => inputDigit("3")} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="+" onClick={() => chooseOp("+")} className="bg-red-600 text-white hover:bg-red-700" />
        <Btn label="0" onClick={() => inputDigit("0")} className="col-span-2 bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="." onClick={inputDot} className="bg-slate-100 text-slate-900 hover:bg-slate-200" />
        <Btn label="=" onClick={equals} className="bg-slate-900 text-white hover:bg-slate-800" />
      </div>
      <button type="button" data-testid="calc-backspace" onClick={backspace} className="self-end text-xs font-bold text-slate-400 hover:text-slate-700">
        ⌫ Apagar último dígito
      </button>
    </div>
  );
}
