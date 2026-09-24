// Wrappers finos sobre @tauri-apps/api/window — únicos pontos do app que
// importam esse pacote. No-op na web (sempre guardados por isDesktop()).
import { isDesktop } from "@/lib/platform";
import { emitMainNavigate } from "@/lib/desktop/events";

// Chamado no pointerdown da orbe quando ela está numa janela nativa
// (variant="window" do Assistant): quem se move é a janela do SO, não um
// div posicionado via CSS.
export async function startWindowDrag(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    // O SO só devolve esse await quando o usuário solta o botão do mouse —
    // ou seja, o arraste nativo já terminou aqui.
    await win.startDragging();
    // Rodada 11, item 2: depois de QUALQUER arraste (orbe fechada, balão de
    // notificação ou pelo cabeçalho do painel aberto — ver
    // AssistantPanel.tsx), a janela pode ter ficado em outro lugar da
    // tela. Sem isto, a âncora "de casa" (ver ancoraCache mais abaixo)
    // ficava travada na posição de ANTES do arraste — daí a próxima vez
    // que o painel/orbe abria, "pulava" de volta pro lugar antigo em vez
    // de nascer perto de onde o Jarvis estava de verdade.
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    const size = (await win.outerSize()).toLogical(scale);
    ancoraCache = { x: pos.x + size.width, y: pos.y + size.height };
  } catch {
    /* fora de uma janela Tauri ou permissão ausente — ignora */
  }
}

// Helper central (item 1 da rodada 3): qualquer ação do Jarvis que precise
// mostrar o Infopro Hub "de verdade" (Ver todas, Notas completas, Expandir,
// abrir projeto/documento) passa por aqui — nunca por navigate() local
// dentro da janela jarvis (isso só rendeeria o app inteiro espremido nela).
// Mostra, tira de minimizada, maximiza (ou mantém maximizada se já estava)
// e foca a janela `main`; se uma rota for passada, manda a main navegar pra
// lá via evento nativo (ver desktop/events.ts). A janela `jarvis` nunca é
// tocada aqui — continua flutuando exatamente como estava.
export async function openMainWindow(route?: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const main = await Window.getByLabel("main");
    if (!main) return;
    if (await main.isMinimized()) await main.unminimize();
    await main.show();
    if (!(await main.isMaximized())) await main.maximize();
    await main.setFocus();
    if (route) await emitMainNavigate(route);
  } catch {
    /* ignora — a janela pode já estar no estado desejado */
  }
}

export async function hideMainWindow(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { Window } = await import("@tauri-apps/api/window");
    const main = await Window.getByLabel("main");
    await main?.hide();
  } catch {
    /* ignora */
  }
}

interface Tamanho {
  width: number;
  height: number;
}

// Rodada 8: só existem 3 tamanhos possíveis pra janela `jarvis`, fixos, sem
// cálculo por conteúdo e sem escolha do usuário (resize manual removido por
// enquanto — item 7 do pedido). Qualquer ajuste futuro de tamanho passa por
// mudar UM destes 3 números, nunca por lógica espalhada pelos componentes.
export type JarvisWindowMode = "orb" | "panel" | "notification";

const TAMANHOS: Record<JarvisWindowMode, Tamanho> = {
  orb: { width: 140, height: 140 },
  panel: { width: 460, height: 620 },
  // Rodada 12: 230 só cabia o card, sem sobra pra orbe também aparecer
  // (usuário queria ver a orbe junto da mensagem — "dá a impressão que ele
  // está falando comigo"). 360 dá espaço pro card (agora com altura de
  // conteúdo, não mais forçado a preencher tudo) empilhado ACIMA da orbe
  // (~140px), ambos alinhados no canto inferior direito.
  notification: { width: 380, height: 360 },
};

