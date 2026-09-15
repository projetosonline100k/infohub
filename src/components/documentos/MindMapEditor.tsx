import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  newElementWith,
  restore,
  sceneCoordsToViewportCoords,
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
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useTheme } from "@/hooks/useTheme";
import { useMapaMentalColaboracao } from "@/hooks/useMapaMentalColaboracao";
import { PresencaAvatares } from "./PresencaAvatares";
import { formatDistanceToNow } from "date-fns";
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

function isHiddenConnection(el: ExcalidrawElement): boolean {
  return Boolean(getMindMapData(el)?.hidden);
}

function isConnectableBlock(el: ExcalidrawElement): boolean {
  return el.type !== "arrow" && el.type !== "text" && el.type !== "freedraw" && el.type !== "image";
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
  const startPoint = { x: source.x + source.width, y: source.y + source.height / 2 };
  const endPoint = { x: target.x, y: target.y + target.height / 2 };
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
}

export function MindMapEditor({ documentoId, onClose }: MindMapEditorProps) {
  const [titulo, setTitulo] = useState("Mapa mental sem título");
  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [selectedArrowHidden, setSelectedArrowHidden] = useState<{ id: string; hidden: boolean } | null>(null);
  const [hasAnyHiddenConnection, setHasAnyHiddenConnection] = useState(false);
  const [hiddenBadge, setHiddenBadge] = useState<{ x: number; y: number; count: number } | null>(null);

  const { theme } = useTheme();
  const { saving, lastSaved, debouncedSave, saveNow } = useAutoSave({ documentoId, debounceMs: 800 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const previousContentRef = useRef<string | null>(null);
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
    // Importante: precisa ser disparado no elemento com foco de verdade
    // (o container do Excalidraw) — despachado direto em `document` o
    // Excalidraw simplesmente ignora o evento.
    requestAnimationFrame(() => {
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      (event as unknown as { __mmSynthetic: boolean }).__mmSynthetic = true;
      (document.activeElement || document).dispatchEvent(event);
    });
  }, []);

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

      const target = event.target as HTMLElement | null;
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
          const textarea = document.querySelector<HTMLTextAreaElement>("textarea.excalidraw-wysiwyg");
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
  }, [createConnectedBlock]);

  // Carrega o mapa (uma vez, ao abrir).
  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setLoading(true);
      const { data, error } = await supabase
        .from("documentos")
        .select("titulo, conteudo")
        .eq("id", documentoId)
        .maybeSingle();

      if (cancelado) return;

      if (data && !error) {
        setTitulo(data.titulo || "Mapa mental sem título");
        const parsed = parseCanvasDoc(data.conteudo);
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

      loadingRef.current = false;
      isReadyRef.current = true;
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [documentoId]);

  const salvarTitulo = useCallback(async () => {
    await supabase.from("documentos").update({ titulo }).eq("id", documentoId);
  }, [titulo, documentoId]);

  // Qualquer mudança (mover, criar, apagar, conectar, digitar, colorir)
  // reserializa a cena inteira e agenda o autosave — mesmo mecanismo do
  // Documento/Caderno. Também cuida da "ramificação instantânea" e do
  // indicador de conexões ocultas no bloco selecionado.
  const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    // Se essa mudança veio de uma reconciliação com dado remoto (outra
    // pessoa editando agora), não reenvia pra rede — evita eco infinito.
    // Ainda assim segue o fluxo normal (autosave etc.), já que o resultado
    // mesclado é exatamente o que precisa ser salvo.
    const vindoDeFora = applyingRemoteRef.current;
    applyingRemoteRef.current = false;
    if (!vindoDeFora && !loadingRef.current) {
      broadcastElements(elements);
    }

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
    previousContentRef.current = content;
    debouncedSave(content);
  }, [createConnectedBlock, debouncedSave, broadcastElements, applyingRemoteRef]);

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

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api;
  }, []);

  // Manda a posição do mouse pros outros que estiverem no mapa agora —
  // é isso que faz aparecer o cursor colorido deles se mexendo, igual Miro.
  const handlePointerUpdate = useCallback((payload: { pointer: { x: number; y: number } }) => {
    broadcastCursor(payload.pointer.x, payload.pointer.y);
  }, [broadcastCursor]);

  const handleClose = () => {
    const api = excalidrawApiRef.current;
    if (api) {
      saveNow(serializeCanvasDoc(api.getSceneElements(), api.getAppState(), api.getFiles()));
    }
    onClose();
  };

  const getSaveStatus = () => {
    if (saving) return "Salvando...";
    if (lastSaved) return `Salvo ${formatDistanceToNow(lastSaved, { locale: ptBR, addSuffix: false })}`;
    return "";
  };

  if (loading || !initialData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            className="max-w-md border-none bg-transparent text-lg font-medium shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <PresencaAvatares pessoas={pessoasOnline} />
          {selectedArrowHidden && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={toggleSelectedConnection}>
              {selectedArrowHidden.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {selectedArrowHidden.hidden ? "Mostrar conexão" : "Ocultar conexão"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={toggleAllConnections}
            title={hasAnyHiddenConnection ? "Mostrar todas as conexões" : "Ocultar todas as conexões"}
          >
            {hasAnyHiddenConnection ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hasAnyHiddenConnection ? "Mostrar todas" : "Ocultar todas"}
          </Button>
          <span className="w-24 text-right text-xs text-muted-foreground">{getSaveStatus()}</span>
        </div>
      </header>

      <div className="relative flex-1" ref={wrapperRef}>
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
          initialData={initialData}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          isCollaborating
          theme={theme === "dark" ? "dark" : "light"}
          UIOptions={UI_OPTIONS}
        />
      </div>
    </div>
  );
}
