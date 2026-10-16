import { createContext, useContext } from "react";

// Cada aba do app (WorkspacePages) diz às páginas dela se está visível. As
// janelas (Dialog) são desenhadas fora da aba, então sem isso o editor de vídeo
// aberto no projeto do Davi continuava na tela (e tocando) ao trocar pra outra
// aba (15/10). Fora das abas (janela do Atlas, páginas públicas) vale `true`.
export const AbaAtivaContext = createContext(true);
export const useAbaAtiva = () => useContext(AbaAtivaContext);
