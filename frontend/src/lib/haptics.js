// Feedback háptico central — um único sítio a decidir "quando e como
// vibrar", para o resto da app nunca ter de pensar em navigator.vibrate,
// suporte do aparelho, ou disparos em cadeia. Sem suporte (iOS Safari
// incluído, e qualquer desktop sem hardware de vibração) fica em
// silêncio absoluto — nunca lança erro nem afeta o resto da interação.
const supported = typeof window !== "undefined" && "vibrate" in window.navigator;

// Só filtra a MESMA sensação a repetir-se depressa demais (ex.: o
// StrictMode do React a invocar duas vezes o mesmo updater em
// desenvolvimento, ou um duplo-toque acidental) — nunca bloqueia uma
// sensação diferente a seguir a outra, mesmo em sequência imediata.
// Isso importa: uma tecla do PIN premida e o erro da submissão que se
// segue são dois sinais distintos e têm de se sentir os dois, mesmo que
// o pedido falhe em menos de um milissegundo.
const MIN_REPEAT_MS = 60;
let lastKey = "";
let lastFireAt = 0;

function fire(pattern) {
  if (!supported) return;
  const key = typeof pattern === "number" ? String(pattern) : pattern.join(",");
  const now = Date.now();
  if (key === lastKey && now - lastFireAt < MIN_REPEAT_MS) return;
  lastKey = key;
  lastFireAt = now;
  try { window.navigator.vibrate(pattern); } catch { /* alguns contextos (iframe, permissão) recusam silenciosamente */ }
}

// Vocabulário de sensações — cada uma mapeia para um padrão de impulsos
// (ms ligado/desligado, ...), nunca para números soltos espalhados pela
// app. Curto de propósito: vibrações longas cansam e parecem uma falha
// do aparelho, não um sinal deliberado do sistema.
export const haptics = {
  // Toque leve — confirmação de um botão/tecla premida (teclado do PIN,
  // abrir uma app do dock, fechar um separador da taskbar).
  tap: () => fire(10),
  // Alternar um estado (favorito, mover um cartão no Kanban) — dois
  // impulsos curtos, distingue-se do tap simples sem ser mais longo.
  selection: () => fire([8, 40, 8]),
  // Peça encaixada — arrastar/largar (reordenar o dock) ou uma janela a
  // ancorar a uma margem.
  impact: () => fire(18),
  // Ação concluída com sucesso — pedido criado, email enviado, PIN certo.
  success: () => fire([12, 60, 20]),
  // Aviso — a aproximar-se de um limite ou a pedir confirmação antes de
  // um passo que não se desfaz.
  warning: () => fire([25, 80, 25]),
  // Falhou / ação destrutiva — PIN errado, erro de rede, eliminar
  // definitivamente. O padrão mais forte, reservado para o que realmente
  // importa, para nunca perder o significado por uso excessivo.
  error: () => fire([30, 60, 30, 60, 40]),
};

export default haptics;
