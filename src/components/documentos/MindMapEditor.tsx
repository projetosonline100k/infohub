import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  newElementWith,
  restore,
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
  CaptureUpdateAction,
  ROUNDNESS,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawArrowElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { ArrowLeft, ChevronDown, Eye, EyeOff, PenLine, Square, Waypoints, Maximize2, Minimize2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useCanvasAutoSave, canvasBackupKey } from "@/hooks/useCanvasAutoSave";
import { usePersistentHistory } from "@/hooks/usePersistentHistory";
import { mergeCanvas } from "@/lib/canvasPersistence";
import { toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { useMapaMentalColaboracao } from "@/hooks/useMapaMentalColaboracao";
import { PresencaAvatares } from "./PresencaAvatares";
import { MindMapKanbanCard, type MindMapKanbanAtividade } from "./MindMapKanbanCard";
import { MindMapKanbanPicker, type MindMapKanbanPickerItem } from "./MindMapKanbanPicker";
import { AtividadeDetailPanel } from "@/components/atividades/AtividadeDetailPanel";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// Nível de "roughness" 1 = estilo "artist", o visual clássico do Excalidraw
// (nem liso demais tipo PowerPoint, nem rabiscado demais). Não é exportado
// pela lib como constante `ROUGHNESS`, só o valor numérico mesmo.
const HAND_DRAWN_ROUGHNESS = 1;

// Canvas de pensamento visual (estilo Excalidraw/Obsidian): a mesma coluna
// "conteudo" da tabela documentos guarda um JSON com elementos + posição da
// câmera + arquivos (imagens em base64), atrás de um prefixo — igual ao
// Caderno e ao antigo Mapa Mental (ReactFlow), que este arquivo substitui.
const CANVAS_PREFIX = "__CANVASMENTAL_V1__";

// Fundo "papel" levemente quente, independente do tema do app — a sensação
// de folha em branco é o ponto central do pedido, então todo mapa novo nasce
// assim (o usuário pode trocar pela paleta de fundo nativa do Excalidraw).
const PAPER_BACKGROUND = "#FBF9F2";

// Precisa ser um objeto estável (fora do componente) — se for um literal
// novo a cada render, o Excalidraw entende que suas opções "mudaram" a
// cada render e pode reagir de formas inesperadas.
const UI_OPTIONS = {
  canvasActions: {
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
};

// Paleta pastel usada só quando criamos um bloco-raiz (sem pai pra herdar
// cor). Blocos filhos/irmãos herdam a cor do bloco de referência, pra cada
// ramo do mapa manter uma identidade visual.
const ROOT_COLORS = [
  { bg: "#FFF3B0", border: "#D4A72C" },
  { bg: "#CFE8FF", border: "#4E8FD6" },
  { bg: "#D9F2D2", border: "#5FA85A" },
  { bg: "#FBDDEA", border: "#D6689B" },
  { bg: "#E6DBFB", border: "#9B7FD1" },
  { bg: "#FFE1C7", border: "#D98A45" },
];

// Painel de cor/fonte compacto — substitui o painel nativo do Excalidraw
// (que fica preso na lateral e ocupa bastante espaço); esse aqui só aparece
// quando a pessoa clica no ícone de caneta lá embaixo.
const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const BACKGROUND_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];
const FONT_SIZES: { size: number; label: string }[] = [
  { size: 16, label: "S" },
  { size: 20, label: "M" },
  { size: 28, label: "L" },
  { size: 36, label: "XL" },
];

interface CanvasMentalDoc {
  kind: "canvas_mental";
  version: 1;
  elements: readonly ExcalidrawElement[];
  appState: Partial<Pick<AppState, "scrollX" | "scrollY" | "zoom" | "viewBackgroundColor">>;
  files: BinaryFiles;
}

interface MindMapCustomData {
  mindMap?: {
    parentId?: string | null;
    hidden?: boolean;
  };
  kanban?: {
    atividadeId: string;
  };
}

// Colunas padrão do quadro Kanban (ver AtividadesView.tsx) — reaproveitadas
// aqui só pra garantir que um cliente que nunca abriu o quadro, mas já
// coloca cards na lousa, tenha colunas "Concluído"/"A fazer" válidas pra
// marcar/desmarcar uma tarefa.
const COLUNAS_PADRAO = [
  { nome: "Backlog", status_key: "backlog", eh_conclusao: false },
  { nome: "Em Execução", status_key: "em_progresso", eh_conclusao: false },
  { nome: "Revisão", status_key: "revisao", eh_conclusao: false },
  { nome: "Finalizado", status_key: "finalizado", eh_conclusao: true },
];

interface ColunaAtividade {
  nome: string;
  status_key: string;
  eh_conclusao: boolean;
  ordem: number;
}

export function isMindMapContent(content?: string | null) {
  return Boolean(content?.startsWith(CANVAS_PREFIX));
}

export function createEmptyMindMapContent() {
  const doc: CanvasMentalDoc = {
    kind: "canvas_mental",
    version: 1,
    elements: [],
    appState: { viewBackgroundColor: PAPER_BACKGROUND },
    files: {},
  };
  return `${CANVAS_PREFIX}${JSON.stringify(doc)}`;
}

function parseCanvasDoc(content?: string | null): CanvasMentalDoc {
  const empty: CanvasMentalDoc = {
    kind: "canvas_mental",
    version: 1,
    elements: [],
    appState: { viewBackgroundColor: PAPER_BACKGROUND },
    files: {},
  };
  if (!content?.startsWith(CANVAS_PREFIX)) return empty;
  try {
    const parsed = JSON.parse(content.slice(CANVAS_PREFIX.length)) as CanvasMentalDoc;
    return {
      kind: "canvas_mental",
      version: 1,
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: parsed.appState || { viewBackgroundColor: PAPER_BACKGROUND },
      files: parsed.files || {},
    };
  } catch {
    return empty;
  }
}

function serializeCanvasDoc(elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) {
  // Conexões ocultas às vezes ficam com opacidade > 0 na tela por um instante
  // (a revelação temporária ao selecionar um bloco, ver handleChange) — mas
  // isso nunca pode ir pro banco: o que é salvo sempre normaliza pra 0, senão
  // um autosave no meio dessa revelação "vazaria" a linha permanentemente.
  const normalizedElements = elements.map((el) =>
    isHiddenConnection(el) && el.opacity !== 0 ? newElementWith(el, { opacity: 0 }) : el
  );
  const doc: CanvasMentalDoc = {
    kind: "canvas_mental",
    version: 1,
    elements: normalizedElements,
    appState: {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      viewBackgroundColor: appState.viewBackgroundColor,
    },
    files,
  };
  return `${CANVAS_PREFIX}${JSON.stringify(doc)}`;
}

function getMindMapData(el: ExcalidrawElement): MindMapCustomData["mindMap"] {
  return (el.customData as MindMapCustomData | undefined)?.mindMap;
}

function getParentId(el: ExcalidrawElement): string | null {
  return getMindMapData(el)?.parentId ?? null;
}

function getKanbanId(el: ExcalidrawElement): string | null {
  return (el.customData as MindMapCustomData | undefined)?.kanban?.atividadeId ?? null;
}

function isHiddenConnection(el: ExcalidrawElement): boolean {
  return Boolean(getMindMapData(el)?.hidden);
}

// "Nó de mapa mental" = qualquer forma com metadado mindMap (criada via
// Tab/Enter, arraste de conexão, ou marcada manualmente como "Retângulo
// nó"). Um retângulo comum, desenhado à mão sem essa marcação, não entra
// nesse comportamento — serve só como forma/desenho (item 17 do pedido).
function isConnectableBlock(el: ExcalidrawElement): boolean {
  if (el.type === "arrow" || el.type === "text" || el.type === "freedraw" || el.type === "image") return false;
  return Boolean(getMindMapData(el));
}

type ConnectionSide = "top" | "right" | "bottom" | "left";

function pointForSide(rect: { x: number; y: number; width: number; height: number }, side: ConnectionSide) {
  switch (side) {
    case "top": return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom": return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left": return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right": return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

// Escolhe os lados de saída/entrada com base na posição relativa entre os
// dois blocos — puxou pra baixo, entra por cima; puxou pro lado, entra pela
// lateral (item 8 do pedido).
function bestSides(source: { x: number; y: number; width: number; height: number }, target: { x: number; y: number; width: number; height: number }): { sourceSide: ConnectionSide; targetSide: ConnectionSide } {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? { sourceSide: "right", targetSide: "left" } : { sourceSide: "left", targetSide: "right" };
  }
  return dy >= 0 ? { sourceSide: "bottom", targetSide: "top" } : { sourceSide: "top", targetSide: "bottom" };
}

function makeBlockSkeleton(params: {
  id: string;
  x: number;
  y: number;
  backgroundColor: string;
  strokeColor: string;
  parentId: string | null;
}): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id: params.id,
    x: params.x,
    y: params.y,
    width: 180,
    height: 64,
    backgroundColor: params.backgroundColor,
    strokeColor: params.strokeColor,
    fillStyle: "solid",
    roughness: HAND_DRAWN_ROUGHNESS,
    roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    // Um espaço, não uma string vazia: convertToExcalidrawElements só liga o
    // texto ao bloco se `label.text` for truthy — "" faria o bloco nascer
    // sem nenhum texto vinculável. O espaço fica pré-selecionado ao entrar
    // no modo de edição, então a primeira tecla digitada já o substitui.
    label: { text: " ", fontSize: 20 },
    customData: { mindMap: { parentId: params.parentId } },
  } as ExcalidrawElementSkeleton;
}