// Item 4, rodada 8: garante que a janela `jarvis` (em qualquer modo) fique
// inteira dentro da área útil do monitor atual (sem tocar dock/menu bar),
// empurrando de volta pra dentro se a posição calculada (ex.: mantendo o
// canto inferior direito fixo ao crescer) tiver deixado alguma borda pra
// fora. Nunca muda o tamanho — só reposiciona.
async function posicaoDentroDoMonitor(x: number, y: number, width: number, height: number): Promise<{ x: number; y: number }> {
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor();
    if (!monitor) return { x, y };
    const workPos = monitor.workArea.position.toLogical(monitor.scaleFactor);
    const workSize = monitor.workArea.size.toLogical(monitor.scaleFactor);
    const minX = workPos.x;
    const minY = workPos.y;
    const maxX = Math.max(minX, workPos.x + workSize.width - width);
    const maxY = Math.max(minY, workPos.y + workSize.height - height);
    return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
  } catch {
    return { x, y };
  }
}

// Rodada 9, item 3: âncora estável (canto inferior direito "de casa" da
// orbe), guardada em memória — nunca recalculada a partir do tamanho/
// posição ATUAL da janela (isso é o que causava o "abre em outro canto":
// cada troca de modo calculava a próxima posição em cima da última, e
// qualquer erro de arredondamento/timing acumulava a cada ciclo
// orbe→painel→orbe). Toda troca de modo agora deriva SEMPRE da mesma
// âncora. Só é re-sincronizada quando a própria janela está (ou acabou de
// ficar, por causa de um arraste nativo) do tamanho da orbe — é o único
// momento em que "posição atual" É a âncora de verdade.
let ancoraCache: { x: number; y: number } | null = null;

async function obterAncora(win: InstanceType<typeof import("@tauri-apps/api/window").Window>, scale: number): Promise<{ x: number; y: number }> {
  const pos = (await win.outerPosition()).toLogical(scale);
  const size = (await win.outerSize()).toLogical(scale);
  const pareceOrbe = Math.abs(size.width - TAMANHOS.orb.width) < 1 && Math.abs(size.height - TAMANHOS.orb.height) < 1;
  if (pareceOrbe || !ancoraCache) {
    ancoraCache = { x: pos.x + size.width, y: pos.y + size.height };
  }
  return ancoraCache;
}

// ÚNICA função que redimensiona/reposiciona a janela nativa `jarvis` (item
// 4/9 do pedido — "não deixar vários componentes controlando tamanho da
// janela"). Sempre mantém o canto inferior direito ancorado no mesmo ponto
// ao trocar de modo (item 5 — o Jarvis não "pula" de lugar a cada troca),
// depois reclampa a posição resultante pro monitor atual (item 5),
// garantindo que painel e notificação nunca fiquem cortados perto de uma
// borda. A janela `jarvis` nunca fica redimensionável pelo usuário (resize
// manual removido — item 7); os 3 tamanhos em si vivem só em TAMANHOS,
// acima.
export async function setJarvisWindowMode(mode: JarvisWindowMode): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow, LogicalSize, LogicalPosition } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    const ancora = await obterAncora(win, scale);
    const target = TAMANHOS[mode];
    const bruta = { x: ancora.x - target.width, y: ancora.y - target.height };
    const { x, y } = await posicaoDentroDoMonitor(bruta.x, bruta.y, target.width, target.height);
    // Tamanho primeiro, depois posição — se o painel está prestes a
    // renderizar (quem chama controla isso via `await`, ver abrirPainel em
    // Assistant.tsx), a janela já está no lugar e no tamanho certos antes
    // de qualquer conteúdo aparecer.
    await win.setSize(new LogicalSize(target.width, target.height));
    await win.setPosition(new LogicalPosition(x, y));
    // Se o monitor clampou a posição, a âncora "de casa" também precisa
    // acompanhar — senão o próximo modo calcula de novo a partir do ponto
    // original (fora da tela) e clampa de novo, ficando sempre "puxando"
    // pra dentro em vez de já nascer no lugar certo.
    ancoraCache = { x: x + target.width, y: y + target.height };
  } catch {
    /* ignora — Jarvis ainda funciona, só não redimensiona a janela */
  }
}
