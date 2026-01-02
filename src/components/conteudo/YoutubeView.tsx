import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Youtube, FileText, X, List, LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SlashCommandInput } from "./SlashCommandInput";
import { VideoItem } from "./VideoItem";
import { VideoDetailPanel } from "./VideoDetailPanel";
import { CriarRoteirosModal } from "./CriarRoteirosModal";
import { cn } from "@/lib/utils";

interface YoutubeViewProps {
  clienteId: string;
}

interface VideoYoutube {
  id: string;
  titulo: string;
  descricao: string | null;
  roteiro: string | null;
  status: string;
  ordem: number;
  data_postagem?: string | null;
  cliente_id: string;
  origem_plataforma?: string | null;
}

interface NovaIdeia {
  headline: string;
  descricao: string;
}

const createEmptyIdeia = (): NovaIdeia => ({
  headline: "",
  descricao: "",
});

const createEmptyIdeias = (): NovaIdeia[] => [createEmptyIdeia()];

const KANBAN_COLUMNS = [
  { id: "ideia", label: "Ideias de vídeos", color: "bg-card border-border", borderColor: "border-l-red-500" },
  { id: "roteiro", label: "Criando roteiro", color: "bg-card border-border", borderColor: "border-l-yellow-500" },
  { id: "gravacao", label: "Gravação", color: "bg-card border-border", borderColor: "border-l-purple-500" },
  { id: "edicao", label: "Em edição", color: "bg-card border-border", borderColor: "border-l-blue-500" },
  { id: "pronto", label: "Prontos para postar", color: "bg-card border-border", borderColor: "border-l-green-500" },
];

type ViewMode = "lista" | "quadro";

