import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Loader2, Sparkles } from "lucide-react";
import api, { getErrorMessage } from "@/lib/api";
import { useWorkspace } from "@/context/WorkspaceContext";
import { toast } from "sonner";

// Painel de IA flutuante, sempre acessível em qualquer página/painel — nunca
// bloqueia o resto do ecrã (não é um Dialog modal) e usa automaticamente o
// contexto atual (ex.: pedido em foco) nas respostas.
export default function AiAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);
  const { activeContext } = useWorkspace();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, asking]);

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setQuestion("");
    setAsking(true);
    try {
      const { data } = await api.post("/ai/ask", {
        question: text,
        note_id: activeContext?.kind === "pedido" ? activeContext.id : "",
      });
      setMessages((m) => [...m, { role: "ai", text: data.answer }]);
    } catch (e) {
      toast.error(getErrorMessage(e, "A IA não conseguiu responder"));
      setMessages((m) => [...m, { role: "ai", text: "Não consegui responder agora. Tente novamente." }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <button
        data-testid="ai-assistant-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Assistente IA"
        className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl shadow-slate-500/30 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 lg:bottom-20"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          data-testid="ai-assistant-panel"
          className="fixed inset-x-3 bottom-[calc(13.5rem+env(safe-area-inset-bottom))] z-40 flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:h-[520px] sm:w-96 lg:bottom-40"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <Sparkles className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm font-bold">Assistente</p>
            {activeContext ? (
              <span className="max-w-[45%] truncate rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">{activeContext.label}</span>
            ) : null}
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                Pergunte algo — "Resume este pedido", "Qual o último preço deste produto?"...
              </p>
            ) : messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}
              >
                {m.text}
              </div>
            ))}
            {asking ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A pensar…
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 p-2.5">
            <input
              data-testid="ai-assistant-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
              placeholder="Pergunte alguma coisa..."
              className="h-9 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
            />
            <button
              data-testid="ai-assistant-send"
              onClick={ask}
              disabled={asking || !question.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
