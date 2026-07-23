import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

// Notificações push (Web Push) — o telemóvel recebe um aviso quando chega
// um email novo, mesmo com a app fechada. Funciona em qualquer browser que
// suporte o standard (Chrome/Edge/Firefox em Android e desktop; no iOS só
// a partir do 16.4 e só com a app instalada no ecrã principal — Safari não
// expõe PushManager fora do modo standalone, por isso isSupported já
// reflete essa limitação sozinho, sem precisar de detetar o iOS à parte).
function isSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const supported = isSupported();
  const [permission, setPermission] = useState(supported ? Notification.permission : "unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(supported);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) { setChecking(false); return; }
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    } catch {
      setSubscribed(false);
    } finally {
      setChecking(false);
    }
  }, [supported]);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return { ok: false, reason: "unsupported" };
    setBusy(true);
    try {
      const permissionResult = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") return { ok: false, reason: "denied" };

      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        const { data } = await api.get("/push/vapid-public-key");
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.public_key),
        });
      }
      const json = sub.toJSON();
      await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "error", error: e };
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const unsubscribe = useCallback(async () => {
    if (!supported || busy) return { ok: false };
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      await api.post("/push/unsubscribe").catch(() => { /* segue mesmo assim */ });
      if (sub) await sub.unsubscribe();
      setSubscribed(false);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const sendTest = useCallback(async () => {
    try {
      await api.post("/push/test");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }, []);

  return { supported, permission, subscribed, checking, busy, subscribe, unsubscribe, sendTest };
}
