import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eraser,
  ImagePlus,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const CADERNO_PREFIX = "__CADERNO_V1__";
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;

type Tool = "pen" | "eraser" | "select";

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface StrokeElement {
  type: "stroke";
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
}

interface ImageElement {
  type: "image";
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type CadernoElement = StrokeElement | ImageElement;

interface CadernoData {
  kind: "caderno";
  version: 1;
  elements?: CadernoElement[];
  strokes?: StrokeElement[];
}

interface CadernoEditorProps {
  documentoId: string;
  onClose: () => void;
}

interface LocalCadernoCache {
  titulo: string;
  conteudo: string;
  savedAt: string;
  pendingSync: boolean;
}

const COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b"];

export function isCadernoContent(content?: string | null) {
  return Boolean(content?.startsWith(CADERNO_PREFIX));
}

export function createEmptyCadernoContent() {
  return serializeCaderno([]);
}

function serializeCaderno(elements: CadernoElement[]) {
  const data: CadernoData = {
    kind: "caderno",
    version: 1,
    elements,
  };

  return `${CADERNO_PREFIX}${JSON.stringify(data)}`;
}

function parseCaderno(content?: string | null): CadernoElement[] {
  if (!content?.startsWith(CADERNO_PREFIX)) return [];

  try {
    const parsed = JSON.parse(content.slice(CADERNO_PREFIX.length)) as CadernoData;
    if (Array.isArray(parsed.elements)) return parsed.elements;
    if (Array.isArray(parsed.strokes)) {
      return parsed.strokes.map((stroke) => ({ ...stroke, type: "stroke" as const }));
    }
    return [];
  } catch {
    return [];
  }
}

function getLocalCacheKey(documentoId: string) {
  return `infopro:caderno:${documentoId}`;
}

function readLocalCaderno(documentoId: string): LocalCadernoCache | null {
  try {
    const raw = window.localStorage.getItem(getLocalCacheKey(documentoId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalCaderno(documentoId: string, cache: LocalCadernoCache) {
  try {
    window.localStorage.setItem(getLocalCacheKey(documentoId), JSON.stringify(cache));
  } catch (error) {
    console.warn("Não foi possível salvar o caderno localmente.", error);
  }
}

function clearLocalPendingSync(documentoId: string) {
  const cache = readLocalCaderno(documentoId);
  if (!cache) return;

  writeLocalCaderno(documentoId, {
    ...cache,
    pendingSync: false,
  });
}

export function CadernoEditor({ documentoId, onClose }: CadernoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const elementsRef = useRef<CadernoElement[]>([]);
  const redoRef = useRef<CadernoElement[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeStrokeRef = useRef<StrokeElement | null>(null);
  const inputModeRef = useRef<"pointer" | "touch" | "mouse" | null>(null);
  const selectedElementIdRef = useRef<string | null>(null);

  const [titulo, setTitulo] = useState("Caderno sem título");
  const [elements, setElements] = useState<CadernoElement[]>([]);
  const [redoCount, setRedoCount] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(5);
  const [zoom, setZoom] = useState(0.6);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingLocal, setPendingLocal] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: StrokeElement) => {
    if (stroke.points.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";

    for (let i = 1; i < stroke.points.length; i += 1) {
      const from = stroke.points[i - 1];
      const to = stroke.points[i];
      const pressure = Math.max(to.pressure || 0.5, 0.25);

      ctx.beginPath();
      ctx.lineWidth = stroke.width * pressure;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  const drawImage = useCallback((ctx: CanvasRenderingContext2D, element: ImageElement) => {
    const cached = imageCacheRef.current.get(element.src);

    if (cached?.complete) {
      ctx.drawImage(cached, element.x, element.y, element.width, element.height);
      return;
    }

    const image = new Image();
    image.onload = () => {
      imageCacheRef.current.set(element.src, image);
      redraw();
    };
    image.src = element.src;
    imageCacheRef.current.set(element.src, image);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    elementsRef.current.forEach((element) => {
      if (element.type === "stroke") {
        drawStroke(ctx, element);
      } else {
        drawImage(ctx, element);
      }
    });

    const selectedImage = elementsRef.current.find(
      (element): element is ImageElement =>
        element.type === "image" && element.id === selectedElementIdRef.current
    );

    if (selectedImage) {
      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 6;
      ctx.setLineDash([18, 12]);
      ctx.strokeRect(
        selectedImage.x - 8,
        selectedImage.y - 8,
        selectedImage.width + 16,
        selectedImage.height + 16
      );
      ctx.restore();
    }
  }, [drawImage, drawStroke]);

  const saveLocalContent = useCallback((nextElements: CadernoElement[], pendingSync = true) => {
    writeLocalCaderno(documentoId, {
      titulo,
      conteudo: serializeCaderno(nextElements),
      savedAt: new Date().toISOString(),
      pendingSync,
    });
    setPendingLocal(pendingSync);
  }, [documentoId, titulo]);

  const saveContent = useCallback(async (nextElements: CadernoElement[]) => {
    saveLocalContent(nextElements, true);

    if (!navigator.onLine) {
      setSaving(false);
      setPendingLocal(true);
      return;
    }

    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from("documentos")
      .update({
        conteudo: serializeCaderno(nextElements),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentoId);

    setSaving(false);
    if (!error) {
      clearLocalPendingSync(documentoId);
      setPendingLocal(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } else {
      setPendingLocal(true);
    }
  }, [documentoId, saveLocalContent]);

  const queueSave = useCallback((nextElements: CadernoElement[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent(nextElements);
    }, 700);
  }, [saveContent]);

  const commitElements = useCallback((nextElements: CadernoElement[], options?: { preserveRedo?: boolean }) => {
    elementsRef.current = nextElements;
    setElements(nextElements);
    saveLocalContent(nextElements, true);

    if (!options?.preserveRedo) {
      redoRef.current = [];
      setRedoCount(0);
    }

    redraw();
    queueSave(nextElements);
  }, [queueSave, redraw, saveLocalContent]);

  useEffect(() => {
    async function loadCaderno() {
      setLoading(true);
      const localCache = readLocalCaderno(documentoId);

      if (localCache) {
        const localElements = parseCaderno(localCache.conteudo);
        elementsRef.current = localElements;
        setElements(localElements);
        setTitulo(localCache.titulo || "Caderno sem título");
        setPendingLocal(localCache.pendingSync);
        setLoading(false);
      }

      const { data } = await supabase
        .from("documentos")
        .select("titulo, conteudo, updated_at")
        .eq("id", documentoId)
        .maybeSingle();

      if (!data) {
        setLoading(false);
        return;
      }

      const shouldUseLocal =
        localCache &&
        new Date(localCache.savedAt).getTime() >= new Date(data.updated_at).getTime();

      if (shouldUseLocal) {
        if (localCache.pendingSync) {
          saveContent(parseCaderno(localCache.conteudo));
        }
        setLoading(false);
        return;
      }

      const loadedElements = parseCaderno(data?.conteudo);
      elementsRef.current = loadedElements;
      setElements(loadedElements);
      selectedElementIdRef.current = null;
      setSelectedElementId(null);
      redoRef.current = [];
      setRedoCount(0);
      setTitulo(data?.titulo || "Caderno sem título");
      writeLocalCaderno(documentoId, {
        titulo: data?.titulo || "Caderno sem título",
        conteudo: data?.conteudo || createEmptyCadernoContent(),
        savedAt: data.updated_at,
        pendingSync: false,
      });
      setPendingLocal(false);
      setLoading(false);
    }

    loadCaderno();
  }, [documentoId, saveContent]);

  useEffect(() => {
    if (!loading) redraw();
  }, [loading, redraw]);

  useEffect(() => {
    selectedElementIdRef.current = selectedElementId;
    redraw();
  }, [selectedElementId, redraw]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveContent(elementsRef.current);
      }
    };
  }, [saveContent]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      const localCache = readLocalCaderno(documentoId);
      if (localCache?.pendingSync) {
        saveContent(parseCaderno(localCache.conteudo));
      }
    };

    const handleOffline = () => {
      setOnline(false);
      setPendingLocal(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [documentoId, saveContent]);

  const getCanvasPoint = (clientX: number, clientY: number, pressure = 0.8): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 1 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
      pressure: pressure > 0 ? pressure : 0.8,
    };
  };

  const startStroke = (point: Point) => {
    if (tool === "select") {
      selectImageAtPoint(point);
      inputModeRef.current = null;
      return;
    }

    selectedElementIdRef.current = null;
    setSelectedElementId(null);

    const stroke: StrokeElement = {
      type: "stroke",
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === "eraser" ? width * 4 : width,
      points: [point],
    };

    activeStrokeRef.current = stroke;
  };

  const selectImageAtPoint = (point: Point) => {
    const selectedImage = [...elementsRef.current]
      .reverse()
      .find((element): element is ImageElement => {
        if (element.type !== "image") return false;

        return (
          point.x >= element.x &&
          point.x <= element.x + element.width &&
          point.y >= element.y &&
          point.y <= element.y + element.height
        );
      });

    selectedElementIdRef.current = selectedImage?.id || null;
    setSelectedElementId(selectedImage?.id || null);
  };

  const addPointToStroke = (point: Point) => {
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;

    activeStroke.points.push(point);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      drawStroke(ctx, {
        ...activeStroke,
        points: activeStroke.points.slice(-2),
      });
    }
  };

  const endStroke = () => {
    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) return;

    activeStrokeRef.current = null;
    inputModeRef.current = null;

    if (activeStroke.points.length === 1) {
      const point = activeStroke.points[0];
      activeStroke.points.push({ ...point, x: point.x + 0.1, y: point.y + 0.1 });
    }

    commitElements([...elementsRef.current, activeStroke]);
  };

  const cancelStroke = () => {
    activeStrokeRef.current = null;
    inputModeRef.current = null;
    redraw();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "mouse") return;
    if (inputModeRef.current && inputModeRef.current !== "pointer") return;
    if ("isPrimary" in event && !event.isPrimary) return;

    event.preventDefault();
    inputModeRef.current = "pointer";
    event.currentTarget.setPointerCapture(event.pointerId);
    startStroke(getCanvasPoint(event.clientX, event.clientY, event.pressure || 0.8));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "mouse") return;
    if (inputModeRef.current !== "pointer") return;

    event.preventDefault();
    addPointToStroke(getCanvasPoint(event.clientX, event.clientY, event.pressure || 0.8));
  };

