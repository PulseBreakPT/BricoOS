// Medidas fixas do layout partilhadas com a Área de Trabalho — para as
// janelas nunca ficarem posicionadas por baixo da barra lateral ou da
// taskbar. Task/sidebar já eram fixas antes da Área de Trabalho existir;
// isto só torna essa largura/altura conhecida também aqui, em vez de cada
// sítio assumir que o ecrã começa em x=0.
// O desktop já não tem uma sidebar permanente. A área útil começa depois
// da menubar e termina antes do dock flutuante, tal como num SO de desktop.
// SIDEBAR_WIDTH fica exportada como zero para os módulos mais antigos que
// ainda importam a constante continuarem compatíveis.
export const SIDEBAR_WIDTH = 0;
export const SYSTEM_BAR_HEIGHT = 48;
export const TASKBAR_RESERVE = 88;
export const WORKSPACE_GAP = 12;
