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
    definirAncora({ x: pos.x + size.width, y: pos.y + size.height });
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

// "Clicar fora" não existe como conceito de DOM pra uma janela nativa sem
// decorações (a janela inteira É o conteúdo — não tem uma área "de fora"
// dentro da mesma página) — o equivalente é a janela perder o foco pro SO
// (clicar em outro app/janela). Chamado de dentro da própria janela
// `jarvis` (variant="window" do Assistant), então getCurrentWindow() já é
// ela mesma. Retorna a função de "unlisten" pra limpar no unmount.
export async function aoPerderFocoJanela(callback: () => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    return await win.onFocusChanged(({ payload: focado }) => {
      if (!focado) callback();
    });
  } catch {
    return () => {};
  }
}

// Espelho de aoPerderFocoJanela, pro caso "saudação de bom dia" (Encerrar o
// dia, item 13): na janela `jarvis` (criada uma vez, nunca desmontada —
// `closable: false`), um `useEffect` "ao montar" só dispara uma vez por
// LANÇAMENTO do app, não uma vez por DIA — se a pessoa deixar o Mac e o app
// ligados de um dia pro outro (bem provável: recusar "Repousar Mac" faz
// exatamente isso), a saudação nunca apareceria de novo. Reverificar quando
// a janela reganha o foco cobre esse caso.
export async function aoGanharFocoJanela(callback: () => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    return await win.onFocusChanged(({ payload: focado }) => {
      if (focado) callback();
    });
  } catch {
    return () => {};
  }
}

interface Tamanho {
  width: number;
  height: number;
}

// Rodada 8: só existem 3 tamanhos possíveis pra janela `jarvis`, fixos, sem
// cálculo por conteúdo e sem escolha do usuário (resize manual removido por
// enquanto — item 7 do pedido). Qualquer ajuste futuro de tamanho passa por
// mudar UM destes números, nunca por lógica espalhada pelos componentes.
export type JarvisWindowMode = "orb" | "panel" | "notification";

const ORB_TAMANHO: Tamanho = { width: 140, height: 140 };

// Único ponto de verdade pro tamanho do CONTEÚDO do painel (o que
// AssistantPanel.tsx realmente preenche, `h-full w-full` por dentro) —
// Assistant.tsx importa isto pra dimensionar a caixa que envolve o painel,
// em vez de repetir 460/620 num segundo lugar (esse tipo de duplicação já
// causou uma regressão real aqui — ver comentário em AssistantPanel.tsx
// sobre "painel e janela real de tamanhos diferentes").
export const TAMANHO_CONTEUDO_PAINEL: Tamanho = { width: 460, height: 620 };

// Item novo (pedido do usuário): "quando abro o Jarvis, ele some de onde
// está" — antes, o painel preenchia a janela inteira e cobria a orbe por
// trás. Agora a orbe continua visível, empilhada embaixo do painel — mesmo
// tratamento visual (gap + padding pro anel de progresso) já usado no modo
// notificação, só com o painel no lugar do card.
const GAP_EMPILHADO = 8; // gap-2
const PADDING_EMPILHADO = 24; // p-6, em cada lado

const PANEL_TAMANHO: Tamanho = {
  width: TAMANHO_CONTEUDO_PAINEL.width + PADDING_EMPILHADO * 2,
  height: TAMANHO_CONTEUDO_PAINEL.height + GAP_EMPILHADO + ORB_TAMANHO.height + PADDING_EMPILHADO * 2,
};

// Rodada 12: 230 só cabia o card, sem sobra pra orbe também aparecer
// (usuário queria ver a orbe junto da mensagem — "dá a impressão que ele
// está falando comigo"). 360 dá espaço pro card (agora com altura de
// conteúdo, não mais forçado a preencher tudo) empilhado ACIMA da orbe
// (~140px), ambos alinhados no canto inferior direito.
const NOTIFICATION_TAMANHO: Tamanho = { width: 380, height: 360 };

const TAMANHOS: Record<JarvisWindowMode, Tamanho> = {
  orb: ORB_TAMANHO,
  panel: PANEL_TAMANHO,
  notification: NOTIFICATION_TAMANHO,
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

// Item novo (pedido do usuário): "arrasto o Jarvis pra um canto bom, quero
// que continue ali depois de fechar e abrir de novo" — inclusive depois de
// FECHAR E REABRIR O APP, não só dentro da mesma sessão. Mesma chave de
// armazenamento (localStorage, compartilhado entre as janelas do mesmo
// app) já usada pela versão embutida (ver CHAVE_POSICAO em Assistant.tsx).
const CHAVE_ANCORA = "jarvisAncora";

function lerAncoraSalva(): { x: number; y: number } | null {
  try {
    const salvo = localStorage.getItem(CHAVE_ANCORA);
    if (!salvo) return null;
    const parsed = JSON.parse(salvo);
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
  } catch {
    /* localStorage indisponível ou corrompido — cai no comportamento de sempre */
  }
  return null;
}

// Rodada 9, item 3: âncora estável (canto inferior direito "de casa" da
// orbe) — nunca recalculada a partir do tamanho/posição ATUAL da janela
// (isso é o que causava o "abre em outro canto": cada troca de modo
// calculava a próxima posição em cima da última, e qualquer erro de
// arredondamento/timing acumulava a cada ciclo orbe→painel→orbe). Toda
// troca de modo agora deriva SEMPRE da mesma âncora. Só é re-sincronizada
// quando a própria janela está (ou acabou de ficar, por causa de um
// arraste nativo) do tamanho da orbe — é o único momento em que "posição
// atual" É a âncora de verdade.
let ancoraCache: { x: number; y: number } | null = lerAncoraSalva();

// A janela `jarvis` SEMPRE nasce do tamanho da orbe (ver "width"/"height" em
// tauri.conf.json) — sem este flag, a checagem "pareceOrbe" logo abaixo
// resincronizaria a âncora a partir da posição de fábrica da janela (o
// canto fixo do tauri.conf.json) na primeiríssima chamada de cada
// lançamento do app, descartando a âncora salva antes dela valer uma vez.
let primeiraConsulta = true;

function definirAncora(ancora: { x: number; y: number }): void {
  ancoraCache = ancora;
  try {
    localStorage.setItem(CHAVE_ANCORA, JSON.stringify(ancora));
  } catch {
    /* localStorage indisponível — âncora só dura a sessão atual, aceitável */
  }
}

async function obterAncora(win: InstanceType<typeof import("@tauri-apps/api/window").Window>, scale: number): Promise<{ x: number; y: number }> {
  const pos = (await win.outerPosition()).toLogical(scale);
  const size = (await win.outerSize()).toLogical(scale);
  const pareceOrbe = Math.abs(size.width - TAMANHOS.orb.width) < 1 && Math.abs(size.height - TAMANHOS.orb.height) < 1;
  const usaAncoraSalva = primeiraConsulta && ancoraCache != null;
  primeiraConsulta = false;
  if (!usaAncoraSalva && (pareceOrbe || !ancoraCache)) {
    definirAncora({ x: pos.x + size.width, y: pos.y + size.height });
  }
  return ancoraCache!;
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
    definirAncora({ x: x + target.width, y: y + target.height });
  } catch {
    /* ignora — Jarvis ainda funciona, só não redimensiona a janela */
  }
}
