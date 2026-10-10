import { useEffect } from "react";
import { isDesktop } from "@/lib/platform";

// A janela nativa do Jarvis é um retângulo transparente maior que o que se vê
// (folga em volta da orbe, espaço ao lado da orbe embaixo do painel, área do
// balão). Sem isto, essa parte invisível "segura" os cliques e não dá pra
// clicar no que está atrás dela.
// Como uma janela que ignora o mouse não recebe mais eventos, a decisão é
// feita olhando a posição GLOBAL do cursor (~16x por segundo): se o ponto
// sob o cursor é só fundo vazio (elemento marcado com data-jarvis-vazio, ou
// html/body/#root), a janela passa a ignorar o mouse; em cima de conteúdo
// de verdade (orbe, painel, balão, diálogos, menus), volta a receber.
const INTERVALO_MS = 60;

function ehFundoVazio(el: Element | null): boolean {
  if (!el) return true;
  if (el === document.documentElement || el === document.body || el.id === "root") return true;
  return el.hasAttribute("data-jarvis-vazio");
}

export function useJarvisClicaAtravessa(ativo: boolean) {
  useEffect(() => {
    if (!ativo || !isDesktop()) return;
    let cancelado = false;
    let ignorando = false;
    let botaoApertado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const aperta = () => { botaoApertado = true; };
    const solta = () => { botaoApertado = false; };
    window.addEventListener("pointerdown", aperta, true);
    window.addEventListener("pointerup", solta, true);
    window.addEventListener("blur", solta);

    void (async () => {
      const { getCurrentWindow, cursorPosition } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const definir = async (ignorar: boolean) => {
        if (ignorar === ignorando) return;
        ignorando = ignorar;
        try { await win.setIgnoreCursorEvents(ignorar); } catch { /* sem permissão: segue clicável */ }
      };
      const verificar = async () => {
        if (cancelado) return;
        try {
          // Durante um arraste (mover a orbe, redimensionar) nunca solta o mouse.
          if (botaoApertado && !ignorando) {
            await definir(false);
          } else {
            const [cursor, origem, escala] = await Promise.all([cursorPosition(), win.innerPosition(), win.scaleFactor()]);
            const x = (cursor.x - origem.x) / escala;
            const y = (cursor.y - origem.y) / escala;
            const dentro = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
            await definir(dentro && ehFundoVazio(document.elementFromPoint(x, y)));
          }
        } catch { /* janela fechando etc. */ }
        if (!cancelado) timer = setTimeout(() => void verificar(), INTERVALO_MS);
      };
      void verificar();
    })();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", aperta, true);
      window.removeEventListener("pointerup", solta, true);
      window.removeEventListener("blur", solta);
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().setIgnoreCursorEvents(false)).catch(() => undefined);
    };
  }, [ativo]);
}
