// Medidas fixas do layout partilhadas com a Área de Trabalho — para as
// janelas nunca ficarem posicionadas por baixo da barra lateral ou da
// taskbar. Task/sidebar já eram fixas antes da Área de Trabalho existir;
// isto só torna essa largura/altura conhecida também aqui, em vez de cada
// sítio assumir que o ecrã começa em x=0.
export const SIDEBAR_WIDTH = 256; // Layout.jsx: <aside className="... w-64 ...">
export const TASKBAR_RESERVE = 84; // espaço reservado para a Taskbar.jsx no fundo
export const WORKSPACE_GAP = 8;
