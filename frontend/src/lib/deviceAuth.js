// Identidade do dispositivo para a proteção por PIN.
// O token é emitido pelo servidor após o PIN certo e fica guardado neste
// navegador — mudar de dispositivo/navegador (ou limpar os dados) volta a
// pedir o PIN.

const TOKEN_KEY = "brico_device_token";
const DEVICE_KEY = "brico_device_id";

function safeGet(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* modo privado sem storage */ }
}

export function getDeviceId() {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = (window.crypto?.randomUUID && window.crypto.randomUUID())
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

export function getDeviceToken() {
  return safeGet(TOKEN_KEY);
}

export function setDeviceToken(token) {
  safeSet(TOKEN_KEY, token);
}

export function clearDeviceToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

// Para URLs usadas fora do axios (downloads, <img>), onde não há headers.
export function withDeviceToken(url) {
  const token = getDeviceToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}device_token=${encodeURIComponent(token)}`;
}