  const finishPointerStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "mouse") return;
    if (inputModeRef.current !== "pointer") return;

    event.preventDefault();
    endStroke();
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (inputModeRef.current && inputModeRef.current !== "touch") return;
    if (event.touches.length !== 1) return;

    event.preventDefault();
    const touch = event.touches[0];
    inputModeRef.current = "touch";
    startStroke(getCanvasPoint(touch.clientX, touch.clientY, touch.force || 0.8));
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (inputModeRef.current !== "touch") return;
    if (event.touches.length !== 1) return;

    event.preventDefault();
    const touch = event.touches[0];
    addPointToStroke(getCanvasPoint(touch.clientX, touch.clientY, touch.force || 0.8));
  };

  const finishTouchStroke = (event: React.TouchEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (inputModeRef.current !== "touch") return;

    event.preventDefault();
    endStroke();
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (inputModeRef.current && inputModeRef.current !== "mouse") return;

    event.preventDefault();
    inputModeRef.current = "mouse";
    startStroke(getCanvasPoint(event.clientX, event.clientY, 0.8));
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (inputModeRef.current !== "mouse") return;

    event.preventDefault();
    addPointToStroke(getCanvasPoint(event.clientX, event.clientY, 0.8));
  };

  const finishMouseStroke = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (inputModeRef.current !== "mouse") return;

    event.preventDefault();
    endStroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getTouchPoint = (touch: Touch) => {
      const force = "force" in touch && touch.force ? touch.force : 0.8;
      return getCanvasPoint(touch.clientX, touch.clientY, force);
    };

    const nativeTouchStart = (event: TouchEvent) => {
      if (inputModeRef.current && inputModeRef.current !== "touch") return;
      if (event.touches.length !== 1) return;

      event.preventDefault();
      inputModeRef.current = "touch";
      startStroke(getTouchPoint(event.touches[0]));
    };

    const nativeTouchMove = (event: TouchEvent) => {
      if (inputModeRef.current !== "touch") return;
      if (event.touches.length !== 1) return;

      event.preventDefault();
      addPointToStroke(getTouchPoint(event.touches[0]));
    };

    const nativeTouchEnd = (event: TouchEvent) => {
      if (inputModeRef.current !== "touch") return;

      event.preventDefault();
      endStroke();
    };

    canvas.addEventListener("touchstart", nativeTouchStart, { passive: false });
    canvas.addEventListener("touchmove", nativeTouchMove, { passive: false });
    canvas.addEventListener("touchend", nativeTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", nativeTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", nativeTouchStart);
      canvas.removeEventListener("touchmove", nativeTouchMove);
      canvas.removeEventListener("touchend", nativeTouchEnd);
      canvas.removeEventListener("touchcancel", nativeTouchEnd);
    };
  }, [color, tool, width, zoom]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();

    reader.onload = () => {
      const src = String(reader.result || "");
      const image = new Image();

      image.onload = () => {
        const maxWidth = 760;
        const scale = Math.min(1, maxWidth / image.width);
        const renderedWidth = Math.max(160, image.width * scale);
        const renderedHeight = Math.max(120, image.height * scale);
        const scrollArea = scrollAreaRef.current;
        const x = scrollArea ? Math.max(80, (scrollArea.scrollLeft + scrollArea.clientWidth * 0.2) / zoom) : 160;
        const y = scrollArea ? Math.max(80, (scrollArea.scrollTop + scrollArea.clientHeight * 0.2) / zoom) : 160;
        const imageElement: ImageElement = {
          type: "image",
          id: crypto.randomUUID(),
          src,
          x,
          y,
          width: renderedWidth,
          height: renderedHeight,
        };

        imageCacheRef.current.set(src, image);
        selectedElementIdRef.current = imageElement.id;
        setSelectedElementId(imageElement.id);
        commitElements([...elementsRef.current, imageElement]);
      };

      image.src = src;
    };

    reader.readAsDataURL(file);
  };

  const salvarTitulo = async () => {
    const serialized = serializeCaderno(elementsRef.current);
    writeLocalCaderno(documentoId, {
      titulo,
      conteudo: serialized,
      savedAt: new Date().toISOString(),
      pendingSync: true,
    });

    const { error } = await supabase
      .from("documentos")
      .update({ titulo })
      .eq("id", documentoId);

    if (!error) {
      const cache = readLocalCaderno(documentoId);
      writeLocalCaderno(documentoId, {
        titulo,
        conteudo: cache?.conteudo || serialized,
        savedAt: cache?.savedAt || new Date().toISOString(),
        pendingSync: cache?.pendingSync || false,
      });
    }
  };

  const undo = () => {
    const lastElement = elementsRef.current.at(-1);
    if (!lastElement) return;

    redoRef.current = [lastElement, ...redoRef.current];
    setRedoCount(redoRef.current.length);
    commitElements(elementsRef.current.slice(0, -1), { preserveRedo: true });
  };

  const redo = () => {
    const nextElement = redoRef.current[0];
    if (!nextElement) return;

    redoRef.current = redoRef.current.slice(1);
    setRedoCount(redoRef.current.length);
    commitElements([...elementsRef.current, nextElement], { preserveRedo: true });
  };

  const deleteSelectedOrClear = () => {
    if (selectedElementIdRef.current) {
      const nextElements = elementsRef.current.filter((element) => element.id !== selectedElementIdRef.current);
      selectedElementIdRef.current = null;
      setSelectedElementId(null);
      commitElements(nextElements);
      return;
    }

    if (!confirm("Apagar todos os elementos deste caderno?")) return;
    commitElements([]);
  };

  const zoomOut = () => setZoom((value) => Math.max(0.3, Number((value - 0.1).toFixed(2))));
  const zoomIn = () => setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(2))));

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#f8f8f6] flex flex-col">
      <header className="shrink-0 px-3 py-2 bg-white/90 backdrop-blur border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Input
              value={titulo}
              onChange={(event) => setTitulo(event.target.value)}
              onBlur={salvarTitulo}
              className="h-11 text-xl font-semibold border-none bg-transparent shadow-none focus-visible:ring-0 min-w-[180px] max-w-[360px]"
            />
          </div>

          <div className="flex items-center gap-2 rounded-full bg-white shadow-sm border px-2 py-1">
            <Button
              variant={tool === "select" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setTool("select")}
              className="h-10 w-10 rounded-full"
              title="Selecionar imagem"
            >
              <MousePointer2 className="h-5 w-5" />
            </Button>
            <Button
              variant={tool === "pen" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setTool("pen")}
              className="h-10 w-10 rounded-full"
            >
              <PenLine className="h-5 w-5" />
            </Button>
            <Button
              variant={tool === "eraser" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setTool("eraser")}
              className="h-10 w-10 rounded-full"
            >
              <Eraser className="h-5 w-5" />
            </Button>
            <div className="hidden sm:flex items-center gap-1 px-1">
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Cor ${item}`}
                  onClick={() => {
                    setColor(item);
                    setTool("pen");
                  }}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform",
                    color === item ? "border-foreground scale-105" : "border-transparent"
                  )}
                  style={{ backgroundColor: item }}
                />
              ))}
            </div>
            <div className="hidden md:flex w-28 px-2">
              <Slider value={[width]} min={2} max={18} step={1} onValueChange={(value) => setWidth(value[0])} />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 rounded-full"
              title="Subir imagem"
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
          </div>

          <div className="hidden lg:flex items-center gap-1 rounded-full bg-white shadow-sm border px-2 py-1">
            <Button variant="ghost" size="icon" onClick={zoomOut} className="h-10 w-10 rounded-full">
              <ZoomOut className="h-5 w-5" />
            </Button>
            <span className="w-12 text-center text-sm font-medium">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={zoomIn} className="h-10 w-10 rounded-full">
              <ZoomIn className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground min-w-[92px] justify-end">
              {saving && (
                <>
                  <Save className="h-4 w-4" />
                  Salvando
                </>
              )}
              {saved && (
                <>
                  <Check className="h-4 w-4" />
                  Salvo
                </>
              )}
              {!saving && pendingLocal && (
                <>
                  <WifiOff className="h-4 w-4" />
                  Local
                </>
              )}
              {!saving && !pendingLocal && !saved && !online && (
                <>
                  <WifiOff className="h-4 w-4" />
                  Offline
                </>
              )}
            </span>
            <Button variant="ghost" size="icon" onClick={undo} disabled={elements.length === 0} className="h-11 w-11 rounded-full">
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={redoCount === 0} className="h-11 w-11 rounded-full">
              <Redo2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={deleteSelectedOrClear}
              disabled={elements.length === 0}
              className="h-11 w-11 rounded-full text-destructive hover:text-destructive"
              title={selectedElementId ? "Excluir imagem selecionada" : "Limpar caderno"}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div ref={scrollAreaRef} className="flex-1 overflow-auto">
        <div className="min-w-[1024px] min-h-[720px] p-6">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerStroke}
            onPointerCancel={cancelStroke}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={finishTouchStroke}
            onTouchCancel={cancelStroke}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={finishMouseStroke}
            onMouseLeave={finishMouseStroke}
            className="block max-w-none rounded-sm shadow-sm touch-none cursor-crosshair bg-[radial-gradient(circle,#d4d4d4_1.4px,transparent_1.4px)] [background-size:32px_32px] bg-white"
            style={{
              width: CANVAS_WIDTH * zoom,
              height: CANVAS_HEIGHT * zoom,
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