// A conveniência start/end-por-id do convertToExcalidrawElements só
// consegue ligar a elementos que estejam no MESMO lote da conversão — como
// aqui o bloco de origem já existe de uma chamada anterior, ela nunca o
// encontra e a seta nasce solta, sem bind nenhum (x:0,y:0, sem visual). Por
// isso montamos a geometria e o startBinding/endBinding manualmente, com a
// mesma forma exata que uma seta desenhada e conectada à mão pelo usuário
// (conferido: {elementId, focus: 0, gap: 1}, sem fixedPoint).
function buildBoundArrow(id: string, source: ExcalidrawElement, target: ExcalidrawElement): ExcalidrawElement {
  const { sourceSide, targetSide } = bestSides(source, target);
  const startPoint = pointForSide(source, sourceSide);
  const endPoint = pointForSide(target, targetSide);
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;

  const [rawArrow] = convertToExcalidrawElements(
    [
      {
        type: "arrow",
        id,
        x: startPoint.x,
        y: startPoint.y,
        points: [
          [0, 0],
          [dx, dy],
        ],
        width: Math.abs(dx),
        height: Math.abs(dy),
        strokeColor: "#9AA5B1",
        roughness: HAND_DRAWN_ROUGHNESS,
        roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
        startArrowhead: null,
        endArrowhead: null,
        customData: { mindMap: { hidden: false } },
      } as ExcalidrawElementSkeleton,
    ],
    { regenerateIds: false }
  );

  return newElementWith(rawArrow as ExcalidrawArrowElement, {
    startBinding: { elementId: source.id, focus: 0, gap: 1 } as ExcalidrawArrowElement["startBinding"],
    endBinding: { elementId: target.id, focus: 0, gap: 1 } as ExcalidrawArrowElement["endBinding"],
  });
}

function withBoundArrow(el: ExcalidrawElement, arrowId: string): ExcalidrawElement {
  return newElementWith(el, {
    boundElements: [...(el.boundElements || []), { id: arrowId, type: "arrow" }],
  });
}

interface MindMapEditorProps {
  documentoId: string;
  onClose: () => void;
  embedded?: boolean;
  // Só quando informado a lousa mostra o menu "Trocar de lousa" no topo —
  // quem chama decide pra onde ir (e precisa trocar a `key` do componente,
  // pra remontar do zero em vez de tentar trocar a cena por baixo do pano:
  // o Excalidraw e a colaboração em tempo real têm estado demais amarrado
  // ao documentoId atual pra fazer essa troca com segurança "ao vivo").
  onTrocarDocumento?: (id: string) => void;
  // Chamado sempre que um card do Kanban preso no mapa muda (criar, marcar/
  // desmarcar, editar, excluir) — quem chama (LousaAtividades, dentro da
  // mesma página do Kanban) usa isso pra recarregar o quadro na hora, sem
  // precisar trocar de aba ou dar F5 pra ver a mudança refletida.
  onAtividadesAlteradas?: () => void;
}

