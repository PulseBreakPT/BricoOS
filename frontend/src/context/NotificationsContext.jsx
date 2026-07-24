import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { useNotificationStream } from "@/hooks/useNotificationStream";

// Centro de Operações — estado GENUINAMENTE partilhado entre o sino
// (NotificationsBell), o widget do Dashboard e a página /notificacoes:
// o resumo do dia e a contagem de não-lidas. A lista paginada/filtrada
// completa fica local a cada componente (não há benefício em partilhar
// 30-100 itens já filtrados entre três sítios que os usam de forma
// diferente).
const NotificationsCtx = createContext({ summary: null, unreadCount: 0, refresh: () => {} });

export function NotificationsProvider({ children }) {
  const [summary, setSummary] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [{ data: s }, { data: c }] = await Promise.all([
        api.get("/notifications/summary"),
        api.get("/notifications/unread-count"),
      ]);
      setSummary(s);
      setUnreadCount(c.count || 0);
    } catch {
      /* silencioso — sino/página mantêm o seu próprio polling como reserva */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useNotificationStream(() => refresh());

  return (
    <NotificationsCtx.Provider value={{ summary, unreadCount, refresh }}>
      {children}
    </NotificationsCtx.Provider>
  );
}

export function useNotificationsSummary() {
  return useContext(NotificationsCtx);
}
