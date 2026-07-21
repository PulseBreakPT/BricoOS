// Liga os toasts de sucesso/erro/aviso ao motor de vibração, uma única
// vez à entrada da app — em vez de cada um dos ~20 sítios que chamam
// toast.success/toast.error ter de saber que isso também deve vibrar.
// O objeto `toast` do sonner é um singleton partilhado por todos os
// imports; envolver os seus métodos aqui chega para cobrir a app
// inteira. Importar só pelo efeito secundário (sem usar nada exportado).
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";

function wrap(method, feel) {
  const original = toast[method];
  if (typeof original !== "function") return;
  toast[method] = (...args) => {
    feel();
    return original(...args);
  };
}

wrap("success", haptics.success);
wrap("error", haptics.error);
wrap("warning", haptics.warning);