export function MindMapEditor({ documentoId, onClose, embedded = false, onTrocarDocumento, onAtividadesAlteradas }: MindMapEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [titulo, setTitulo] = useState("Mapa mental sem título");
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [selectedArrowHidden, setSelectedArrowHidden] = useState<{ id: string; hidden: boolean } | null>(null);
  const [hasAnyHiddenConnection, setHasAnyHiddenConnection] = useState(false);
  const [hiddenBadge, setHiddenBadge] = useState<{ x: number; y: number; count: number } | null>(null);
  const [penPanelOpen, setPenPanelOpen] = useState(false);
  // undefined = ainda não sabemos (carregando o documento); null = documento
  // sem cliente. Só busca as outras lousas depois que isso vira um valor
  // conhecido, senão a primeira busca sairia sem filtro nenhum.
  const [clienteIdDoDoc, setClienteIdDoDoc] = useState<string | null | undefined>(undefined);
  // Mesma pasta_id do documento (documentos e atividades compartilham a
  // tabela pastas_atividade) — usada pra criar/listar cards do Kanban na
  // mesma pasta que o quadro normal filtra, senão o card fica "invisível"
  // lá (o Kanban de uma pasta só mostra atividades com esse pasta_id).
  const [pastaIdDoDoc, setPastaIdDoDoc] = useState<string | null | undefined>(undefined);
  const [outrasLousas, setOutrasLousas] = useState<{ id: string; titulo: string }[]>([]);

  // Retângulo conectável (nó) — variação da ferramenta 2, escolhida por
  // long-press, que persiste enquanto a pessoa não trocar de novo.
  const [rectangleVariant, setRectangleVariant] = useState<"plain" | "node">("plain");
  const rectangleVariantRef = useRef<"plain" | "node">("plain");
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const [variantMenuPos, setVariantMenuPos] = useState({ x: 0, y: 0 });

  // Pontinhos de conexão + arraste pra criar/ligar nós.
  const [activeNodeBoxes, setActiveNodeBoxes] = useState<{ id: string; left: number; top: number; width: number; height: number }[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<{ sourceId: string; startScene: { x: number; y: number }; currentScene: { x: number; y: number }; hoveredTargetId: string | null } | null>(null);
  const connectionDragRef = useRef<typeof connectionDrag>(null);
  const elementsRef = useRef<readonly ExcalidrawElement[] | null>(null);
  const appStateRef = useRef<AppState | null>(null);
  const knownElementIdsRef = useRef<Set<string> | null>(null);

  // Cards do Kanban colados no mapa: cada um é um retângulo invisível
  // (customData.kanban) com um card React de verdade desenhado por cima na
  // posição/tamanho dele (ver MindMapKanbanCard e recomputeKanbanBoxes).
  const [kanbanBoxes, setKanbanBoxes] = useState<{ elementId: string; atividadeId: string; left: number; top: number; width: number; height: number; zoom: number; selected: boolean }[]>([]);
  const [atividadesPorId, setAtividadesPorId] = useState<Record<string, MindMapKanbanAtividade | null>>({});
  const knownAtividadeIdsRef = useRef<Set<string>>(new Set());
  const [colunas, setColunas] = useState<ColunaAtividade[]>([]);
  const colunasPromiseRef = useRef<Promise<ColunaAtividade[]> | null>(null);
  const [atividadesDoCliente, setAtividadesDoCliente] = useState<MindMapKanbanPickerItem[]>([]);
  const [detailAtividadeId, setDetailAtividadeId] = useState<string | null>(null);
  const novosCardsCountRef = useRef(0);

  const { theme } = useTheme();
  const { saving, lastSaved, error: saveError, debouncedSave, saveNow } = useCanvasAutoSave(documentoId);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const previousContentRef = useRef<string | null>(null);
  // Histórico que sobrevive a sair do mapa e voltar (localStorage). O
  // Excalidraw já desfaz sozinho dentro da sessão atual (Ctrl+Z nativo), mas
  // não expõe uma forma de saber se essa pilha nativa ainda tem algo — por
  // isso o critério aqui é "ainda não fiz nenhuma mudança de verdade nesta
  // sessão": nesse caso a pilha nativa está garantidamente vazia (a
  // instância acabou de montar) e é seguro usar o histórico persistido no
  // lugar dela.
  // Limite menor que o padrão: cada snapshot é a cena inteira (elementos +
  // arquivos/imagens em base64), não só a diferença de um pra outro.
  const historico = usePersistentHistory<string>(documentoId ? `mapa:${documentoId}` : null, 15);
  const jaRegistrouSessaoRef = useRef(false);
  const loadingRef = useRef(true);
  const isReadyRef = useRef(false);
  const pendingChainRef = useRef<{ blockId: string } | null>(null);
  const prevEditingIdRef = useRef<string | null>(null);
  const revealedArrowIdsRef = useRef<Set<string>>(new Set());

  // Sincroniza elemento a elemento com quem mais está no mapa agora (em vez
  // de cada aba salvar o documento inteiro por cima da outra, que era
  // exatamente o bug de perder o que a outra pessoa escreveu) e mostra os
  // cursores ao vivo — usa o próprio motor de multiplayer do Excalidraw.
  const { pessoasOnline, broadcastElements, broadcastCursor, applyingRemoteRef } = useMapaMentalColaboracao({
    documentoId,
    excalidrawApiRef,
    isReadyRef,
  });

  // Único ponto que dispara o Enter sintético que abre edição — ver
  // comentário mais abaixo. Precisa ser no elemento com foco de verdade (o
  // container do Excalidraw); despachado direto em `document` ele é ignorado.
  const dispatchSyntheticEnter = useCallback(() => {
    requestAnimationFrame(() => {
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      (event as unknown as { __mmSynthetic: boolean }).__mmSynthetic = true;
      (document.activeElement || document).dispatchEvent(event);
    });
  }, []);

  // Cria um bloco conectado ao bloco de referência: "child" pendura um filho
  // dele (Tab); "sibling" pendura um irmão no mesmo pai (Enter). O novo bloco
  // já nasce com o cursor piscando dentro, pronto pra digitar na hora.
  const createConnectedBlock = useCallback((referenceId: string, mode: "child" | "sibling") => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const elements = api.getSceneElements();
    const reference = elements.find((e) => e.id === referenceId);
    if (!reference) return;

    const parentId = mode === "child" ? reference.id : getParentId(reference);
    const parentEl = parentId ? elements.find((e) => e.id === parentId) : null;
    const rootCount = elements.filter((e) => isConnectableBlock(e) && !getParentId(e)).length;

    const siblingsOfNew = elements.filter((e) => getParentId(e) === (mode === "child" ? reference.id : parentId));
    const newId = crypto.randomUUID();
    const x = mode === "child" ? reference.x + reference.width + 140 : reference.x;
    const y = mode === "child" ? reference.y + siblingsOfNew.length * 96 : reference.y + reference.height + 40;

    const palette = ROOT_COLORS[rootCount % ROOT_COLORS.length];
    const backgroundColor = parentEl?.backgroundColor ?? (parentId ? reference.backgroundColor : palette.bg);
    const strokeColor = parentEl?.strokeColor ?? (parentId ? reference.strokeColor : palette.border);

    const skeleton = makeBlockSkeleton({
      id: newId,
      x,
      y,
      backgroundColor,
      strokeColor,
      parentId: mode === "child" ? reference.id : parentId,
    });
    // regenerateIds: false — sem isso a lib troca os ids por outros
    // aleatórios e a busca pelo container/texto abaixo nunca encontra nada.
    const built = convertToExcalidrawElements([skeleton], { regenerateIds: false });
    const container = built.find((e) => e.id === newId);
    const textEl = built.find((e) => e.type === "text" && (e as { containerId?: string }).containerId === newId);
    if (!container || !textEl) return;

    let nextElements = [...elements, ...built];

    // connectFromId é sempre igual a parentId (no modo "child" o próprio
    // bloco de referência é o novo pai; no "sibling" é o pai que ele herda).
    if (parentEl) {
      const arrowId = crypto.randomUUID();
      const arrowEl = buildBoundArrow(arrowId, parentEl, container);
      nextElements = nextElements.map((e) => {
        if (e.id === parentEl.id) return withBoundArrow(e, arrowId);
        if (e.id === container.id) return withBoundArrow(e, arrowId);
        return e;
      });
      nextElements = [...nextElements, arrowEl];
    }

    api.updateScene({
      elements: nextElements,
      appState: { selectedElementIds: { [newId]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    // Não existe um "entrar em edição" na API pública do Excalidraw — quem
    // monta de fato o textarea é um método interno privado, acionado pelo
    // atalho nativo "Enter com a forma selecionada". Então simulamos esse
    // Enter (marcado, pra não ser reinterpretado pelo nosso próprio
    // listener) depois que a seleção acima já foi aplicada no próximo frame.
    dispatchSyntheticEnter();
  }, [dispatchSyntheticEnter]);

  // Recalcula, em coordenadas de tela, as caixas dos nós que devem mostrar
  // os pontinhos de conexão agora (selecionados ou com o mouse por perto).
  const recomputeActiveNodeBoxes = useCallback(() => {
    const elements = elementsRef.current;
    const appState = appStateRef.current;
    if (!elements || !appState) return;
    const selectedIds = new Set(Object.keys(appState.selectedElementIds || {}));
    const activeIds = new Set<string>();
    elements.forEach((e) => {
      if (e.isDeleted || !isConnectableBlock(e)) return;
      if (selectedIds.has(e.id) || e.id === hoveredNodeIdRef.current) activeIds.add(e.id);
    });
    const boxes = elements
      .filter((e) => activeIds.has(e.id))
      .map((e) => {
        const topLeft = sceneCoordsToViewportCoords({ sceneX: e.x, sceneY: e.y }, appState);
        const bottomRight = sceneCoordsToViewportCoords({ sceneX: e.x + e.width, sceneY: e.y + e.height }, appState);
        return {
          id: e.id,
          left: topLeft.x - appState.offsetLeft,
          top: topLeft.y - appState.offsetTop,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        };
      });
    setActiveNodeBoxes(boxes);
  }, []);

  // Busca em lote as atividades ainda não conhecidas (ver knownAtividadeIdsRef
  // em recomputeKanbanBoxes) e guarda no cache — `null` marca "já busquei e
  // não existe mais" (foi excluída em outro lugar), pra distinguir de "ainda
  // carregando" (chave ausente do objeto).
  const fetchAtividadesKanban = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data, error } = await supabase.from("atividades").select("*").in("id", ids).is("deleted_at", null);
    if (error) return;
    const encontradas = new Set((data || []).map((a) => a.id));
    setAtividadesPorId((prev) => {
      const next = { ...prev };
      (data || []).forEach((a) => { next[a.id] = a; });
      ids.forEach((id) => { if (!encontradas.has(id)) next[id] = null; });
      return next;
    });
  }, []);

  // Garante que as colunas do quadro Kanban deste cliente existem (cria as
  // padrão se for a primeira vez que alguém usa um card aqui sem nunca ter
  // aberto o quadro) — mesma lógica de carregarColunas em AtividadesView.
  const garantirColunas = useCallback((): Promise<ColunaAtividade[]> => {
    if (colunas.length > 0) return Promise.resolve(colunas);
    if (colunasPromiseRef.current) return colunasPromiseRef.current;
    if (clienteIdDoDoc === undefined) return Promise.resolve([]);

    const promise = (async () => {
      let query = supabase.from("colunas_atividade").select("nome, status_key, eh_conclusao, ordem").order("ordem", { ascending: true });
      query = clienteIdDoDoc ? query.eq("cliente_id", clienteIdDoDoc) : query.is("cliente_id", null);
      const { data, error } = await query;
      if (error) { colunasPromiseRef.current = null; return []; }
      if (data && data.length > 0) { setColunas(data); return data; }

      const { data: inseridas, error: erroInsert } = await supabase
        .from("colunas_atividade")
        .insert(COLUNAS_PADRAO.map((c, i) => ({ ...c, cliente_id: clienteIdDoDoc || null, ordem: i })))
        .select("nome, status_key, eh_conclusao, ordem");
      if (erroInsert) { colunasPromiseRef.current = null; return []; }
      const resultado = (inseridas || []).sort((a, b) => a.ordem - b.ordem);
      setColunas(resultado);
      return resultado;
    })();
    colunasPromiseRef.current = promise;
    return promise;
  }, [colunas, clienteIdDoDoc]);

  // Recalcula, em coordenadas de tela, a caixa de todo card do Kanban preso
  // no mapa (não só selecionado/hover, ao contrário dos pontinhos de conexão
  // — o card precisa aparecer sempre) e dispara a busca dos que ainda não
  // estão no cache.
  const recomputeKanbanBoxes = useCallback(() => {
    const elements = elementsRef.current;
    const appState = appStateRef.current;
    if (!elements || !appState) return;

    const boxes: typeof kanbanBoxes = [];
    const aBuscar: string[] = [];
    const selectedIds = appState.selectedElementIds || {};
    elements.forEach((e) => {
      if (e.isDeleted) return;
      const atividadeId = getKanbanId(e);
      if (!atividadeId) return;
      if (!knownAtividadeIdsRef.current.has(atividadeId)) {
        knownAtividadeIdsRef.current.add(atividadeId);
        aBuscar.push(atividadeId);
      }
      // Posição em coordenadas de tela (essa sim precisa do zoom), mas
      // tamanho nas unidades "de cena" (largura/altura reais do elemento,
      // que não mudam com o zoom) — o card escala inteiro via CSS
      // transform (ver MindMapKanbanCard), em vez de esticar/comprimir
      // width/height já multiplicados pelo zoom, que distorcia o conteúdo
      // interno (fontes/ícones de tamanho fixo) em zooms diferentes de 100%.
      const topLeft = sceneCoordsToViewportCoords({ sceneX: e.x, sceneY: e.y }, appState);
      boxes.push({
        elementId: e.id,
        atividadeId,
        left: topLeft.x - appState.offsetLeft,
        top: topLeft.y - appState.offsetTop,
        width: e.width,
        height: e.height,
        zoom: appState.zoom.value,
        selected: Boolean(selectedIds[e.id]),
      });
    });
    setKanbanBoxes(boxes);
    if (boxes.length > 0) void garantirColunas();
    if (aBuscar.length > 0) void fetchAtividadesKanban(aBuscar);
  }, [fetchAtividadesKanban, garantirColunas]);

  // Insere no mapa um retângulo invisível vinculado a uma atividade (o card
  // React de cima é desenhado por recomputeKanbanBoxes/render). Nasce no
  // centro da área visível, com um pequeno deslocamento em cascata se vários
  // forem adicionados em sequência.
  const inserirCardNoMapa = useCallback((atividadeId: string) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? viewportCoordsToSceneCoords({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, appState)
      : { x: 200, y: 200 };

    const width = 240;
    const height = 128;
    const deslocamento = novosCardsCountRef.current * 24;
    novosCardsCountRef.current += 1;
    const id = crypto.randomUUID();

    const [element] = convertToExcalidrawElements(
      [
        {
          type: "rectangle",
          id,
          x: center.x - width / 2 + deslocamento,
          y: center.y - height / 2 + deslocamento,
          width,
          height,
          // backgroundColor precisa ser uma cor "de verdade" (não
          // "transparent") pra o Excalidraw considerar o interior do
          // retângulo clicável/arrastável — com fundo transparente ele só
          // reconhece cliques bem em cima da borda (ver shouldTestInside no
          // motor de colisão). opacity:0 é o que de fato deixa invisível,
          // sem perder esse comportamento de clique.
          strokeColor: "transparent",
          backgroundColor: "#000000",
          fillStyle: "solid",
          opacity: 0,
          roughness: 0,
          customData: { kanban: { atividadeId } },
        } as ExcalidrawElementSkeleton,
      ],
      { regenerateIds: false }
    );

    const elements = api.getSceneElements();
    api.updateScene({
      elements: [...elements, element],
      appState: { selectedElementIds: { [id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, []);

  // Cria uma atividade nova (status = primeira coluna) e já a prende no
  // mapa, abrindo o painel de detalhes na hora pra dar nome/configurar.
  const criarNovoCard = useCallback(async () => {
    if (clienteIdDoDoc === undefined) return;
    const cols = await garantirColunas();
    const primeira = cols[0];
    const { data, error } = await supabase
      .from("atividades")
      .insert({
        titulo: "Nova tarefa",
        cliente_id: clienteIdDoDoc,
        pasta_id: pastaIdDoDoc ?? null,
        status: primeira?.status_key || "backlog",
        concluida: !!primeira?.eh_conclusao,
        data_atividade: format(new Date(), "yyyy-MM-dd"),
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar a tarefa");
      return;
    }
    knownAtividadeIdsRef.current.add(data.id);
    setAtividadesPorId((prev) => ({ ...prev, [data.id]: data }));
    setAtividadesDoCliente((prev) => [{ id: data.id, titulo: data.titulo, concluida: data.concluida }, ...prev]);
    inserirCardNoMapa(data.id);
    setDetailAtividadeId(data.id);
    onAtividadesAlteradas?.();
  }, [clienteIdDoDoc, pastaIdDoDoc, garantirColunas, inserirCardNoMapa, onAtividadesAlteradas]);

  // Marca/desmarca concluída direto no card — mesma lógica de toggleAtividade
  // em AtividadesView (o status muda junto, pra continuar valendo no Kanban
  // normal).
  const toggleCardConcluida = useCallback(async (atividade: MindMapKanbanAtividade) => {
    const cols = await garantirColunas();
    const concluida = !atividade.concluida;
    const colunaConclusao = cols.find((c) => c.eh_conclusao);
    const colunaReabertura = cols.find((c) => !c.eh_conclusao) || cols[0];
    const novoStatus = concluida ? colunaConclusao?.status_key || "finalizado" : colunaReabertura?.status_key || "backlog";

    setAtividadesPorId((prev) => ({ ...prev, [atividade.id]: { ...atividade, concluida, status: novoStatus } }));
    const { error } = await supabase.from("atividades").update({ concluida, status: novoStatus }).eq("id", atividade.id);
    if (error) {
      toast.error("Não foi possível atualizar a tarefa");
      setAtividadesPorId((prev) => ({ ...prev, [atividade.id]: atividade }));
      return;
    }
    onAtividadesAlteradas?.();
  }, [garantirColunas, onAtividadesAlteradas]);

  // Tira só o card do mapa (o retângulo vira isDeleted, igual apagar
  // qualquer outro elemento) — a atividade continua existindo no Kanban.
  const removerCardDoMapa = useCallback((elementId: string) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const updated = elements.map((e) => (e.id === elementId ? newElementWith(e, { isDeleted: true }) : e));
    api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, []);

  // Depois de editar no painel de detalhes, refaz o fetch dessa atividade
  // pra refletir no card (o painel não devolve o registro atualizado, só
  // avisa que salvou).
  const handleDetalheAtualizado = useCallback(async (atividadeId: string) => {
    const { data, error } = await supabase.from("atividades").select("*").eq("id", atividadeId).maybeSingle();
    if (error) return;
    setAtividadesPorId((prev) => ({ ...prev, [atividadeId]: data ?? null }));
    onAtividadesAlteradas?.();
  }, [onAtividadesAlteradas]);

  // Exclusão pelo painel de detalhes apaga a atividade de vez (igual
  // excluirAtividade em AtividadesView) e também remove qualquer card no
  // mapa que apontava pra ela.
  const handleDetalheExcluido = useCallback(async (atividadeId: string) => {
    const { error } = await supabase.from("atividades").delete().eq("id", atividadeId);
    if (error) {
      toast.error("Não foi possível excluir a tarefa");
      return;
    }
    setAtividadesPorId((prev) => ({ ...prev, [atividadeId]: null }));
    setAtividadesDoCliente((prev) => prev.filter((a) => a.id !== atividadeId));
    setDetailAtividadeId(null);
    const api = excalidrawApiRef.current;
    const alvos = api ? kanbanBoxes.filter((b) => b.atividadeId === atividadeId).map((b) => b.elementId) : [];
    if (api && alvos.length > 0) {
      const elements = api.getSceneElementsIncludingDeleted();
      const updated = elements.map((e) => (alvos.includes(e.id) ? newElementWith(e, { isDeleted: true }) : e));
      api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    }
    toast.success("Atividade excluída");
    onAtividadesAlteradas?.();
  }, [kanbanBoxes, onAtividadesAlteradas]);

  const escolherVariante = useCallback((variante: "plain" | "node") => {
    rectangleVariantRef.current = variante;
    setRectangleVariant(variante);
    setVariantMenuOpen(false);
  }, []);

  // Começa a puxar uma conexão a partir de um pontinho do nó.
  const startConnectionDrag = useCallback((sourceId: string, side: ConnectionSide) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const source = api.getSceneElements().find((e) => e.id === sourceId);
    if (!source) return;
    const startPoint = pointForSide(source, side);
    const drag = { sourceId, startScene: startPoint, currentScene: startPoint, hoveredTargetId: null as string | null };
    connectionDragRef.current = drag;
    setConnectionDrag(drag);
  }, []);

  const updateConnectionDrag = useCallback((sceneX: number, sceneY: number) => {
    const drag = connectionDragRef.current;
    if (!drag) return;
    const elements = elementsRef.current || [];
    let hoveredTargetId: string | null = null;
    for (const e of elements) {
      if (e.isDeleted || e.id === drag.sourceId || !isConnectableBlock(e)) continue;
      if (sceneX >= e.x && sceneX <= e.x + e.width && sceneY >= e.y && sceneY <= e.y + e.height) {
        hoveredTargetId = e.id;
        break;
      }
    }
    const next = { ...drag, currentScene: { x: sceneX, y: sceneY }, hoveredTargetId };
    connectionDragRef.current = next;
    setConnectionDrag(next);
  }, []);

  const cancelConnectionDrag = useCallback(() => {
    connectionDragRef.current = null;
    setConnectionDrag(null);
  }, []);

  // Solta a conexão: em cima de outro nó, só liga os dois; em área vazia,
  // cria um bloco novo ali (já conectado, herdando o estilo do pai, e
  // entrando direto em edição) — o coração do pedido.
  const finishConnectionDrag = useCallback(() => {
    const drag = connectionDragRef.current;
    connectionDragRef.current = null;
    setConnectionDrag(null);
    if (!drag) return;

    const api = excalidrawApiRef.current;
    if (!api) return;

    const dist = Math.hypot(drag.currentScene.x - drag.startScene.x, drag.currentScene.y - drag.startScene.y);
    if (dist < 12) return; // soltou quase no mesmo lugar — cancela.

    const elements = api.getSceneElements();
    const source = elements.find((e) => e.id === drag.sourceId);
    if (!source) return;

    if (drag.hoveredTargetId) {
      const target = elements.find((e) => e.id === drag.hoveredTargetId);
      if (!target || target.id === source.id) return;
      const jaConectados = elements.some(
        (e) =>
          e.type === "arrow" &&
          !e.isDeleted &&
          ((e.startBinding?.elementId === source.id && e.endBinding?.elementId === target.id) ||
            (e.startBinding?.elementId === target.id && e.endBinding?.elementId === source.id))
      );
      if (jaConectados) return;
      const arrowId = crypto.randomUUID();
      const arrowEl = buildBoundArrow(arrowId, source, target);
      const updated = elements.map((e) => (e.id === source.id || e.id === target.id ? withBoundArrow(e, arrowId) : e));
      api.updateScene({ elements: [...updated, arrowEl], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return;
    }

    // Área vazia: novo nó com um respiro entre o ponto largado e o bloco
    // (item 9) — não deixa a ponta da seta entrando em cima do texto.
    const newWidth = 180;
    const newHeight = 64;
    const gap = 30;
    const dx = drag.currentScene.x - drag.startScene.x;
    const dy = drag.currentScene.y - drag.startScene.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const x = drag.currentScene.x - newWidth / 2 + (horizontal ? (dx > 0 ? gap : -gap) : 0);
    const y = drag.currentScene.y - newHeight / 2 + (!horizontal ? (dy > 0 ? gap : -gap) : 0);

    const newId = crypto.randomUUID();
    const skeleton = makeBlockSkeleton({
      id: newId,
      x,
      y,
      backgroundColor: source.backgroundColor,
      strokeColor: source.strokeColor,
      parentId: source.id,
    });
    const built = convertToExcalidrawElements([skeleton], { regenerateIds: false });
    const container = built.find((e) => e.id === newId);
    const textEl = built.find((e) => e.type === "text" && (e as { containerId?: string }).containerId === newId);
    if (!container || !textEl) return;

    const arrowId = crypto.randomUUID();
    const arrowEl = buildBoundArrow(arrowId, source, container);
    const updatedSource = elements.map((e) => (e.id === source.id ? withBoundArrow(e, arrowId) : e));

    api.updateScene({
      elements: [...updatedSource, ...built, arrowEl],
      appState: { selectedElementIds: { [newId]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    dispatchSyntheticEnter();
  }, [dispatchSyntheticEnter]);

  // Tab = filho / Enter = irmão (bloco selecionado, sem editar); Enter dentro
  // da edição de um bloco confirma o texto E encadeia o próximo irmão na
  // hora ("ramificação instantânea"). Escutamos em fase de captura no
  // document (não no wrapper): depois de clicar numa forma o foco do
  // teclado costuma ficar em document.body, fora da árvore do wrapper, e um
  // listener preso ao wrapper nunca veria esses eventos. A fase de captura
  // no document ainda roda antes do atalho global (bubble) do Excalidraw.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Enter sintético disparado por createConnectedBlock pra abrir a
      // edição do bloco recém-criado (ver comentário lá) — deixa passar
      // direto pro atalho nativo do Excalidraw, sem reinterpretar aqui.
      if ((event as unknown as { __mmSynthetic?: boolean }).__mmSynthetic) return;

      if (event.key === "Escape" && connectionDragRef.current) {
        event.preventDefault();
        cancelConnectionDrag();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (embedded && (!target || !wrapperRef.current?.contains(target))) return;
      // Não interfere com o título do documento nem outros campos fora do
      // canvas — só o textarea nativo do Excalidraw é tratado como "dentro".
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        !target.classList.contains("excalidraw-wysiwyg")
      ) {
        return;
      }

      const api = excalidrawApiRef.current;
      if (!api) return;
      const appState = api.getAppState();
      const editingText = appState.editingTextElement;

      if (editingText) {
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const containerId = (editingText as unknown as { containerId?: string | null }).containerId;
          event.preventDefault();
          event.stopPropagation();
          if (containerId) {
            // Vira um bloco de mapa mental: pede pra encadear o próximo
            // irmão assim que a edição terminar de fato (via blur nativo).
            pendingChainRef.current = { blockId: containerId };
          }
          const textarea = wrapperRef.current?.querySelector<HTMLTextAreaElement>("textarea.excalidraw-wysiwyg");
          textarea?.blur();
        }
        return;
      }

      const selectedIds = Object.keys(appState.selectedElementIds || {});
      if (selectedIds.length !== 1) return;
      if (event.key !== "Tab" && event.key !== "Enter") return;

      const elements = api.getSceneElements();
      const selected = elements.find((e) => e.id === selectedIds[0]);
      if (!selected || !isConnectableBlock(selected)) return;

      // Um nó recém-desenhado à mão, ainda sem texto, deve deixar o Enter
      // seguir pro comportamento nativo ("Enter com forma selecionada" abre
      // a edição) — senão a pessoa nunca consegue escrever nele, porque a
      // gente já intercepta o Enter pra criar um irmão.
      if (event.key === "Enter") {
        const boundText = elements.find(
          (e) => e.type === "text" && (e as { containerId?: string }).containerId === selected.id
        ) as { text?: string } | undefined;
        if (!boundText?.text?.trim()) return;
      }

      event.preventDefault();
      // Sem isto, o mesmo Enter continuaria borbulhando até o atalho nativo
      // do Excalidraw ("Enter com forma selecionada" -> editar o texto),
      // que ainda leria a seleção ANTIGA (o React só aplica nosso
      // updateScene depois deste laço síncrono) e abriria edição no bloco
      // errado.
      event.stopPropagation();
      createConnectedBlock(selected.id, event.key === "Tab" ? "child" : "sibling");
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [createConnectedBlock, cancelConnectionDrag, embedded]);

  // Solta a conexão em qualquer lugar da tela, não só em cima do pontinho.
  useEffect(() => {
    if (!connectionDrag) return;
    const onUp = () => finishConnectionDrag();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [connectionDrag, finishConnectionDrag]);

  // Long-press (~2s) no botão "Retângulo" da toolbar nativa abre o menu de
  // variação (comum / nó). Clique normal continua 100% igual (item 1 do
  // pedido) — o timer só é iniciado, nunca interfere no clique em si.
  useEffect(() => {
    if (loading) return;

    let label: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const limpar = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onPointerDown = () => {
      limpar();
      timer = setTimeout(() => {
        const rect = label!.getBoundingClientRect();
        setVariantMenuPos({ x: rect.left, y: rect.bottom + 6 });
        setVariantMenuOpen(true);
      }, 2000);
    };

    const anexar = (el: Element) => {
      label = el;
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointerup", limpar);
      el.addEventListener("pointerleave", limpar);
    };

    // A toolbar do Excalidraw pode montar um instante depois do nosso
    // próprio efeito rodar — tenta de novo por um tempinho até achar o botão.
    const existente = wrapperRef.current?.querySelector('input[data-testid="toolbar-rectangle"]')?.closest("label");
    if (existente) {
      anexar(existente);
    } else {
      pollId = setInterval(() => {
        const found = wrapperRef.current?.querySelector('input[data-testid="toolbar-rectangle"]')?.closest("label");
        if (found) {
          anexar(found);
          if (pollId) clearInterval(pollId);
        }
      }, 150);
    }

    return () => {
      limpar();
      if (pollId) clearInterval(pollId);
      if (label) {
        label.removeEventListener("pointerdown", onPointerDown);
        label.removeEventListener("pointerup", limpar);
        label.removeEventListener("pointerleave", limpar);
      }
    };
  }, [loading]);

  // Selo discreto no botão da toolbar indicando que a variação "nó" está
  // ativa (item 19) — via classe CSS, sem tocar no componente da lib.
  useEffect(() => {
    if (loading) return;
    const aplicar = () => {
      const label = wrapperRef.current?.querySelector('input[data-testid="toolbar-rectangle"]')?.closest("label");
      if (label) {
        label.classList.toggle("mm-node-variant-active", rectangleVariant === "node");
        return true;
      }
      return false;
    };
    if (aplicar()) return;
    const pollId = setInterval(() => {
      if (aplicar()) clearInterval(pollId);
    }, 150);
    return () => clearInterval(pollId);
  }, [rectangleVariant, loading]);

  // Fecha o menu de variação ao clicar fora dele.
  useEffect(() => {
    if (!variantMenuOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      const el = event.target as HTMLElement;
      if (!el.closest(".mm-variant-menu")) setVariantMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside, true);
    return () => document.removeEventListener("mousedown", onClickOutside, true);
  }, [variantMenuOpen]);

  // Carrega o mapa (uma vez, ao abrir).
  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setLoading(true);
      const { data, error } = await supabase
        .from("documentos")
        .select("titulo, conteudo, cliente_id, pasta_id")
        .eq("id", documentoId)
        .maybeSingle();

      if (cancelado) return;

      if (data && !error) {
        setTitulo(data.titulo || "Mapa mental sem título");
        setClienteIdDoDoc(data.cliente_id ?? null);
        setPastaIdDoDoc(data.pasta_id ?? null);
        let content = data.conteudo;
        try {
          const backup = localStorage.getItem(canvasBackupKey(documentoId));
          if (backup) { content = mergeCanvas(backup, content); debouncedSave(content); }
        } catch { toast.error("Não foi possível recuperar a cópia local. Ela foi mantida neste navegador."); }
        const parsed = parseCanvasDoc(content);
        const restored = restore(
          {
            elements: parsed.elements as ExcalidrawElement[],
            appState: parsed.appState,
            files: parsed.files,
          },
          null,
          null
        );
        setInitialData(restored);
        setIsEmpty(restored.elements.length === 0);
        previousContentRef.current = serializeCanvasDoc(
          restored.elements,
          restored.appState as AppState,
          restored.files
        );
      }

      if (error || !data) setLoadError(true);
      jaRegistrouSessaoRef.current = false;
      loadingRef.current = false;
      isReadyRef.current = true;
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [documentoId, debouncedSave]);

  // Lista as outras lousas/mapas mentais do mesmo cliente pro menu "Trocar
  // de lousa" — só busca se quem chamou passou onTrocarDocumento (senão o
  // menu nem aparece) e só depois de saber o cliente_id deste documento.
  useEffect(() => {
    if (!onTrocarDocumento || clienteIdDoDoc === undefined) return;
    let cancelado = false;
    let query = supabase
      .from("documentos")
      .select("id, titulo")
      .like("conteudo", "\\_\\_CANVASMENTAL\\_V1\\_\\_%")
      .neq("id", documentoId)
      .order("updated_at", { ascending: false });
    query = clienteIdDoDoc ? query.eq("cliente_id", clienteIdDoDoc) : query.is("cliente_id", null);
    query.then(({ data, error }) => {
      if (cancelado || error) return;
      setOutrasLousas(data || []);
    });
    return () => {
      cancelado = true;
    };
  }, [clienteIdDoDoc, documentoId, onTrocarDocumento]);

  // Lista as atividades da mesma cliente+pasta pro seletor "Adicionar do
  // Kanban" — mesmo filtro que o quadro Kanban dessa pasta usa (ver
  // atividadesVisiveis em AtividadesView), pra só oferecer tarefas que já
  // apareceriam nesse mesmo quadro. Só leitura (ao contrário de
  // garantirColunas, não cria nada), então pode ser eager assim que o
  // cliente_id/pasta_id do documento são conhecidos.
  useEffect(() => {
    if (clienteIdDoDoc === undefined || pastaIdDoDoc === undefined) return;
    let cancelado = false;
    let query = supabase
      .from("atividades")
      .select("id, titulo, concluida")
      .is("deleted_at", null)
      .order("data_atividade", { ascending: false });
    query = clienteIdDoDoc ? query.eq("cliente_id", clienteIdDoDoc) : query.is("cliente_id", null);
    query = pastaIdDoDoc ? query.eq("pasta_id", pastaIdDoDoc) : query.is("pasta_id", null);
    query.then(({ data, error }) => {
      if (cancelado || error) return;
      setAtividadesDoCliente(data || []);
    });
    return () => {
      cancelado = true;
    };
  }, [clienteIdDoDoc, pastaIdDoDoc]);

  const salvarTitulo = useCallback(async () => {
    await supabase.from("documentos").update({ titulo }).eq("id", documentoId);
  }, [titulo, documentoId]);

  // Qualquer mudança (mover, criar, apagar, conectar, digitar, colorir)
  // reserializa a cena inteira e agenda o autosave — mesmo mecanismo do
  // Documento/Caderno. Também cuida da "ramificação instantânea" e do
  // indicador de conexões ocultas no bloco selecionado.
  const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    elementsRef.current = elements;
    appStateRef.current = appState;

    // Se essa mudança veio de uma reconciliação com dado remoto (outra
    // pessoa editando agora), não reenvia pra rede — evita eco infinito.
    // Ainda assim segue o fluxo normal (autosave etc.), já que o resultado
    // mesclado é exatamente o que precisa ser salvo.
    const vindoDeFora = applyingRemoteRef.current;
    applyingRemoteRef.current = false;
    if (!vindoDeFora && !loadingRef.current) {
      broadcastElements(elements, files);
    }

    // Retângulo desenhado à mão enquanto a variação "nó" está ativa: marca
    // como nó de mapa mental assim que aparece pela primeira vez (nunca
    // retroativo, nunca em cima de elemento vindo de outra pessoa). Espera o
    // desenho terminar (não é mais o "newElement" em andamento) antes de
    // mexer nele — mudar o array de elementos no meio do próprio gesto de
    // arrastar confunde o rastreamento interno do Excalidraw e distorce o
    // tamanho final da forma.
    if (!vindoDeFora) {
      if (knownElementIdsRef.current === null) {
        knownElementIdsRef.current = new Set(elements.map((e) => e.id));
      } else {
        const known = knownElementIdsRef.current;
        const emDesenho = appState.newElement?.id ?? null;
        const novosSemTag = elements.filter(
          (e) => e.type === "rectangle" && !e.isDeleted && !known.has(e.id) && !getMindMapData(e) && e.id !== emDesenho
        );
        if (novosSemTag.length > 0 && rectangleVariantRef.current === "node") {
          const idsParaMarcar = new Set(novosSemTag.map((e) => e.id));
          const api = excalidrawApiRef.current;
          if (api) {
            const marcados = elements.map((e) =>
              idsParaMarcar.has(e.id) ? newElementWith(e, { customData: { ...(e.customData || {}), mindMap: { parentId: null } } }) : e
            );
            api.updateScene({ elements: marcados, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
          }
          idsParaMarcar.forEach((id) => known.add(id));
        }
        elements.forEach((e) => {
          if (e.id !== emDesenho) known.add(e.id);
        });
      }
    }

    recomputeActiveNodeBoxes();
    recomputeKanbanBoxes();

    const editingId = appState.editingTextElement?.id ?? null;
    if (prevEditingIdRef.current && !editingId && pendingChainRef.current) {
      const { blockId } = pendingChainRef.current;
      pendingChainRef.current = null;
      // O bloco ainda precisa existir (não foi apagado por ficar vazio).
      if (elements.some((e) => e.id === blockId && !e.isDeleted)) {
        createConnectedBlock(blockId, "sibling");
      }
    }
    prevEditingIdRef.current = editingId;

    if (!loadingRef.current) {
      setIsEmpty(elements.filter((e) => !e.isDeleted).length === 0);
    }

    // Conexão selecionada: mostra o atalho de ocultar/mostrar no cabeçalho.
    const selectedIds = Object.keys(appState.selectedElementIds || {});
    if (selectedIds.length === 1) {
      const el = elements.find((e) => e.id === selectedIds[0] && !e.isDeleted);
      if (el?.type === "arrow") {
        setSelectedArrowHidden({ id: el.id, hidden: isHiddenConnection(el) });
      } else {
        setSelectedArrowHidden(null);
      }
    } else {
      setSelectedArrowHidden(null);
    }

    setHasAnyHiddenConnection(elements.some((e) => e.type === "arrow" && !e.isDeleted && isHiddenConnection(e)));

    // Bloco único selecionado com conexões ocultas: mostra "•N" discreto e
    // revela as linhas dele temporariamente (some de novo ao desmarcar).
    let nextBadge: { x: number; y: number; count: number } | null = null;
    const nextRevealed = new Set<string>();
    if (selectedIds.length === 1) {
      const block = elements.find((e) => e.id === selectedIds[0] && !e.isDeleted);
      if (block && isConnectableBlock(block)) {
        const hiddenArrows = elements.filter(
          (e) => e.type === "arrow" && !e.isDeleted && isHiddenConnection(e) &&
            (e.startBinding?.elementId === block.id || e.endBinding?.elementId === block.id)
        );
        if (hiddenArrows.length > 0) {
          // Coordenadas relativas ao próprio container do Excalidraw (que
          // preenche 100% do wrapper), pra posicionar o selo sem depender
          // da posição da página inteira.
          const viewportPos = sceneCoordsToViewportCoords({ sceneX: block.x + block.width, sceneY: block.y }, appState);
          nextBadge = {
            x: viewportPos.x - appState.offsetLeft,
            y: viewportPos.y - appState.offsetTop,
            count: hiddenArrows.length,
          };
          hiddenArrows.forEach((a) => nextRevealed.add(a.id));
        }
      }
    }
    setHiddenBadge(nextBadge);

    const previouslyRevealed = revealedArrowIdsRef.current;
    const revealChanged =
      previouslyRevealed.size !== nextRevealed.size ||
      [...previouslyRevealed].some((id) => !nextRevealed.has(id));
    if (revealChanged) {
      const api = excalidrawApiRef.current;
      if (api) {
        const updated = elements.map((e) => {
          if (e.type !== "arrow" || !isHiddenConnection(e)) return e;
          const shouldShow = nextRevealed.has(e.id);
          const isShown = e.opacity > 0;
          if (shouldShow === isShown) return e;
          return newElementWith(e, { opacity: shouldShow ? 35 : 0 });
        });
        revealedArrowIdsRef.current = nextRevealed;
        api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.NEVER });
        return; // o updateScene acima já dispara um novo handleChange
      }
    }
    revealedArrowIdsRef.current = nextRevealed;

    if (loadingRef.current) return;
    const content = serializeCanvasDoc(elements, appState, files);
    if (content === previousContentRef.current) return;
    // Primeira mudança de verdade feita por mim nesta sessão (não vinda de
    // outra pessoa): guarda como o mapa estava antes, pra dar pra recuperar
    // mesmo depois de sair e voltar.
    if (!vindoDeFora && !jaRegistrouSessaoRef.current && previousContentRef.current !== null) {
      historico.registrar(previousContentRef.current);
      jaRegistrouSessaoRef.current = true;
    }
    previousContentRef.current = content;
    debouncedSave(content);
  }, [createConnectedBlock, debouncedSave, broadcastElements, applyingRemoteRef, recomputeActiveNodeBoxes, recomputeKanbanBoxes, historico]);

  // Ctrl+Z / Ctrl+Shift+Z (ou Cmd no Mac) enquanto ainda não fiz nenhuma
  // mudança nesta sessão (ver comentário do "historico" lá em cima) — depois
  // da primeira mudança, o próprio Excalidraw assume o desfazer/refazer.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      if (jaRegistrouSessaoRef.current) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const api = excalidrawApiRef.current;
      if (!api) return;
      const atual = serializeCanvasDoc(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
      const proximo = event.shiftKey ? historico.refazer(atual) : historico.desfazer(atual);
      if (proximo === undefined) return;
      event.preventDefault();
      const parsed = parseCanvasDoc(proximo);
      const restored = restore(
        { elements: parsed.elements as ExcalidrawElement[], appState: parsed.appState, files: parsed.files },
        null,
        null
      );
      api.updateScene({
        elements: restored.elements as ExcalidrawElement[],
        appState: restored.appState as never,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      previousContentRef.current = proximo;
      debouncedSave(proximo);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [historico, debouncedSave]);

  const toggleSelectedConnection = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api || !selectedArrowHidden) return;
    const elements = api.getSceneElements();
    const nextHidden = !selectedArrowHidden.hidden;
    const updated = elements.map((e) => {
      if (e.id !== selectedArrowHidden.id) return e;
      return newElementWith(e, {
        opacity: nextHidden ? 0 : 100,
        customData: { ...(e.customData || {}), mindMap: { ...(getMindMapData(e) || {}), hidden: nextHidden } },
      });
    });
    api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [selectedArrowHidden]);

  const toggleAllConnections = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    // Se já existem ocultas, o botão global "revela tudo"; senão, "oculta tudo".
    const shouldHideAll = !hasAnyHiddenConnection;
    const updated = elements.map((e) => {
      if (e.type !== "arrow") return e;
      return newElementWith(e, {
        opacity: shouldHideAll ? 0 : 100,
        customData: { ...(e.customData || {}), mindMap: { ...(getMindMapData(e) || {}), hidden: shouldHideAll } },
      });
    });
    api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [hasAnyHiddenConnection]);

  // Aplica cor/tamanho de fonte: se algo estiver selecionado, muda o
  // selecionado; se não, muda o padrão do próximo elemento a ser criado —
  // igual ao painel nativo do Excalidraw, só que a partir do botão de caneta.
  const aplicarPropriedade = useCallback((patch: { strokeColor?: string; backgroundColor?: string; fontSize?: number }) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const selectedIds = new Set(Object.keys(appState.selectedElementIds || {}));

    if (selectedIds.size === 0) {
      const nextAppState: Record<string, unknown> = {};
      if (patch.strokeColor !== undefined) nextAppState.currentItemStrokeColor = patch.strokeColor;
      if (patch.backgroundColor !== undefined) nextAppState.currentItemBackgroundColor = patch.backgroundColor;
      if (patch.fontSize !== undefined) nextAppState.currentItemFontSize = patch.fontSize;
      api.updateScene({ appState: nextAppState as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return;
    }

    const elements = api.getSceneElements();
    // Tamanho de fonte só faz sentido em texto — inclui o texto vinculado
    // quando quem está selecionado é o bloco (container), não o texto em si.
    const textIdsParaFonte = new Set<string>();
    if (patch.fontSize !== undefined) {
      elements.forEach((e) => {
        if (!selectedIds.has(e.id)) return;
        if (e.type === "text") textIdsParaFonte.add(e.id);
        e.boundElements?.forEach((b) => {
          if (b.type === "text") textIdsParaFonte.add(b.id);
        });
      });
    }

    const updated = elements.map((e) => {
      let next = e;
      if (selectedIds.has(e.id)) {
        if (patch.strokeColor !== undefined) next = newElementWith(next, { strokeColor: patch.strokeColor });
        if (patch.backgroundColor !== undefined) next = newElementWith(next, { backgroundColor: patch.backgroundColor });
      }
      if (patch.fontSize !== undefined && textIdsParaFonte.has(next.id) && next.type === "text") {
        next = newElementWith(next, { fontSize: patch.fontSize });
      }
      return next;
    });
    api.updateScene({ elements: updated, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, []);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api;
  }, []);

  // Manda a posição do mouse pros outros que estiverem no mapa agora —
  // é isso que faz aparecer o cursor colorido deles se mexendo, igual Miro.
  const handlePointerUpdate = useCallback((payload: { pointer: { x: number; y: number } }) => {
    broadcastCursor(payload.pointer.x, payload.pointer.y);

    if (connectionDragRef.current) {
      updateConnectionDrag(payload.pointer.x, payload.pointer.y);
      return;
    }

    // Perto da borda de algum nó (mesmo sem selecionar) mostra os pontinhos.
    const elements = elementsRef.current;
    if (!elements) return;
    const THRESHOLD = 24;
    let found: string | null = null;
    for (const e of elements) {
      if (e.isDeleted || !isConnectableBlock(e)) continue;
      const withinX = payload.pointer.x >= e.x - THRESHOLD && payload.pointer.x <= e.x + e.width + THRESHOLD;
      const withinY = payload.pointer.y >= e.y - THRESHOLD && payload.pointer.y <= e.y + e.height + THRESHOLD;
      if (withinX && withinY) {
        found = e.id;
        break;
      }
    }
    if (found !== hoveredNodeIdRef.current) {
      hoveredNodeIdRef.current = found;
      setHoveredNodeId(found);
      recomputeActiveNodeBoxes();
    }
  }, [broadcastCursor, updateConnectionDrag, recomputeActiveNodeBoxes]);

  const handleClose = async () => {
    const api = excalidrawApiRef.current;
    if (api) {
      const saved = await saveNow(serializeCanvasDoc(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles()));
      if (!saved) return;
    }
    onClose();
  };

  const getSaveStatus = () => {
    if (saveError) return saveError;
    if (saving) return "Salvando...";
    if (lastSaved) return `Salvo ${formatDistanceToNow(lastSaved, { locale: ptBR, addSuffix: false })}`;
    return "";
  };

  if (loadError) return <div className={embedded ? "rounded-lg border p-8" : "fixed inset-0 z-50 bg-background p-8"}>
    <p>Não foi possível carregar a lousa. Nenhuma alteração foi feita.</p>
    <Button variant="outline" className="mt-3" onClick={onClose}>Voltar</Button>
  </div>;

  if (loading || !initialData) {
    return (
      <div className={embedded ? "h-[600px] flex items-center justify-center bg-background" : "fixed inset-0 z-50 flex items-center justify-center bg-background"}>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className={embedded && !fullscreen ? "relative h-[600px] min-h-[400px] resize-y overflow-hidden rounded-lg border bg-background" : "fixed inset-0 z-50 bg-background"}>
      <div className="relative h-full mindmap-canvas" data-document-canvas tabIndex={-1} ref={wrapperRef}>
        {/* O painel nativo de cor/traço/fonte do Excalidraw fica preso na
            lateral e ocupa bastante espaço — trocamos pelo botão de caneta
            (com o popup compacto) lá embaixo. */}
        <style>
          {".mindmap-canvas .selected-shape-actions { display: none !important; } " +
            ".mm-node-variant-active { position: relative; } " +
            '.mm-node-variant-active::after { content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 9999px; background: var(--primary, #7c5cff); }'}
        </style>

        {/* Nenhuma barra fixa: voltar/título e as conexões ficam flutuando
            por cima do canvas mesmo, sem tomar espaço dele. Encostado ao
            lado do menu (☰) nativo do Excalidraw, não embaixo dele. */}
        <div className="absolute left-14 top-2 z-20 flex h-9 items-center gap-1 rounded-lg border bg-background/95 px-1 shadow-sm">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={embedded ? "Recolher lousa" : "Voltar"} onClick={handleClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            className="h-7 w-40 border-none bg-transparent px-1.5 text-sm font-medium shadow-none focus-visible:ring-0"
          />
          {onTrocarDocumento && outrasLousas.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Trocar de lousa">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                {outrasLousas.map((lousa) => (
                  <DropdownMenuItem key={lousa.id} onClick={() => onTrocarDocumento(lousa.id)}>
                    <span className="truncate">{lousa.titulo || "Lousa sem título"}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="hidden shrink-0 truncate pr-1 text-[11px] text-muted-foreground md:inline">
            {getSaveStatus()}
          </span>
        </div>

        {/* Puxar/criar cards do Kanban direto no mapa. */}
        <div className="absolute left-14 top-14 z-20 flex h-8 items-center gap-0.5 rounded-lg border bg-background/95 px-1 shadow-sm">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Novo card" onClick={() => void criarNovoCard()}>
            <Plus className="h-4 w-4" />
          </Button>
          <MindMapKanbanPicker
            atividades={atividadesDoCliente.filter((a) => !kanbanBoxes.some((b) => b.atividadeId === a.id))}
            onSelect={inserirCardNoMapa}
          />
        </div>

        {embedded && <Button variant="outline" size="sm" className="absolute right-3 bottom-14 z-30 gap-2" onClick={() => setFullscreen(value => !value)}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        </Button>}
        {saveError && <div role="alert" className="absolute left-3 bottom-14 z-30 max-w-[60%] rounded border border-destructive bg-background p-2 text-xs text-destructive">{saveError}</div>}

        <div className="absolute right-2 top-14 z-20 flex h-8 items-center gap-0.5 rounded-lg border bg-background/95 px-1 shadow-sm">
          <PresencaAvatares pessoas={pessoasOnline} />
          {selectedArrowHidden && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={toggleSelectedConnection}
              title={selectedArrowHidden.hidden ? "Mostrar conexão" : "Ocultar conexão"}
            >
              {selectedArrowHidden.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={toggleAllConnections}
            title={hasAnyHiddenConnection ? "Mostrar todas as conexões" : "Ocultar todas as conexões"}
          >
            {hasAnyHiddenConnection ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Menu de variação do retângulo (long-press na toolbar nativa). */}
        {variantMenuOpen && (
          <div
            className="mm-variant-menu fixed z-30 flex w-48 flex-col overflow-hidden rounded-lg border bg-background py-1 shadow-lg"
            style={{ left: variantMenuPos.x, top: variantMenuPos.y }}
          >
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => escolherVariante("plain")}
            >
              <Square className="h-4 w-4" /> Retângulo comum
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => escolherVariante("node")}
            >
              <Waypoints className="h-4 w-4" /> Retângulo nó
            </button>
          </div>
        )}

        {/* Pontinhos de conexão dos nós selecionados/sob o mouse. */}
        {activeNodeBoxes.map((box) => (
          <div key={box.id}>
            {(["top", "right", "bottom", "left"] as ConnectionSide[]).map((side) => {
              const style =
                side === "top"
                  ? { left: box.left + box.width / 2, top: box.top }
                  : side === "bottom"
                  ? { left: box.left + box.width / 2, top: box.top + box.height }
                  : side === "left"
                  ? { left: box.left, top: box.top + box.height / 2 }
                  : { left: box.left + box.width, top: box.top + box.height / 2 };
              return (
                <div
                  key={side}
                  data-testid="mm-connection-dot"
                  data-node-id={box.id}
                  data-side={side}
                  className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-background bg-primary shadow transition-transform hover:scale-125"
                  style={style}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    startConnectionDrag(box.id, side);
                  }}
                />
              );
            })}
          </div>
        ))}

        {/* Cards do Kanban presos no mapa — ver customData.kanban e
            recomputeKanbanBoxes. */}
        {kanbanBoxes.map((box) => {
          const atividade = atividadesPorId[box.atividadeId];
          const coluna = atividade ? colunas.find((c) => c.status_key === atividade.status) : undefined;
          return (
            <MindMapKanbanCard
              key={box.elementId}
              box={box}
              selected={box.selected}
              atividade={atividade}
              statusLabel={coluna?.nome}
              onToggleConcluida={() => atividade && void toggleCardConcluida(atividade)}
              onAbrirDetalhes={() => setDetailAtividadeId(box.atividadeId)}
              onRemoverDoMapa={() => removerCardDoMapa(box.elementId)}
            />
          );
        })}

        {/* Prévia da conexão sendo arrastada + destaque do alvo válido. */}
        {connectionDrag && appStateRef.current && (
          <>
            {connectionDrag.hoveredTargetId &&
              (() => {
                const target = elementsRef.current?.find((e) => e.id === connectionDrag.hoveredTargetId);
                const appState = appStateRef.current;
                if (!target || !appState) return null;
                const topLeft = sceneCoordsToViewportCoords({ sceneX: target.x, sceneY: target.y }, appState);
                const bottomRight = sceneCoordsToViewportCoords({ sceneX: target.x + target.width, sceneY: target.y + target.height }, appState);
                return (
                  <div
                    className="pointer-events-none absolute z-20 rounded-lg ring-2 ring-primary/70"
                    style={{
                      left: topLeft.x - appState.offsetLeft - 4,
                      top: topLeft.y - appState.offsetTop - 4,
                      width: bottomRight.x - topLeft.x + 8,
                      height: bottomRight.y - topLeft.y + 8,
                    }}
                  />
                );
              })()}
            <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
              {(() => {
                const appState = appStateRef.current!;
                const start = sceneCoordsToViewportCoords({ sceneX: connectionDrag.startScene.x, sceneY: connectionDrag.startScene.y }, appState);
                const end = sceneCoordsToViewportCoords({ sceneX: connectionDrag.currentScene.x, sceneY: connectionDrag.currentScene.y }, appState);
                const sx = start.x - appState.offsetLeft;
                const sy = start.y - appState.offsetTop;
                const ex = end.x - appState.offsetLeft;
                const ey = end.y - appState.offsetTop;
                const mx = (sx + ex) / 2;
                return (
                  <path
                    d={`M ${sx} ${sy} Q ${mx} ${sy} ${mx} ${(sy + ey) / 2} T ${ex} ${ey}`}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                  />
                );
              })()}
            </svg>
          </>
        )}

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-base text-muted-foreground/70">Clique duas vezes em qualquer lugar para começar.</p>
            <p className="text-sm text-muted-foreground/50">Tab cria uma ramificação.</p>
          </div>
        )}

        {hiddenBadge && (
          <div
            className="excalidraw-hidden-badge pointer-events-none absolute z-10 -translate-y-1/2 rounded-full border bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
            style={{ left: hiddenBadge.x, top: hiddenBadge.y }}
          >
            •{hiddenBadge.count}
          </div>
        )}

        <Excalidraw
          excalidrawAPI={handleApiReady}
          handleKeyboardGlobally={!embedded || fullscreen}
          initialData={initialData}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          isCollaborating
          theme={theme === "dark" ? "dark" : "light"}
          UIOptions={UI_OPTIONS}
        />

        {/* Cor/fonte recolhidos num ícone de caneta — só aparece o painel
            quando a pessoa clica, em vez de ficar sempre ocupando espaço. */}
        {penPanelOpen && (
          <div className="absolute bottom-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border bg-background px-3 py-2 shadow-lg">
            <div className="flex items-center gap-1">
              {STROKE_COLORS.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  title="Cor do traço"
                  onClick={() => aplicarPropriedade({ strokeColor: cor })}
                  className="h-5 w-5 rounded-full border border-border/60 transition-transform hover:scale-110"
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-1">
              {BACKGROUND_COLORS.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  title="Cor de fundo"
                  onClick={() => aplicarPropriedade({ backgroundColor: cor })}
                  className="h-5 w-5 rounded-full border border-border/60 transition-transform hover:scale-110"
                  style={
                    cor === "transparent"
                      ? { backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0, 3px 3px" }
                      : { backgroundColor: cor }
                  }
                />
              ))}
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-0.5">
              {FONT_SIZES.map(({ size, label }) => (
                <button
                  key={size}
                  type="button"
                  title="Tamanho do texto"
                  onClick={() => aplicarPropriedade({ fontSize: size })}
                  className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-medium text-muted-foreground hover:bg-muted"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          size="icon"
          className="absolute bottom-3 left-1/2 z-20 h-10 w-10 -translate-x-1/2 rounded-full shadow-lg"
          onClick={() => setPenPanelOpen((v) => !v)}
          title="Cor e fonte"
        >
          <PenLine className="h-5 w-5" />
        </Button>

        {/* Mesmo painel de detalhes do Kanban normal — abrir por aqui já
            cobre status, responsáveis, datas, prioridade, subtarefas etc.,
            sem duplicar nada disso num menu próprio do card. */}
        <AtividadeDetailPanel
          open={detailAtividadeId !== null}
          onClose={() => setDetailAtividadeId(null)}
          atividade={detailAtividadeId ? atividadesPorId[detailAtividadeId] ?? null : null}
          colunas={colunas}
          onUpdate={() => detailAtividadeId && void handleDetalheAtualizado(detailAtividadeId)}
          onDelete={(id) => void handleDetalheExcluido(id)}
        />
      </div>
    </div>
  );
}
