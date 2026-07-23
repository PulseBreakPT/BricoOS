// "Quem está a usar este aparelho agora" — não é autenticação (a app só
// tem o PIN partilhado do dispositivo, ver deviceAuth.js), é só uma
// conveniência local para atribuir autor ao histórico das tarefas
// (server.py: log_task_activity). Guardado por aparelho, tal como o
// device_id/token — trocar de telemóvel não arrasta esta escolha.

const ACTIVE_COLLABORATOR_KEY = "brico_active_collaborator";

function safeGet(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* modo privado sem storage */ }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function getActiveCollaborator() {
  const raw = safeGet(ACTIVE_COLLABORATOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setActiveCollaborator(collaborator) {
  if (!collaborator?.id) {
    safeRemove(ACTIVE_COLLABORATOR_KEY);
    return;
  }
  safeSet(ACTIVE_COLLABORATOR_KEY, JSON.stringify({ id: collaborator.id, name: collaborator.name }));
}

export function getActiveCollaboratorName() {
  return getActiveCollaborator()?.name || "";
}
