import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { getErrorMessage } from "@/lib/api";

// Wrapper genérico para GET/PUT /settings/{group} — mesmo padrão de grupo
// único usado no backend (app_settings.py), reutilizado por todas as
// secções novas da página de Definições em vez de repetir fetch/save.
export function useSettingsGroup(group) {
  const [values, setValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/settings/${group}`)
      .then(({ data }) => { if (!cancelled) setValues(data); })
      .catch((e) => { if (!cancelled) toast.error(getErrorMessage(e, "Erro ao carregar definições")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [group]);

  const save = useCallback(async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/settings/${group}`, patch);
      setValues(data);
      toast.success("Definições guardadas");
      return { ok: true, data };
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível guardar"));
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [group]);

  return { values, setValues, loading, saving, save };
}
