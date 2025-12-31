import { useState, useEffect } from "react";
import { X, Trash2, Sparkles, Calendar, Tag, FileText, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { VideoStatusBadge } from "./VideoStatusBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
}

interface VideoDetailPanelProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
  onSave: (video: Video) => void;
  onDelete: (id: string) => void;
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
  onDelete,
  tags,
  videoTags,
  onTagToggle,
  platform,
}: VideoDetailPanelProps) => {
  const [editedVideo, setEditedVideo] = useState<Video | null>(null);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);

  useEffect(() => {
    if (video) {
      setEditedVideo({ ...video });
    }
  }, [video]);

  if (!editedVideo) return null;

  const handleSave = () => {
    if (editedVideo) {
      onSave(editedVideo);
    }
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

  const handleSelectionChange = (text: string | null, range: SelectionRange | null) => {
    if (text && range) {
      setSelectionContext({ text, range });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-6xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Vídeo
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(editedVideo.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 flex min-h-0">
          {/* Left Column - Video Details */}
          <div className="flex-1 flex flex-col min-h-0 border-r">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Title */}
                <div className="space-y-2">
                  <Input
                    value={editedVideo.titulo}
                    onChange={(e) => setEditedVideo({ ...editedVideo, titulo: e.target.value })}
                    className="text-lg font-semibold border-none px-0 focus-visible:ring-0 bg-transparent"
                    placeholder="Título do vídeo"
                  />
                </div>

                {/* Properties Grid */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  {/* Status */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Status
                    </Label>
                    <Select
                      value={editedVideo.status}
                      onValueChange={(value) => setEditedVideo({ ...editedVideo, status: value })}
                    >
                      <SelectTrigger className="h-8">
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

                  {/* Data de Postagem */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Data de Postagem
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 w-full justify-start text-left font-normal",
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

                  {/* Tags */}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Tags
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-full justify-start">
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

                  {/* Escalado */}
                  {editedVideo.escalado && (
                    <div className="col-span-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Vídeo escalado
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Descrição</Label>
                  <Textarea
                    value={editedVideo.descricao || ""}
                    onChange={(e) => setEditedVideo({ ...editedVideo, descricao: e.target.value })}
                    placeholder="Adicione uma descrição..."
                    className="min-h-[80px] resize-none"
                  />
                </div>

                {/* Roteiro */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Roteiro</Label>
                  <SlashCommandTextarea
                    value={editedVideo.roteiro || ""}
                    onValueChange={(value) => setEditedVideo({ ...editedVideo, roteiro: value })}
                    placeholder="Escreva o roteiro do vídeo... Use / para inserir itens do Núcleo de Influência ou // para Termos Virais"
                    clienteId={editedVideo.cliente_id}
                    className="min-h-[300px]"
                    onSelectionChange={handleSelectionChange}
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="p-4 border-t flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>

          {/* Right Column - AI Chat */}
          <div className="w-[400px] flex flex-col min-h-0 bg-muted/20">
            <RoteiroChat
              clienteId={editedVideo.cliente_id}
              titulo={editedVideo.titulo}
              descricao={editedVideo.descricao || ""}
              onInsertText={handleInsertText}
              onReplaceText={handleReplaceText}
              onClearSelection={handleClearSelection}
              selectedContext={selectionContext ? { text: selectionContext.text, range: selectionContext.range } : undefined}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