export function YoutubeView({ clienteId }: YoutubeViewProps) {
  const [videosKanban, setVideosKanban] = useState<VideoYoutube[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  
  // Nova ideia modal states
  const [showIdeiasModal, setShowIdeiasModal] = useState(false);
  const [novasIdeias, setNovasIdeias] = useState<NovaIdeia[]>(createEmptyIdeias());
  
  // Detail panel state
  const [selectedVideo, setSelectedVideo] = useState<VideoYoutube | null>(null);
  
  // Collapsible groups state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  
  // Multi-select for batch roteiro creation
  const [selectedForRoteiro, setSelectedForRoteiro] = useState<string[]>([]);
  const [showCriarRoteirosModal, setShowCriarRoteirosModal] = useState(false);

  useEffect(() => {
    fetchVideos();
  }, [clienteId]);

  const fetchVideos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("videos_youtube")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("ordem");

    if (data) {
      const videosWithClienteId = data.map(v => ({ ...v, cliente_id: clienteId }));
      setVideosKanban(videosWithClienteId);
    }
    setLoading(false);
  };

  const handleDeleteVideoKanban = async (id: string) => {
    const { error } = await supabase.from("videos_youtube").delete().eq("id", id);
    if (!error) {
      toast.success("Item removido");
      setSelectedVideo(null);
      fetchVideos();
    }
  };

  // Nova ideia functions
  const updateIdeia = (index: number, field: keyof NovaIdeia, value: string) => {
    setNovasIdeias((prev) =>
      prev.map((ideia, i) =>
        i === index ? { ...ideia, [field]: value } : ideia
      )
    );
  };

  const adicionarIdeias = async () => {
    const ideiasValidas = novasIdeias.filter((i) => i.headline.trim());
    if (ideiasValidas.length === 0) return;

    try {
      for (const ideia of ideiasValidas) {
        await supabase.from("videos_youtube").insert({
          cliente_id: clienteId,
          titulo: ideia.headline.trim(),
          descricao: ideia.descricao.trim() || null,
          status: "ideia",
          ordem: videosKanban.filter(v => v.status === "ideia").length + 1,
        });
      }

      setNovasIdeias(createEmptyIdeias());
      setShowIdeiasModal(false);
      toast.success(`${ideiasValidas.length} ideia(s) adicionada(s)!`);
      fetchVideos();
    } catch (error) {
      console.error("Erro ao adicionar ideias:", error);
      toast.error("Erro ao adicionar ideias");
    }
  };

  const openDetailPanel = (video: VideoYoutube) => {
    setSelectedVideo(video);
  };

  const handleSaveVideo = async (video: VideoYoutube) => {
    // Se está salvando roteiro e video está em "ideia", move para "roteiro"
    const novoStatus = video.roteiro?.trim() && video.status === "ideia" 
      ? "roteiro" 
      : video.status;

    const { error } = await supabase
      .from("videos_youtube")
      .update({
        titulo: video.titulo,
        descricao: video.descricao || null,
        roteiro: video.roteiro || null,
        status: novoStatus,
        data_postagem: video.data_postagem || null,
      })
      .eq("id", video.id);

    if (error) {
      toast.error("Erro ao salvar");
      return;
    }

    toast.success(novoStatus !== video.status 
      ? "Salvo! Movido para 'Criando roteiro'" 
      : "Salvo com sucesso!");
    setSelectedVideo(null);
    fetchVideos();
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { destination, draggableId } = result;
    
    const updatedVideos = [...videosKanban];
    const videoIndex = updatedVideos.findIndex(v => v.id === draggableId);
    if (videoIndex !== -1) {
      updatedVideos[videoIndex] = {
        ...updatedVideos[videoIndex],
        status: destination.droppableId,
      };
      setVideosKanban(updatedVideos);
    }

    const { error } = await supabase
      .from("videos_youtube")
      .update({ status: destination.droppableId })
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover item");
      fetchVideos();
    }
  };

  const getVideosByStatus = (status: string) => 
    videosKanban.filter(v => v.status === status);

  const handleVideoStatusChange = async (videoId: string, completed: boolean) => {
    const newStatus = completed ? "pronto" : "ideia";
    const { error } = await supabase
      .from("videos_youtube")
      .update({ status: newStatus })
      .eq("id", videoId);

    if (!error) {
      fetchVideos();
    }
  };

  // Transfer video to Vertical
  const handleTransferToVertical = async (video: VideoYoutube) => {
    try {
      // Insert into videos_vertical with origem_plataforma = "youtube"
      const { error: insertError } = await supabase.from("videos_vertical").insert({
        cliente_id: clienteId,
        titulo: video.titulo,
        descricao: video.descricao,
        roteiro: video.roteiro,
        status: video.status,
        ordem: 1,
        origem_plataforma: "youtube"
      });

      if (insertError) throw insertError;

      // Delete from videos_youtube
      const { error: deleteError } = await supabase
        .from("videos_youtube")
        .delete()
        .eq("id", video.id);

      if (deleteError) throw deleteError;

      toast.success("Ideia movida para Vertical!");
      fetchVideos();
    } catch (error) {
      console.error("Erro ao mover para Vertical:", error);
      toast.error("Erro ao mover para Vertical");
    }
  };

  // Group videos by status for list view
  const getGroupedVideos = () => {
    const groups: Record<string, VideoYoutube[]> = {};
    
    KANBAN_COLUMNS.forEach(col => {
      const videos = videosKanban.filter(v => v.status === col.id);
      if (videos.length > 0) {
        groups[col.id] = videos;
      }
    });
    
    return groups;
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getVideosForRoteiro = () => {
    return videosKanban.filter(v => selectedForRoteiro.includes(v.id));
  };

  const handleCriarRoteirosComplete = () => {
    setSelectedForRoteiro([]);
    fetchVideos();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header YouTube */}
      <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-xl border border-border">
        <div className="p-3 rounded-full bg-red-600">
          <Youtube className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">YouTube</h2>
          <p className="text-sm text-muted-foreground">Vídeos longos para o canal</p>
        </div>
      </div>

      {/* Pipeline Header with View Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pipeline de Vídeos</h3>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border rounded-md p-0.5 bg-muted/50">
            <Button
              variant={viewMode === "lista" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("lista")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "quadro" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("quadro")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {/* Criar Roteiros button */}
          {selectedForRoteiro.length > 0 && (
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => setShowCriarRoteirosModal(true)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Criar Roteiros ({selectedForRoteiro.length})
            </Button>
          )}

          {/* Nova ideia button */}
          <Button size="sm" onClick={() => setShowIdeiasModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova ideia
          </Button>
        </div>
      </div>

      {/* List View */}
      {viewMode === "lista" && (
        <div className="space-y-2 border rounded-lg p-4">
          {Object.entries(getGroupedVideos()).map(([status, videos]) => {
            const column = KANBAN_COLUMNS.find(c => c.id === status);
            const isOpen = openGroups[status] !== false; // default open
            
            return (
              <Collapsible key={status} open={isOpen} onOpenChange={() => toggleGroup(status)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 rounded-md transition-colors">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{column?.label || status}</span>
                  <span className={cn(
                    "text-sm",
                    videos.length > 0 ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {videos.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 max-h-[288px] overflow-y-auto scrollbar-thin">
                  {videos.map((video) => (
                    <VideoItem
                      key={video.id}
                      id={video.id}
                      titulo={video.titulo}
                      descricao={video.descricao}
                      roteiro={video.roteiro}
                      status={video.status}
                      origemPlataforma={video.origem_plataforma}
                      onClick={() => openDetailPanel(video)}
                      onStatusChange={(completed) => handleVideoStatusChange(video.id, completed)}
                      selectedForRoteiro={selectedForRoteiro.includes(video.id)}
                      onRoteiroSelectChange={(selected) => {
                        if (selected) {
                          setSelectedForRoteiro(prev => [...prev, video.id]);
                        } else {
                          setSelectedForRoteiro(prev => prev.filter(id => id !== video.id));
                        }
                      }}
                      onTransferPlatform={() => handleTransferToVertical(video)}
                      plataformaDestino="vertical"
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {videosKanban.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Nenhum vídeo na pipeline ainda
            </p>
          )}
        </div>
      )}

      {/* Kanban View */}
      {viewMode === "quadro" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((column) => (
              <div key={column.id} className={`flex-shrink-0 min-w-[260px] w-72 rounded-lg border p-3 ${column.color}`}>
                <h4 className="font-medium text-sm mb-3 flex items-center justify-between">
                  {column.label}
                  <span className="text-xs bg-background/50 px-2 py-0.5 rounded-full">
                    {getVideosByStatus(column.id).length}
                  </span>
                </h4>
                
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[300px] max-h-[400px] overflow-y-auto scrollbar-thin space-y-3 transition-colors rounded-md ${
                        snapshot.isDraggingOver ? "bg-primary/5" : ""
                      }`}
                    >
                      {getVideosByStatus(column.id).map((video, index) => (
                        <Draggable key={video.id} draggableId={video.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-secondary/50 border-l-4 ${column.borderColor} rounded-lg p-4 group cursor-pointer hover:opacity-90 transition-all ${
                                snapshot.isDragging ? "shadow-lg ring-2 ring-primary" : ""
                              }`}
                              onClick={() => openDetailPanel(video)}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-base leading-snug">{video.titulo}</p>
                                  
                                  {video.descricao && (
                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                      {video.descricao}
                                    </p>
                                  )}
                                  {video.roteiro && (
                                    <div className="mt-3">
                                      <FileText className="h-4 w-4 text-red-500" />
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteVideoKanban(video.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Modal de novas ideias */}
      <Dialog open={showIdeiasModal} onOpenChange={setShowIdeiasModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Novas ideias de vídeo YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2 max-h-[55vh]">
            {novasIdeias.map((ideia, index) => (
              <div key={index} className="p-4 border rounded-lg bg-muted/30 space-y-4 relative">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (novasIdeias.length > 1) {
                      setNovasIdeias((prev) => prev.filter((_, i) => i !== index));
                    }
                  }}
                  disabled={novasIdeias.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>

                <div className="space-y-4 pr-8">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Título do vídeo</Label>
                    <SlashCommandInput
                      clienteId={clienteId}
                      value={ideia.headline}
                      onValueChange={(val) => updateIdeia(index, "headline", val)}
                      placeholder="Ex: Como criar uma rotina matinal (use / para inserir do núcleo)"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Descrição (opcional)</Label>
                    <Textarea
                      value={ideia.descricao}
                      onChange={(e) => updateIdeia(index, "descricao", e.target.value)}
                      placeholder="Descreva a ideia do vídeo..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setNovasIdeias((prev) => [...prev, createEmptyIdeia()])}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar mais uma linha
          </Button>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowIdeiasModal(false); setNovasIdeias(createEmptyIdeias()); }}>
              Cancelar
            </Button>
            <Button onClick={adicionarIdeias} className="bg-red-600 hover:bg-red-700">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Detail Panel */}
      <VideoDetailPanel
        video={selectedVideo}
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onSave={handleSaveVideo}
        onDelete={handleDeleteVideoKanban}
        tags={[]}
        videoTags={[]}
        onTagToggle={() => {}}
        platform="youtube"
      />

      {/* Criar Roteiros Modal */}
      <CriarRoteirosModal
        videos={getVideosForRoteiro()}
        open={showCriarRoteirosModal}
        onClose={() => setShowCriarRoteirosModal(false)}
        onComplete={handleCriarRoteirosComplete}
        clienteId={clienteId}
        tableName="videos_youtube"
      />
    </div>
  );
}
