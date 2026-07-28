import { useState, useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  ChevronDown,
  FileText,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquare,
  MoreHorizontal,
  Pilcrow,
  Sparkles,
  Star,
  Strikethrough,
  Tag,
  Trash2,
  Underline,
  Undo,
  Redo,
  Calendar,
  CheckCircle2,
  ExternalLink,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { SlashCommandTextarea, SelectionRange } from "./SlashCommandTextarea";
import { RoteiroChat } from "./RoteiroChat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TagVideo {
  id: string;
  nome: string;
  cor: string;
}

interface Video {
  id: string;
  titulo: string;
  descricao?: string | null;
  roteiro?: string | null;
  status: string;
  escalado?: boolean;
  data_postagem?: string | null;
  cliente_id: string;
  arquivo_url?: string | null;
  arquivo_chave?: string | null;
  arquivo_nome?: string | null;
  arquivo_tamanho?: number | null;
}

interface VideoDetailPanelProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
  onSave: (video: Video) => void;
  onAutoSave?: (video: Video) => Promise<void>;
  onDelete: (id: string) => void;
  relatedVideos?: Video[];
  onSelectVideo?: (video: Video) => void;
  tags: TagVideo[];
  videoTags: string[];
  onTagToggle: (tagId: string) => void;
  platform: "vertical" | "youtube";
}

const STATUS_OPTIONS = [
  { value: "ideia", label: "Ideia" },
  { value: "roteiro", label: "Roteiro" },
  { value: "gravacao", label: "Gravação" },
  { value: "edicao", label: "Edição" },
  { value: "pronto", label: "Pronto" },
  { value: "postado", label: "Postado" },
];

const TAG_COLORS: Record<string, string> = {
  blue: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  green: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
  red: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  yellow: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  purple: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  pink: "bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30",
  orange: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30",
  cyan: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
};

interface SelectionContext {
  text: string;
  range: SelectionRange;
}

