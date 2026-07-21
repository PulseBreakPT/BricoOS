import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

// Estado do sistema em tempo real (contadores do dock, barra de estado):
// UM único polling partilhado por toda a app — sidebar, nav do telemóvel,
// taskbar e centro de atividade leem daqui, em vez de cada um fazer a sua
// própria chamada. 45s + refresh ao voltar à janela, o mesmo ritmo do
// aviso global de emails.
const SystemStatusCtx = createContext({ status: null, online: true, refresh: () => {} });

export function SystemStatusProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/system/status");
      setStatus(data);
      setOnline(true);
    } catch {
      // Sem rede ou backend em baixo — os badges mantêm o último valor
      // conhecido e a barra de estado passa a mostrar "sem ligação".
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 45000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  return (
    <SystemStatusCtx.Provider value={{ status, online, refresh }}>
      {children}
    </SystemStatusCtx.Provider>
  );
}

export function useSystemStatus() {
  return useContext(SystemStatusCtx);
}
