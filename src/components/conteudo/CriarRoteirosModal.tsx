import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, MessageSquare, SkipForward, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SlashCommandTextarea, SelectionRange } from "./SlashCommandTextarea";
import { RoteiroChat } from "./RoteiroChat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Video {
  id: string;
  titulo: string;
  descricao?: string | null;
  roteiro?: string | null;
  status: string;
  cliente_id: string;
}

interface CriarRoteirosModalProps {
  videos: Video[];
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  clienteId: string;
  tableName: "videos_vertical" | "videos_youtube";
}

interface SelectionContext {
  text: string;
  range: SelectionRange;
}

export function CriarRoteirosModal({
  videos,
  open,
  onClose,
  onComplete,
  clienteId,
  tableName,
}: CriarRoteirosModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roteiros, setRoteiros] = useState<Record<string, string>>({});
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [showChat, setShowChat] = useState(false);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize roteiros and titulos from videos
  useEffect(() => {
    if (open && videos.length > 0) {
      const initialRoteiros: Record<string, string> = {};
      const initialTitulos: Record<string, string> = {};
      videos.forEach((v) => {
        initialRoteiros[v.id] = v.roteiro || "";
        initialTitulos[v.id] = v.titulo;
      });
      setRoteiros(initialRoteiros);
      setTitulos(initialTitulos);
      setCurrentIndex(0);
    }
  }, [open, videos]);

  const currentVideo = videos[currentIndex];
  const totalVideos = videos.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalVideos - 1;

  const handleRoteiroChange = (value: string) => {
    if (!currentVideo) return;
    setRoteiros((prev) => ({ ...prev, [currentVideo.id]: value }));
  };

  const handleTituloChange = (value: string) => {
    if (!currentVideo) return;
    setTitulos((prev) => ({ ...prev, [currentVideo.id]: value }));
  };

  const handleInsertText = (text: string) => {
    if (!currentVideo) return;
    const current = roteiros[currentVideo.id] || "";
    setRoteiros((prev) => ({ ...prev, [currentVideo.id]: current + "\n\n" + text }));
  };

  const handleReplaceText = (text: string, range: { start: number; end: number }) => {
    if (!currentVideo) return;
    const current = roteiros[currentVideo.id] || "";
    const newRoteiro = current.substring(0, range.start) + text + current.substring(range.end);
    setRoteiros((prev) => ({ ...prev, [currentVideo.id]: newRoteiro }));
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

  const saveCurrentVideo = async () => {
    if (!currentVideo) return false;
    
    const roteiro = roteiros[currentVideo.id];
    const titulo = titulos[currentVideo.id];
    const novoStatus = roteiro?.trim() ? "roteiro" : currentVideo.status;

    const { error } = await supabase
      .from(tableName)
      .update({
        titulo,
        roteiro: roteiro || null,
        status: novoStatus,
      })
      .eq("id", currentVideo.id);

    if (error) {
      toast.error("Erro ao salvar");
      return false;
    }
    return true;
  };

  const handleSaveAndNext = async () => {
    setSaving(true);
    const success = await saveCurrentVideo();
    setSaving(false);

    if (success) {
      if (isLast) {
        toast.success(`${totalVideos} roteiro(s) processado(s)!`);
        onComplete();
        onClose();
      } else {
        setCurrentIndex((prev) => prev + 1);
        setSelectionContext(null);
      }
    }
  };

  const handleSkip = () => {
    if (isLast) {
      onComplete();
      onClose();
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectionContext(null);
    }
  };

  const handlePrevious = () => {
    if (!isFirst) {
      setCurrentIndex((prev) => prev - 1);
      setSelectionContext(null);
    }
  };

  if (!currentVideo) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-lg">Criar Roteiros</DialogTitle>
              <Badge variant="secondary" className="font-mono">
                {currentIndex + 1} de {totalVideos}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showChat ? "default" : "outline"}
                size="sm"
                onClick={() => setShowChat(!showChat)}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Chat IA
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Left Column - Roteiro Editor */}
          <div className={cn("flex-1 flex flex-col min-h-0 p-6", showChat && "border-r")}>
            {/* Titulo */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm font-medium">Título</Label>
              <Input
                value={titulos[currentVideo.id] || ""}
                onChange={(e) => handleTituloChange(e.target.value)}
                placeholder="Título do vídeo"
                className="text-lg font-medium"
              />
            </div>

            {/* Roteiro */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              <Label className="text-sm font-medium">Roteiro</Label>
              <div className="flex-1 min-h-0">
                <SlashCommandTextarea
                  value={roteiros[currentVideo.id] || ""}
                  onValueChange={handleRoteiroChange}
                  placeholder="Escreva o roteiro do vídeo... Use / para inserir itens do Núcleo de Influência ou // para Termos Virais"
                  clienteId={clienteId}
                  className="h-full min-h-[300px]"
                  onSelectionChange={handleSelectionChange}
                />
              </div>
            </div>
          </div>

          {/* Right Column - AI Chat (conditional) */}
          {showChat && (
            <div className="w-[400px] flex flex-col min-h-0 bg-muted/20">
              <RoteiroChat
                clienteId={clienteId}
                titulo={titulos[currentVideo.id] || ""}
                descricao={currentVideo.descricao || ""}
                onInsertText={handleInsertText}
                onReplaceText={handleReplaceText}
                onClearSelection={handleClearSelection}
                selectedContext={selectionContext ? { text: selectionContext.text, range: selectionContext.range } : undefined}
              />
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t flex items-center justify-between shrink-0 bg-background">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirst}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="gap-2 text-muted-foreground"
            >
              <SkipForward className="h-4 w-4" />
              Pular
            </Button>
            <Button
              onClick={handleSaveAndNext}
              disabled={saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isLast ? "Salvar e Finalizar" : "Salvar e Próximo"}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
