import axios from "axios";
import { clearDeviceToken, getDeviceToken } from "@/lib/deviceAuth";
import { getActiveCollaboratorName } from "@/lib/activeCollaborator";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, timeout: 20000 });

// Proteção por PIN: todos os pedidos levam o token do dispositivo; um 401
// significa que o servidor deixou de reconhecer este dispositivo — o PinGate
// ouve o evento e volta a mostrar o ecrã do PIN, seja qual for a página.
// X-Actor-Name (opcional): "quem está a usar este aparelho" (ver
// activeCollaborator.js) — o backend só o usa para atribuir autor ao
// histórico das tarefas, nunca para autenticação.
api.interceptors.request.use((config) => {
  const token = getDeviceToken();
  if (token) config.headers["X-Device-Token"] = token;
  const actorName = getActiveCollaboratorName();
  if (actorName) config.headers["X-Actor-Name"] = actorName;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      clearDeviceToken();
      window.dispatchEvent(new Event("brico-auth-required"));
    }
    return Promise.reject(error);
  },
);

// Extrai uma mensagem de erro legível de qualquer erro axios (rede, timeout, validação, API).
export function getErrorMessage(e, fallback = "Ocorreu um erro. Tenta novamente.") {
  if (e?.code === "ECONNABORTED") return "O servidor demorou demasiado a responder.";
  if (e?.message === "Network Error") return "Sem ligação ao servidor. Verifica a internet.";
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  // Erros de validação FastAPI (422) chegam como lista de objetos.
  if (Array.isArray(detail) && detail.length) {
    const msg = detail[0]?.msg || "";
    return msg.replace(/^Value error,\s*/i, "") || fallback;
  }
  return fallback;
}

export default api;
