import { useEffect, useState } from "react";
import {
  Bell, Download, Lock, Monitor, Pencil, RotateCw, Share, Smartphone, SquarePlus,
  Tablet, Trash2, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useSystemStatus } from "@/context/SystemStatusContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useSettingsGroup } from "@/hooks/useSettingsGroup";
import { getDeviceToken } from "@/lib/deviceAuth";
import { lockScreen } from "@/lib/osShell";
import { haptics } from "@/lib/haptics";
import api, { getErrorMessage } from "@/lib/api";
import { TEMPLATE_OPTIONS } from "@/lib/pedido";
import { TASK_PRIORITIES, TASK_REPEATS } from "@/lib/taskMeta";

const SESSION_START = Date.now();

function sessionUptime() {
  const minutes = Math.max(0, Math.round((Date.now() - SESSION_START) / 60000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function SettingsSection({ title, description, children }) {
  return (
    <section className="mt-5 first:mt-0">
      <p className="kicker">{title}</p>
      {description ? <p className="mt-0.5 text-sm text-text-body">{description}</p> : null}
      <div className="mt-3 rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function SettingsRow({ icon: Icon, label, description, control, testid }) {
  return (
    <div data-testid={testid} className="flex items-center gap-3 border-b border-border/70 p-4 last:border-b-0">
      {Icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-text-body">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function AboutRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-2.5 last:border-b-0">
      <span className="text-label uppercase text-text-tertiary">{label}</span>
      <span className="text-right font-mono text-xs font-bold text-foreground">{value}</span>
    </div>
  );
}

// Cartão genérico para um grupo de definições (GET/PUT /settings/{group}):
// os booleanos aplicam-se de imediato (mesmo comportamento do toggle de
// notificações acima), números/texto/seleção ficam num rascunho local até
// "Guardar" — evita gravar a cada tecla e permite corrigir antes de enviar.
function SettingsFieldsCard({ group, title, description, fields }) {
  const { values, loading, saving, save } = useSettingsGroup(group);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (values && draft === null) setDraft(values);
  }, [values, draft]);

  if (loading || !draft) {
    return (
      <SettingsSection title={title} description={description}>
        <div className="p-4 text-sm text-muted-foreground">A carregar…</div>
      </SettingsSection>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(values);

  const handleSwitch = (key, checked) => {
    setDraft((d) => ({ ...d, [key]: checked }));
    save({ [key]: checked });
  };

  const handleSave = () => {
    const patch = {};
    for (const f of fields) {
      if (f.type === "switch") continue;
      patch[f.key] = f.type === "number" ? Number(draft[f.key]) : draft[f.key];
    }
    save(patch);
  };

  const hasSaveButton = fields.some((f) => f.type !== "switch");

  return (
    <SettingsSection title={title} description={description}>
      {fields.map((f) => (
        <SettingsRow
          key={f.key}
          label={f.label}
          description={f.hint}
          control={
            f.type === "switch" ? (
              <Switch
                checked={Boolean(draft[f.key])}
                disabled={saving}
                onCheckedChange={(checked) => handleSwitch(f.key, checked)}
              />
            ) : f.type === "select" ? (
              <NativeSelect
                size="sm"
                value={draft[f.key]}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              >
                {f.options.map((o) => (
                  <NativeSelectOption key={o.key} value={o.key}>{o.label}</NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  type={f.type === "text" ? "text" : "number"}
                  className={f.type === "text" ? "w-44 h-8 text-sm" : "w-20 h-8 text-right text-sm"}
                  value={draft[f.key]}
                  disabled={saving}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
                {f.suffix ? <span className="text-xs text-muted-foreground">{f.suffix}</span> : null}
              </div>
            )
          }
        />
      ))}
      {hasSaveButton ? (
        <div className="flex justify-end border-t border-border/70 p-3">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleSave}
            className="relative rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <Spinner className="mx-auto h-3.5 w-3.5" /> : "Guardar"}
          </button>
        </div>
      ) : null}
    </SettingsSection>
  );
}

// Painel só de leitura com as categorias/palavras-chave que o motor de
// classificação já reconhece automaticamente (anexos_edicao.py,
// correio_semanal.py) — não é editável aqui, é o mesmo risco identificado
// no plano para VALID_CATEGORIES: mudar isto à mão parte lógica espalhada
// pelo código, por isso fica só como visibilidade.
function ClassificationRulesPanel() {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/classification-rules")
      .then(({ data }) => { if (!cancelled) setRules(data.categories || []); })
      .catch(() => { if (!cancelled) setRules([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <SettingsSection
      title="Classificação automática"
      description="Categorias que o sistema já reconhece sozinho nos documentos recebidos."
    >
      {rules === null ? (
        <div className="p-4 text-sm text-muted-foreground">A carregar…</div>
      ) : rules.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">Sem categorias configuradas.</div>
      ) : (
        rules.map((r) => (
          <AboutRow key={r.category} label={r.category} value={`${r.keyword_count} palavras-chave`} />
        ))
      )}
    </SettingsSection>
  );
}

// Formulário de alteração do PIN de acesso — hoje não existia nenhuma forma
// de o fazer sem editar a base de dados à mão.
function ChangePinSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const c = current.replace(/\D/g, "");
    const n = next.replace(/\D/g, "");
    const cf = confirm.replace(/\D/g, "");
    if (n.length < 4 || n.length > 8) { toast.error("O novo PIN deve ter entre 4 e 8 dígitos"); return; }
    if (n !== cf) { toast.error("A confirmação não coincide com o novo PIN"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-pin", { current_pin: c, new_pin: n });
      toast.success("PIN alterado");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível alterar o PIN"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Alterar PIN" description="O PIN protege o acesso à app neste e nos outros dispositivos.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-label uppercase text-text-tertiary">
          PIN atual
          <Input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-label uppercase text-text-tertiary">
          Novo PIN
          <Input type="password" inputMode="numeric" autoComplete="off" value={next} onChange={(e) => setNext(e.target.value)} className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-label uppercase text-text-tertiary">
          Confirmar novo PIN
          <Input type="password" inputMode="numeric" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="relative self-end rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Spinner className="mx-auto h-3.5 w-3.5" /> : "Alterar PIN"}
        </button>
      </form>
    </SettingsSection>
  );
}

// Colaboradores para atribuição de tarefas (Tasks.jsx) — geridos aqui em
// vez de numa página própria, para não acrescentar mais uma entrada ao
// menu por uma lista pequena de manutenção pouco frequente. Apagar um
// colaborador não desatribui as tarefas já criadas (ver server.py:
// delete_collaborator) — ficam com um assignee_id "órfão", mostrado como
// "Colaborador removido" onde for preciso resolver o nome.
function CollaboratorsSection() {
  const [collaborators, setCollaborators] = useState(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    api.get("/collaborators")
      .then(({ data }) => setCollaborators(data))
      .catch(() => setCollaborators([]));
  };
  useEffect(load, []);

  const startEdit = (c) => { setEditingId(c.id); setName(c.name); };
  const cancelEdit = () => { setEditingId(null); setName(""); };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      if (editingId) await api.put(`/collaborators/${editingId}`, { name: trimmed });
      else await api.post("/collaborators", { name: trimmed });
      toast.success(editingId ? "Colaborador atualizado" : "Colaborador adicionado");
      setName(""); setEditingId(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível guardar"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Remover "${c.name}"? As tarefas já atribuídas mantêm-se, só deixam de mostrar o nome.`)) return;
    setBusyId(c.id);
    try {
      await api.delete(`/collaborators/${c.id}`);
      toast.success("Colaborador removido");
      setCollaborators((list) => list.filter((x) => x.id !== c.id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível remover"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsSection title="Colaboradores" description="Quem pode ser atribuído a uma tarefa, no módulo de Tarefas.">
      <div className="flex items-center gap-2 border-b border-border/70 p-4">
        <Input
          data-testid="collaborator-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={editingId ? "Renomear colaborador" : "Nome do novo colaborador"}
          className="h-9 flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        {editingId ? (
          <button type="button" onClick={cancelEdit} className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent">
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          data-testid="collaborator-save-btn"
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Spinner className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />} {editingId ? "Guardar" : "Adicionar"}
        </button>
      </div>
      {collaborators === null ? (
        <div className="p-4 text-sm text-muted-foreground">A carregar…</div>
      ) : collaborators.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">Ainda sem colaboradores.</div>
      ) : (
        collaborators.map((c) => (
          <SettingsRow
            key={c.id}
            icon={Users}
            label={c.name}
            description={`${c.tasks_count || 0} tarefa${c.tasks_count === 1 ? "" : "s"} atribuída${c.tasks_count === 1 ? "" : "s"}`}
            control={
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => startEdit(c)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => remove(c)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-[var(--pastel-red-bg)] hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          />
        ))
      )}
    </SettingsSection>
  );
}

// Lista dos dispositivos já verificados por PIN (db.auth_devices), com
// opção de revogar o acesso a qualquer um deles menos o atual.
const DEVICE_TYPE_ICON = {
  iPhone: Smartphone, Android: Smartphone, iPad: Tablet,
  Windows: Monitor, macOS: Monitor, Linux: Monitor,
};

// Notificações por dispositivo, não por conta: cada aparelho decide para
// si próprio se quer receber (desligado por omissão), e essa decisão pode
// ser revista à distância a partir desta página — sem depender de o
// utilizador estar sentado nesse aparelho.
function DevicesSection({ push, onTogglePush }) {
  const [devices, setDevices] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    api.get("/auth/devices")
      .then(({ data }) => setDevices(data))
      .catch(() => setDevices([]));
  };
  useEffect(load, []);

  const handleRevoke = async (d) => {
    if (!window.confirm(`Revogar o acesso deste dispositivo (${d.ip || "IP desconhecido"})?`)) return;
    setBusyId(d.id);
    try {
      await api.delete(`/auth/devices/${d.id}`);
      toast.success("Dispositivo revogado");
      setDevices((list) => list.filter((x) => x.id !== d.id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível revogar o dispositivo"));
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePush = async (d, enabled) => {
    if (d.is_current) {
      // Só o próprio browser pode criar/destruir a subscrição técnica —
      // reutiliza o fluxo já existente (pede permissão se for preciso).
      await onTogglePush?.(enabled);
      load();
      return;
    }
    setBusyId(d.id);
    try {
      await api.post(`/auth/devices/${d.id}/push`, { enabled });
      setDevices((list) => list.map((x) => (x.id === d.id ? { ...x, push_enabled: enabled } : x)));
      toast.success(enabled ? "Notificações ativadas nesse dispositivo" : "Notificações desativadas nesse dispositivo");
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível alterar"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SettingsSection title="Dispositivos" description="Notificações desligadas por omissão em cada dispositivo — ativa só onde queres mesmo recebê-las.">
      {devices === null ? (
        <div className="p-4 text-sm text-muted-foreground">A carregar…</div>
      ) : devices.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">Nenhum dispositivo verificado.</div>
      ) : (
        devices.map((d) => {
          const Icon = DEVICE_TYPE_ICON[d.device_type] || Smartphone;
          const pushOn = d.is_current ? push?.subscribed : d.push_enabled;
          return (
            <SettingsRow
              key={d.id}
              icon={Icon}
              label={d.is_current ? `Este dispositivo · ${d.device_type}` : d.device_type}
              description={`${d.ip || "IP desconhecido"} · ${pushOn ? "notificações ativas" : "notificações desligadas"}`}
              control={
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(pushOn)}
                    disabled={busyId === d.id || (d.is_current && (push?.busy || push?.checking))}
                    onCheckedChange={(checked) => handleTogglePush(d, checked)}
                  />
                  {!d.is_current ? (
                    <button
                      type="button"
                      disabled={busyId === d.id}
                      onClick={() => handleRevoke(d)}
                      className="rounded-xl border border-red-200 bg-[var(--pastel-red-bg)] px-2.5 py-1.5 text-xs font-bold text-[color:var(--pastel-red-text)] transition-colors hover:opacity-90 disabled:opacity-40"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              }
            />
          );
        })
      )}
    </SettingsSection>
  );
}

// Aba de Definições — a mesma coisa que já existia só no menu de sistema do
// computador (SystemMenu.jsx: notificações, instalar, bloquear, sobre)
// passa a ter também uma página própria no telemóvel, alcançável a partir
// da gaveta "Mais". O fundo do ambiente de trabalho fica de fora — é uma
// opção só do modo computador (pinta o papel de parede à volta das
// janelas), sem equivalente na navegação por páginas do telemóvel.
export default function Settings() {
  const { status, online } = useSystemStatus();
  const { showInstallOption, install, isStandalone, isIos } = usePwaInstall();
  const push = usePushNotifications();
  const [installing, setInstalling] = useState(false);
  const [iosStepsOpen, setIosStepsOpen] = useState(false);

  const handleInstall = async () => {
    if (installing) return;
    haptics.tap();
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === "ios-instructions") setIosStepsOpen(true);
      else if (outcome === "unavailable") {
        toast.info("Ainda não é possível instalar automaticamente. Usa o menu do navegador (⋮) e escolhe \"Instalar aplicação\".");
      } else if (outcome === "accepted") toast.success("BRICO OS instalado!");
    } finally {
      setInstalling(false);
    }
  };

  const handleTogglePush = async (checked) => {
    if (push.busy) return;
    haptics.tap();
    if (!checked) {
      await push.unsubscribe();
      toast.info("Notificações desativadas neste dispositivo.");
      return;
    }
    if (isIos && !isStandalone) {
      toast.info("No iPhone/iPad, instala primeiro o BRICO OS no ecrã principal — as notificações só funcionam depois de instalada.");
      return;
    }
    const result = await push.subscribe();
    if (result.ok) {
      toast.success("Notificações ativadas — vais receber um aviso quando chegar um email novo.");
      push.sendTest();
    } else if (result.reason === "denied") {
      toast.error("Permissão de notificações recusada. Ativa-a nas definições do browser/telemóvel para este site.");
    } else {
      toast.error("Não foi possível ativar as notificações. Tenta novamente.");
    }
  };

  return (
    <div className="pb-4">
      <div className="flex flex-col gap-1">
        <p className="kicker">Sistema</p>
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Definições
        </h1>
      </div>

      <SettingsSection
        title="Notificações"
        description="Recebe um aviso no telemóvel quando chegar um email novo — mesmo com a app fechada."
      >
        <SettingsRow
          testid="settings-push-row"
          icon={Bell}
          label="Notificações neste dispositivo"
          description={
            !push.supported
              ? "Este browser não suporta notificações push."
              : push.subscribed
                ? "Ativas — vais ser avisado ao chegar um email novo."
                : "Desativadas."
          }
          control={
            push.supported ? (
              <Switch
                data-testid="settings-push-switch"
                checked={push.subscribed}
                disabled={push.busy || push.checking}
                onCheckedChange={handleTogglePush}
              />
            ) : null
          }
        />
        {isIos && !isStandalone ? (
          <div className="border-t border-border/70 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            No iPhone/iPad as notificações só funcionam com a app instalada no ecrã principal — instala-a primeiro (secção "Aplicação" abaixo).
          </div>
        ) : null}
      </SettingsSection>

      <SettingsFieldsCard
        group="notification_prefs"
        title="Categorias de notificação"
        description="Escolhe que tipo de eventos geram um aviso — aplica-se a todos os dispositivos com notificações ativas."
        fields={[
          { key: "supplier", label: "Respostas de fornecedores", type: "switch" },
          { key: "client", label: "Respostas de clientes", type: "switch" },
          { key: "correio_semanal", label: "Correio Semanal e Anexos_Edição", type: "switch" },
          { key: "unmatched", label: "Emails sem pedido associado", type: "switch" },
          { key: "waiting_supplier", label: "Pedido parado à espera do fornecedor", type: "switch" },
          { key: "forgotten", label: "Pedido esquecido", type: "switch" },
          { key: "urgent", label: "Pedido urgente", type: "switch" },
          { key: "reminder_overdue", label: "Lembrete atrasado", type: "switch" },
          { key: "quote_quality_issue", label: "Problema de qualidade no orçamento do fornecedor", type: "switch" },
          { key: "quote_changed", label: "Orçamento do fornecedor atualizado", type: "switch" },
          { key: "anexos_incidencia_critica", label: "Incidência crítica no Anexos_Edição", type: "switch" },
          { key: "client_new_note", label: "Novo pedido de cliente", type: "switch" },
          { key: "task_urgent", label: "Tarefa urgente criada", type: "switch" },
          { key: "deadline_approaching", label: "Prazo prestes a terminar", type: "switch" },
          { key: "document_read_failure", label: "Falha na leitura de um documento", type: "switch" },
          { key: "processing_error", label: "Erro de processamento", type: "switch" },
          { key: "price_change", label: "Alteração importante de preços", type: "switch" },
          { key: "task_reminder", label: "Lembrete de tarefa", type: "switch" },
          { key: "tasks_overdue_digest", label: "Aviso diário de tarefas atrasadas", type: "switch" },
          { key: "knowledge_new_article", label: "Novo artigo no Correio Semanal", type: "switch" },
          { key: "knowledge_engine_updated", label: "Motor de análise do Correio Semanal atualizado", type: "switch" },
        ]}
      />

      <SettingsFieldsCard
        group="material_margins"
        title="Margens por material"
        description="Percentagem de margem aplicada por omissão ao sugerir o preço ao cliente, consoante o material identificado no orçamento do fornecedor."
        fields={[
          { key: "pvc", label: "PVC", type: "number", suffix: "%" },
          { key: "aluminio", label: "Alumínio", type: "number", suffix: "%" },
          { key: "portada", label: "Portada", type: "number", suffix: "%" },
          { key: "rede", label: "Rede mosquiteira", type: "number", suffix: "%" },
          { key: "desconhecido", label: "Material não identificado", type: "number", suffix: "%" },
        ]}
      />

      <SettingsFieldsCard
        group="price_rounding"
        title="Arredondamento comercial dos preços"
        description="Os preços sugeridos ao cliente arredondam sempre para cima, ao múltiplo indicado no escalão de valor correspondente."
        fields={[
          { key: "limit_1", label: "Limite do 1º escalão", type: "number", suffix: "€" },
          { key: "limit_2", label: "Limite do 2º escalão", type: "number", suffix: "€" },
          { key: "limit_3", label: "Limite do 3º escalão", type: "number", suffix: "€" },
          { key: "limit_4", label: "Limite do 4º escalão", type: "number", suffix: "€" },
          { key: "step_0", label: "Arredondamento abaixo do 1º limite", type: "number", suffix: "€" },
          { key: "step_1", label: "Arredondamento no 2º escalão", type: "number", suffix: "€" },
          { key: "step_2", label: "Arredondamento no 3º escalão", type: "number", suffix: "€" },
          { key: "step_3", label: "Arredondamento no 4º escalão", type: "number", suffix: "€" },
          { key: "step_4", label: "Arredondamento acima do 4º limite", type: "number", suffix: "€" },
        ]}
      />

      <SettingsFieldsCard
        group="automation_prefs"
        title="Automação"
        description="Cadências e limites usados pelas tarefas automáticas de fundo."
        fields={[
          { key: "imap_poll_minutes", label: "Verificar a caixa de entrada a cada", type: "number", suffix: "min" },
          { key: "auto_close_months", label: "Arquivar pedidos inativos após", type: "number", suffix: "meses" },
          { key: "default_sla_days", label: "Prazo padrão de resposta a um pedido", type: "number", suffix: "dias" },
          { key: "reminder_interval_days", label: "Intervalo padrão entre lembretes", type: "number", suffix: "dias" },
          { key: "category_suggestion_threshold", label: "Edições repetidas antes de sugerir categoria nova", type: "number" },
          { key: "supplier_quote_history_limit", label: "Versões do orçamento guardadas no histórico", type: "number" },
          { key: "deadline_warning_days", label: "Avisar antes do prazo terminar", type: "number", suffix: "dias" },
          { key: "price_change_alert_pct", label: "Variação de preço que gera alerta", type: "number", suffix: "%" },
          { key: "notification_scan_minutes", label: "Verificar alertas de pedidos parados/urgentes a cada", type: "number", suffix: "min" },
          { key: "auto_process_correio_semanal", label: "Processar automaticamente novas edições do Correio Semanal", type: "switch" },
        ]}
      />

      <SettingsFieldsCard
        group="security_prefs"
        title="Segurança"
        description="Regras do PIN de acesso e do bloqueio automático por inatividade."
        fields={[
          { key: "pin_max_attempts", label: "Tentativas de PIN antes de bloquear", type: "number" },
          { key: "pin_lock_minutes", label: "Minutos de bloqueio ao exceder as tentativas", type: "number", suffix: "min" },
          { key: "auto_lock_minutes", label: "Bloquear automaticamente após inatividade", type: "number", suffix: "min (0 = desligado)" },
        ]}
      />

      <ChangePinSection />
      <DevicesSection push={push} onTogglePush={handleTogglePush} />

      <SettingsFieldsCard
        group="upload_limits"
        title="Limites de anexos"
        description="Tamanhos e quantidades máximas aceites em PDFs de fornecedores, no Anexos_Edição e nos emails enviados."
        fields={[
          { key: "max_supplier_pdf_mb", label: "Tamanho máximo de um PDF de fornecedor", type: "number", suffix: "MB" },
          { key: "max_anexos_zip_mb", label: "Tamanho máximo do Anexos_Edição.zip", type: "number", suffix: "MB" },
          { key: "max_email_attachment_total_mb", label: "Tamanho máximo total de anexos por email enviado", type: "number", suffix: "MB" },
          { key: "max_attachments_per_email", label: "Anexos aceites por email recebido", type: "number" },
        ]}
      />

      <SettingsFieldsCard
        group="defaults_prefs"
        title="Pedidos e tarefas por omissão"
        description="Valores pré-selecionados ao criar um novo pedido ou uma nova tarefa."
        fields={[
          {
            key: "default_note_category", label: "Categoria por omissão de novos pedidos", type: "select",
            options: TEMPLATE_OPTIONS.map((o) => ({ key: o.key, label: o.label })),
          },
          {
            key: "default_task_priority", label: "Prioridade por omissão de novas tarefas", type: "select",
            options: Object.entries(TASK_PRIORITIES).map(([key, v]) => ({ key, label: v.label })),
          },
          {
            key: "default_task_repeat", label: "Repetição por omissão de novas tarefas", type: "select",
            options: Object.entries(TASK_REPEATS).map(([key, label]) => ({ key, label })),
          },
        ]}
      />

      <CollaboratorsSection />

      <SettingsFieldsCard
        group="email_prefs"
        title="Email"
        description="Estilo e remetente esperado das mensagens enviadas e recebidas pela app."
        fields={[
          { key: "include_signature", label: "Incluir assinatura nas mensagens enviadas", type: "switch" },
          { key: "auto_greeting", label: "Usar saudação automática consoante a hora do dia", type: "switch" },
          { key: "correio_semanal_sender", label: "Remetente esperado do Correio Semanal", type: "text" },
        ]}
      />

      <SettingsFieldsCard
        group="desktop_widget_limits"
        title="Resumo no ambiente de trabalho"
        description="Quantas linhas aparecem em cada módulo do ecrã principal do computador."
        fields={[
          { key: "agenda_limit", label: "Tarefas em \"Agenda de hoje\"", type: "number" },
          { key: "pedidos_limit", label: "Pedidos em \"Pedidos em aberto\"", type: "number" },
          { key: "correio_limit", label: "Emails em \"Correio por ver\"", type: "number" },
        ]}
      />

      <ClassificationRulesPanel />

      <SettingsSection title="Aplicação">
        {showInstallOption ? (
          <>
            <SettingsRow
              testid="settings-install-row"
              icon={Download}
              label="Instalar BRICO OS"
              description="Acesso mais rápido, direto do ecrã principal."
              control={
                <button
                  type="button"
                  data-testid="settings-install-btn"
                  disabled={installing}
                  onClick={handleInstall}
                  className="rounded-xl bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Instalar
                </button>
              }
            />
            {iosStepsOpen ? (
              <div className="border-t border-border/70 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <Share className="h-3.5 w-3.5 shrink-0" /> 1. Toca em "Partilhar" na barra do Safari
                </p>
                <p className="mt-1.5 flex items-center gap-1.5">
                  <SquarePlus className="h-3.5 w-3.5 shrink-0" /> 2. Escolhe "Adicionar ao Ecrã Principal"
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <SettingsRow icon={Smartphone} label="BRICO OS já instalado" description="Estás a usar a app instalada no dispositivo." />
        )}
      </SettingsSection>

      <SettingsSection title="Sistema">
        <SettingsRow
          testid="settings-reload-row"
          icon={RotateCw}
          label="Reiniciar interface"
          description="Recarrega a app do zero."
          control={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-accent"
            >
              Reiniciar
            </button>
          }
        />
        <SettingsRow
          testid="settings-lock-row"
          icon={Lock}
          label="Bloquear ecrã"
          description="Pede o PIN outra vez antes de continuar a usar a app."
          control={
            <button
              type="button"
              data-testid="settings-lock-btn"
              onClick={() => { haptics.tap(); lockScreen(); }}
              className="rounded-xl border border-red-200 bg-[var(--pastel-red-bg)] px-3 py-1.5 text-xs font-bold text-[color:var(--pastel-red-text)] transition-colors hover:opacity-90"
            >
              Bloquear
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection title="Sobre">
        <AboutRow
          label="Estado"
          value={
            <span className="flex items-center gap-1.5 justify-end">
              <span className={`led ${online ? "led-ok" : "led-alert"}`} />
              {online ? "Ligado" : "Offline"}
            </span>
          }
        />
        <AboutRow label="Versão" value="2.0 · build 2026.07" />
        <AboutRow label="Sessão ativa há" value={sessionUptime()} />
        <AboutRow label="Pedidos ativos" value={status?.pedidos_ativos ?? "–"} />
        <AboutRow label="Emails por ver" value={status?.emails_nao_vistos ?? "–"} />
        <AboutRow label="Tarefas pendentes" value={status?.tarefas_pendentes ?? "–"} />
        <AboutRow label="Dispositivo" value={getDeviceToken() ? "Verificado por PIN" : "Não verificado"} />
      </SettingsSection>
    </div>
  );
}
