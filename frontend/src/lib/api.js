import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, timeout: 20000 });

// Extrai uma mensagem de erro legível de qualquer erro axios (rede, timeout, validação, API).
export function getErrorMessage(e, fallback = "Ocorreu um erro. Tente novamente.") {
  if (e?.code === "ECONNABORTED") return "O servidor demorou demasiado a responder.";
  if (e?.message === "Network Error") return "Sem ligação ao servidor. Verifique a internet.";
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