export const VideoDetailPanel = ({
  video,
  open,
  onClose,
  onSave,
  onAutoSave,
  onDelete,
  relatedVideos = [],
  onSelectVideo,
  tags,
  videoTags,
  onTagToggle,
  platform,
}: VideoDetailPanelProps) => {
  const [editedVideo, setEditedVideo] = useState<Video | null>(null);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedSnapshotRef = useRef("");
  const currentVideoIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!video) {
      currentVideoIdRef.current = null;
      setEditedVideo(null);
      setAutoSaveStatus("idle");
      return;
    }

    if (currentVideoIdRef.current === video.id) {
      return;
    }

    currentVideoIdRef.current = video.id;
    setEditedVideo({ ...video });
    lastSavedSnapshotRef.current = JSON.stringify({
      titulo: video.titulo,
      descricao: video.descricao || "",
      roteiro: video.roteiro || "",
      status: video.status,
      data_postagem: video.data_postagem || null,
    });
    setAutoSaveStatus("idle");
  }, [video]);

  useEffect(() => {
    if (!editedVideo || !onAutoSave) return;

    const snapshot = JSON.stringify({
      titulo: editedVideo.titulo,
      descricao: editedVideo.descricao || "",
      roteiro: editedVideo.roteiro || "",
      status: editedVideo.status,
      data_postagem: editedVideo.data_postagem || null,
    });

    if (snapshot === lastSavedSnapshotRef.current) return;

    setAutoSaveStatus("saving");
    const timeoutId = window.setTimeout(async () => {
      try {
        await onAutoSave(editedVideo);
        lastSavedSnapshotRef.current = snapshot;
        setAutoSaveStatus("saved");
      } catch (error) {
        console.error("Erro no salvamento automático:", error);
        setAutoSaveStatus("error");
      }
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [editedVideo, onAutoSave]);

  if (!editedVideo) return null;

  const getVideoSnapshot = (videoData: Video) => JSON.stringify({
    titulo: videoData.titulo,
    descricao: videoData.descricao || "",
    roteiro: videoData.roteiro || "",
    status: videoData.status,
    data_postagem: videoData.data_postagem || null,
  });

  const handleSave = () => {
    if (editedVideo) {
      onSave(editedVideo);
    }
  };

  const handleClose = async () => {
    if (editedVideo && onAutoSave && getVideoSnapshot(editedVideo) !== lastSavedSnapshotRef.current) {
      try {
        setAutoSaveStatus("saving");
        await onAutoSave(editedVideo);
        lastSavedSnapshotRef.current = getVideoSnapshot(editedVideo);
        setAutoSaveStatus("saved");
      } catch (error) {
        console.error("Erro no salvamento automático:", error);
        setAutoSaveStatus("error");
        return;
      }
    }

    onClose();
  };

  const handleSelectVideo = async (nextVideo: Video) => {
    if (nextVideo.id === editedVideo.id) return;

    if (editedVideo && onAutoSave && getVideoSnapshot(editedVideo) !== lastSavedSnapshotRef.current) {
      try {
        setAutoSaveStatus("saving");
        await onAutoSave(editedVideo);
        lastSavedSnapshotRef.current = getVideoSnapshot(editedVideo);
        setAutoSaveStatus("saved");
      } catch (error) {
        console.error("Erro no salvamento automático:", error);
        setAutoSaveStatus("error");
        return;
      }
    }

    onSelectVideo?.(nextVideo);
  };

  const handleInsertText = (text: string) => {
    setEditedVideo((prev) => {
      if (!prev) return prev;
      const currentRoteiro = prev.roteiro || "";
      return { ...prev, roteiro: currentRoteiro + "\n\n" + text };
    });
  };

  const handleReplaceText = (text: string, range: { start: number; end: number }) => {
    if (!editedVideo) return;
    const currentRoteiro = editedVideo.roteiro || "";
    const newRoteiro = currentRoteiro.substring(0, range.start) + text + currentRoteiro.substring(range.end);
    setEditedVideo((prev) => prev ? { ...prev, roteiro: newRoteiro } : prev);
    setSelectionContext(null);
  };

  const handleClearSelection = () => {
    setSelectionContext(null);
  };

  const handleVideoUpload = async (file: File) => {
    if (!editedVideo) return;
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("backblaze-upload-url", {
        body: {
          videoId: editedVideo.id,
          clienteId: editedVideo.cliente_id,
          platform,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        },
      });
      if (error) throw error;
      if (!data?.uploadUrl) throw new Error(data?.error || "URL de upload não recebida");

      const uploadResponse = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Backblaze respondeu com status ${uploadResponse.status}`);

      const fileFields = {
        arquivo_url: data.fileUrl,
        arquivo_chave: data.objectKey,
        arquivo_nome: file.name,
        arquivo_tamanho: file.size,
      };
      const table = platform === "vertical" ? "videos_vertical" : "videos_youtube";
      const { error: updateError } = await supabase.from(table).update(fileFields).eq("id", editedVideo.id);
      if (updateError) throw updateError;

      setEditedVideo({ ...editedVideo, ...fileFields });
      toast.success("Vídeo enviado para o Backblaze");
    } catch (error) {
      console.error("Erro no upload do vídeo:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o vídeo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSelectionChange = (text: string | null, range: SelectionRange | null) => {
    if (text && range) {
      setSelectionContext({ text, range });
    }
  };

  if (!open) return null;

  const toolbarIcons = [
    { icon: Bold, title: "Negrito" },
    { icon: Italic, title: "Itálico" },
    { icon: Underline, title: "Sublinhado" },
    { icon: Strikethrough, title: "Tachado" },
    { icon: Highlighter, title: "Destaque" },
    { icon: AlignLeft, title: "Alinhar à esquerda" },
    { icon: AlignCenter, title: "Centralizar" },
    { icon: AlignRight, title: "Alinhar à direita" },
    { icon: AlignJustify, title: "Justificar" },
    { icon: List, title: "Lista" },
    { icon: ListOrdered, title: "Lista numerada" },
    { icon: Link, title: "Link" },
    { icon: Undo, title: "Desfazer" },
    { icon: Redo, title: "Refazer" },
  ];

  const saveStatusLabel = (() => {
    if (autoSaveStatus === "saving") return "Salvando...";
    if (autoSaveStatus === "saved") return "Salvo automaticamente";
    if (autoSaveStatus === "error") return "Erro ao salvar";
    return "";
  })();
  const roteiroCharacterCount = (editedVideo.roteiro || "").length;
  const relatedStatus = relatedVideos.find((relatedVideo) => relatedVideo.id === editedVideo.id)?.status || editedVideo.status;
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === relatedStatus)?.label || relatedStatus;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => void handleClose()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Input
            value={editedVideo.titulo}
            onChange={(e) => setEditedVideo({ ...editedVideo, titulo: e.target.value })}
            onBlur={() => {
              if (!onAutoSave) handleSave();
            }}
            className="max-w-xl border-none bg-transparent text-lg font-medium shadow-none focus-visible:ring-0"
            placeholder="Título do vídeo"
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Star className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn(
            "text-sm",
            autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"
          )}>
            {saveStatusLabel}
          </span>
          <Button
            variant={showChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowChat(!showChat)}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Chat IA
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(editedVideo.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-0.5 border-b bg-background p-2 shrink-0">
        <Select value="paragraph" onValueChange={() => {}}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Texto normal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">
              <div className="flex items-center gap-2">
                <Pilcrow className="h-4 w-4" />
                Texto normal
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="mx-1 h-6 w-px bg-border" />
        {toolbarIcons.map(({ icon: Icon, title }, index) => (
          <Button
            key={title}
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", [5, 9, 12].includes(index) && "ml-2")}
            title={title}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[320px] shrink-0 border-r bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Propriedades do vídeo</h3>
            {editedVideo.escalado && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <Sparkles className="h-3 w-3 mr-1" />
                Escalado
              </Badge>
            )}
          </div>

          <ScrollArea className="h-full">
            <div className="space-y-5 p-4 pb-24">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <UploadCloud className="h-3 w-3" /> Arquivo do vídeo
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleVideoUpload(file);
                  }}
                />
                {editedVideo.arquivo_url ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{editedVideo.arquivo_nome || "Vídeo enviado"}</p>
                        {editedVideo.arquivo_tamanho && (
                          <p className="text-xs text-muted-foreground">
                            {(editedVideo.arquivo_tamanho / 1024 / 1024).toFixed(1)} MB
                          </p>
                        )}
                      </div>
                      <a href={editedVideo.arquivo_url} target="_blank" rel="noreferrer" title="Abrir vídeo">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? "Enviando..." : "Substituir arquivo"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadCloud className="h-4 w-4" />
                    {uploading ? "Enviando vídeo..." : "Enviar vídeo"}
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Status
                </Label>
                <Select
                  value={editedVideo.status}
                  onValueChange={(value) => setEditedVideo({ ...editedVideo, status: value })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Data de postagem
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 w-full justify-start text-left font-normal",
                        !editedVideo.data_postagem && "text-muted-foreground"
                      )}
                    >
                      {editedVideo.data_postagem
                        ? format(new Date(editedVideo.data_postagem), "dd/MM/yyyy", { locale: ptBR })
                        : "Selecionar data"}
                      <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={editedVideo.data_postagem ? new Date(editedVideo.data_postagem) : undefined}
                      onSelect={(date) => 
                        setEditedVideo({ 
                          ...editedVideo, 
                          data_postagem: date ? format(date, "yyyy-MM-dd") : null 
                        })
                      }
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Tags
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-auto min-h-9 w-full justify-start">
                      {videoTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tags
                            .filter((t) => videoTags.includes(t.id))
                            .map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                className={cn("text-xs", TAG_COLORS[tag.cor])}
                              >
                                {tag.nome}
                              </Badge>
                            ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Selecionar tags</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="start">
                    <div className="space-y-2">
                      {tags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-2">
                          <Checkbox
                            id={tag.id}
                            checked={videoTags.includes(tag.id)}
                            onCheckedChange={() => onTagToggle(tag.id)}
                          />
                          <label
                            htmlFor={tag.id}
                            className={cn(
                              "text-sm cursor-pointer px-2 py-0.5 rounded",
                              TAG_COLORS[tag.cor]
                            )}
                          >
                            {tag.nome}
                          </label>
                        </div>
                      ))}
                      {tags.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma tag criada</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Textarea
                  value={editedVideo.descricao || ""}
                  onChange={(e) => setEditedVideo({ ...editedVideo, descricao: e.target.value })}
                  placeholder="Adicione uma descrição..."
                  className="min-h-[120px] resize-none bg-muted/30"
                />
              </div>

              <Button onClick={handleSave} className="w-full">
                Salvar
              </Button>

              {relatedVideos.length > 0 && (
                <div className="space-y-3 border-t pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Cards em {statusLabel}
                    </Label>
                    <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                      {relatedVideos.length}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {relatedVideos.map((relatedVideo) => {
                      const isActive = relatedVideo.id === editedVideo.id;

                      return (
                        <button
                          key={relatedVideo.id}
                          type="button"
                          onClick={() => void handleSelectVideo(relatedVideo)}
                          className={cn(
                            "w-full rounded-md border border-border bg-muted/30 p-3 text-left transition-colors hover:bg-muted",
                            isActive && "border-primary bg-primary/10 text-primary"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-snug">
                              {relatedVideo.titulo}
                            </p>
                            {relatedVideo.roteiro && (
                              <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex-1 overflow-auto bg-muted/50 p-8">
          <div className="mx-auto min-h-[1056px] max-w-[816px] rounded-sm bg-background shadow-lg">
            <div className="flex min-h-[1056px] flex-col p-16">
              <SlashCommandTextarea
                value={editedVideo.roteiro || ""}
                onValueChange={(value) => setEditedVideo({ ...editedVideo, roteiro: value })}
                placeholder="Escreva o roteiro do vídeo... Use / para inserir itens do Núcleo de Influência ou // para Termos Virais"
                clienteId={editedVideo.cliente_id}
                className="min-h-[900px] flex-1 resize-none border-none bg-transparent p-0 text-lg leading-8 shadow-none focus-visible:ring-0"
                onSelectionChange={handleSelectionChange}
              />
              <div className="mt-auto border-t pt-4 text-right text-sm text-muted-foreground">
                {roteiroCharacterCount.toLocaleString("pt-BR")} caracteres
              </div>
            </div>
          </div>
        </main>

        {showChat && (
          <aside className="w-[400px] shrink-0 border-l bg-muted/20">
            <RoteiroChat
              clienteId={editedVideo.cliente_id}
              titulo={editedVideo.titulo}
              descricao={editedVideo.descricao || ""}
              onInsertText={handleInsertText}
              onReplaceText={handleReplaceText}
              onClearSelection={handleClearSelection}
              selectedContext={selectionContext ? { text: selectionContext.text, range: selectionContext.range } : undefined}
            />
          </aside>
        )}
      </div>
    </div>
  );
};
