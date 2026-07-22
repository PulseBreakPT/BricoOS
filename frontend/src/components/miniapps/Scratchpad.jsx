import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const KEY = "brico_scratchpad_v1";

// Bloco de notas pessoal — não confundir com "Pedidos" (que internamente
// também se chama "notes" no backend). Isto é só um rascunho local, sem
// ligação nenhuma a pedidos/clientes: um lembrete rápido enquanto se está
// ao telefone, sem abrir um pedido só para isso. Guardado neste
// dispositivo (localStorage), como o resto da Área de Trabalho.
export default function Scratchpad() {
  const [text, setText] = useState(() => {
    try { return window.localStorage.getItem(KEY) || ""; } catch { return ""; }
  });
  const saveTimer = useRef(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(KEY, text);
      } catch {
        // Quota cheia ou modo privado — sem aviso, o utilizador só descobria
        // que perdeu o texto ao voltar a abrir a app, dias depois.
        if (!warnedRef.current) {
          warnedRef.current = true;
          toast.error("Não foi possível guardar — o texto pode perder-se ao fechar.");
        }
      }
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [text]);

  // Se o bloco de notas estiver aberto em duas janelas/separadores, uma
  // gravação numa não devia ficar invisível na outra até se recarregar.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY && e.newValue != null && e.newValue !== text) {
        setText(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [text]);

  const clear = () => {
    if (text && !window.confirm("Apagar tudo o que está escrito?")) return;
    setText("");
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Guardado só neste dispositivo — não fica ligado a nenhum pedido.</p>
        <button
          type="button"
          data-testid="scratchpad-clear"
          onClick={clear}
          disabled={!text}
          className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" /> Limpar
        </button>
      </div>
      <textarea
        data-testid="scratchpad-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreve aqui…"
        autoFocus
        className="min-h-[240px] flex-1 resize-none rounded-xl border border-border p-3 text-sm text-foreground outline-none focus:border-border"
      />
    </div>
  );
}
