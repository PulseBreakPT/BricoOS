import { useState } from "react";
import { Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";

// Editor de etiquetas reutilizável — mesmo padrão visual já usado nos
// pedidos (PedidoDetail), agora também para fornecedores e tarefas:
// "tudo pode ter etiquetas" (lógica base 16), não só pedidos.
export default function LabelEditor({ labels, onChange, testIdPrefix = "label" }) {
  const [input, setInput] = useState("");

  const add = (val) => {
    const v = (val ?? input).trim();
    if (!v || labels.includes(v)) { setInput(""); return; }
    onChange([...labels, v]);
    setInput("");
  };
  const remove = (val) => onChange(labels.filter((l) => l !== val));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span key={l} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <Tag className="h-3 w-3" /> {l}
          <button type="button" data-testid={`${testIdPrefix}-remove-${l}`} onClick={() => remove(l)} className="ml-0.5 text-slate-400 hover:text-red-500">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        data-testid={`${testIdPrefix}-input`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder="+ etiqueta"
        className="h-8 w-32 rounded-full text-xs"
      />
    </div>
  );
}
