import api from "@/lib/api";
import { clearDeviceToken } from "@/lib/deviceAuth";

// Fundos do ambiente de trabalho — gradientes/texturas leves geradas em CSS
// (sem imagens externas), afinadas ao tema claro do BRICO OS.
export const WALLPAPERS = [
  {
    id: "bancada",
    name: "Bancada (original)",
    css: null,
    swatch: "linear-gradient(150deg,#f4f2ee,#e8e4dd)",
  },
  {
    id: "grafite",
    name: "Grafite",
    css: "linear-gradient(160deg,#e9ebef 0%,#d6dae2 55%,#c9ced8 100%)",
    swatch: "linear-gradient(160deg,#e9ebef,#c9ced8)",
  },
  {
    id: "areia",
    name: "Areia",
    css: "linear-gradient(155deg,#f7f1e5 0%,#ecdfc9 100%)",
    swatch: "linear-gradient(155deg,#f7f1e5,#ecdfc9)",
  },
  {
    id: "esquema",
    name: "Esquema técnico",
    css: "linear-gradient(rgba(59,110,171,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,110,171,0.06) 1px, transparent 1px), linear-gradient(165deg,#eef3f8,#dee8f1)",
    size: "44px 44px, 44px 44px, auto",
    swatch: "linear-gradient(165deg,#eef3f8,#d5e2ee)",
  },
  {
    id: "aco",
    name: "Aço escovado",
    css: "repeating-linear-gradient(90deg, rgba(16,17,20,0.03) 0 1px, transparent 1px 6px), linear-gradient(165deg,#f0f1f3,#dcdee3)",
    swatch: "linear-gradient(165deg,#f0f1f3,#d5d7dc)",
  },
  {
    id: "terracota",
    name: "Terracota",
    css: "radial-gradient(1100px 560px at 82% -8%, rgba(217,68,38,0.13), transparent 60%), linear-gradient(160deg,#f8f1ec,#eeddd3)",
    swatch: "linear-gradient(160deg,#f8f1ec,#eBD5C8)",
  },
];

const WALLPAPER_KEY = "brico_wallpaper";

export function getWallpaperId() {
  try {
    const id = window.localStorage.getItem(WALLPAPER_KEY);
    return WALLPAPERS.some((w) => w.id === id) ? id : "bancada";
  } catch {
    return "bancada";
  }
}

export function persistWallpaperId(id) {
  try {
    window.localStorage.setItem(WALLPAPER_KEY, id);
  } catch {
    /* modo privado — o fundo simplesmente não persiste */
  }
}

export function wallpaperStyle(id) {
  const wp = WALLPAPERS.find((w) => w.id === id);
  if (!wp || !wp.css) return undefined;
  return { background: wp.css, backgroundSize: wp.size };
}

// Bloquear o ecrã como num SO real: esquece o token deste dispositivo e o
// PinGate (que escuta o evento) volta a pedir o PIN. O arranque seguinte
// mostra outra vez o boot splash.
export function lockScreen() {
  try {
    window.sessionStorage.removeItem("brico_booted");
  } catch {
    /* sem sessionStorage */
  }
  // Best effort — avisa o servidor para pausar as notificações push deste
  // dispositivo até ao próximo PIN certo (ver POST /auth/lock). Usa o token
  // ainda válido; se falhar por falta de rede, o bloqueio local acontece
  // na mesma, não faz sentido bloquear o utilizador por causa disto.
  api.post("/auth/lock").catch(() => {});
  clearDeviceToken();
  window.dispatchEvent(new Event("brico-auth-required"));
}
