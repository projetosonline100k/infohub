import { isDesktop } from "@/lib/platform";
import type { WorkspaceTab } from "@/components/workspace/WorkspaceTabs";

// Reabrir o app do jeito que estava (pedido do Davi): as guias de cima, a
// ativa, a tela dividida e em que página cada guia estava. Só a janela
// principal do app do Mac guarda e restaura — guias destacadas e o Atlas
// têm a própria árvore e não podem sobrescrever a sessão dela.
export interface SessaoWorkspace { tabs: WorkspaceTab[]; activeId: string; divisao: string[] | null; larguras: number[] }
const CHAVE = "workspace:sessao";

// Rótulo da janela no Tauri; sem ele, decide pelo caminho com que a janela nasceu
// (a principal nasce em "/", as destacadas na rota da guia, o Atlas em /jarvis).
const caminhoDeNascimento = typeof window !== "undefined" ? window.location.pathname : "";
export function ehJanelaPrincipal(): boolean {
  if (!isDesktop()) return false;
  const rotulo = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
  return rotulo ? rotulo === "main" : caminhoDeNascimento === "/";
}

export function lerSessao(): SessaoWorkspace | null {
  if (!ehJanelaPrincipal()) return null;
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || "null") as SessaoWorkspace | null;
    if (!s || !Array.isArray(s.tabs) || !s.tabs.length || !s.tabs.some((t) => t.id === s.activeId)) return null;
    return s;
  } catch {
    return null;
  }
}

export function salvarSessao(s: SessaoWorkspace) {
  if (!ehJanelaPrincipal()) return;
  try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem storage */ }
}

// Chamado antes do React montar: a janela principal nasce em "/" e aqui já
// pula pro endereço da guia que estava ativa (o roteador lê o endereço ao criar).
export function restaurarRotaInicial() {
  if (window.location.pathname !== "/" || window.location.search) return;
  const s = lerSessao();
  const ativa = s?.tabs.find((t) => t.id === s.activeId);
  if (ativa && ativa.path !== "/") window.history.replaceState(null, "", ativa.path);
}
