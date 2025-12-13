import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, GripVertical, Instagram, Sparkles, Check, MessageSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface VerticalViewProps {
  clienteId: string;
}

interface VideoReferencia {
  id: string;
  titulo: string;
  thumbnail_url: string | null;
  link_video: string | null;
  plataforma: string;
  ordem: number;
}

interface VideoVertical {
  id: string;
  titulo: string;
  descricao: string | null;
  roteiro: string | null;
  status: string;
  ordem: number;
}

const KANBAN_COLUMNS = [
  { id: "ideia", label: "Ideias de vídeos", color: "bg-blue-500/10 border-blue-500/30", borderColor: "border-l-blue-500" },
  { id: "roteiro", label: "Criando roteiro", color: "bg-yellow-500/10 border-yellow-500/30", borderColor: "border-l-yellow-500" },
  { id: "gravacao", label: "Gravação", color: "bg-purple-500/10 border-purple-500/30", borderColor: "border-l-purple-500" },
  { id: "pronto", label: "Prontos para postar", color: "bg-green-500/10 border-green-500/30", borderColor: "border-l-green-500" },
];

export function VerticalView({ clienteId }: VerticalViewProps) {
  const [videosReferencia, setVideosReferencia] = useState<VideoReferencia[]>([]);
  const [videosKanban, setVideosKanban] = useState<VideoVertical[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [novoVideoRef, setNovoVideoRef] = useState({ titulo: "", link_video: "", thumbnail_url: "" });
  const [novoVideoKanban, setNovoVideoKanban] = useState({ titulo: "", descricao: "" });
  const [dialogRefOpen, setDialogRefOpen] = useState(false);
  const [dialogKanbanOpen, setDialogKanbanOpen] = useState(false);
  
  // Edit roteiro states
  const [editingVideo, setEditingVideo] = useState<VideoVertical | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editRoteiro, setEditRoteiro] = useState("");

  useEffect(() => {
    fetchVideos();
  }, [clienteId]);

  const fetchVideos = async () => {
    setLoading(true);
    const [refResult, kanbanResult] = await Promise.all([
      supabase
        .from("videos_referencia")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("ordem"),
      supabase
        .from("videos_vertical")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("ordem"),
    ]);

    if (refResult.data) setVideosReferencia(refResult.data);
    if (kanbanResult.data) setVideosKanban(kanbanResult.data);
    setLoading(false);
  };

  const handleAddVideoRef = async () => {
    if (!novoVideoRef.titulo.trim()) return;
    
    const { error } = await supabase.from("videos_referencia").insert({
      cliente_id: clienteId,
      titulo: novoVideoRef.titulo,
      link_video: novoVideoRef.link_video || null,
      thumbnail_url: novoVideoRef.thumbnail_url || null,
      ordem: videosReferencia.length + 1,
    });

    if (error) {
      toast.error("Erro ao adicionar vídeo");
      return;
    }

    toast.success("Vídeo adicionado!");
    setNovoVideoRef({ titulo: "", link_video: "", thumbnail_url: "" });
    setDialogRefOpen(false);
    fetchVideos();
  };

  const handleDeleteVideoRef = async (id: string) => {
    const { error } = await supabase.from("videos_referencia").delete().eq("id", id);
    if (!error) {
      toast.success("Vídeo removido");
      fetchVideos();
    }
  };

  const handleAddVideoKanban = async () => {
    if (!novoVideoKanban.titulo.trim()) return;
    
    const { error } = await supabase.from("videos_vertical").insert({
      cliente_id: clienteId,
      titulo: novoVideoKanban.titulo,
      descricao: novoVideoKanban.descricao || null,
      status: "ideia",
      ordem: videosKanban.filter(v => v.status === "ideia").length + 1,
    });

    if (error) {
      toast.error("Erro ao adicionar ideia");
      return;
    }

    toast.success("Ideia adicionada!");
    setNovoVideoKanban({ titulo: "", descricao: "" });
    setDialogKanbanOpen(false);
    fetchVideos();
  };

  const handleDeleteVideoKanban = async (id: string) => {
    const { error } = await supabase.from("videos_vertical").delete().eq("id", id);
    if (!error) {
      toast.success("Item removido");
      fetchVideos();
    }
  };

  const openEditModal = (video: VideoVertical) => {
    setEditingVideo(video);
    setEditTitulo(video.titulo);
    setEditDescricao(video.descricao || "");
    setEditRoteiro(video.roteiro || "");
  };

  const handleSaveRoteiro = async () => {
    if (!editingVideo) return;

    // Se está salvando roteiro e video está em "ideia", move para "roteiro"
    const novoStatus = editRoteiro.trim() && editingVideo.status === "ideia" 
      ? "roteiro" 
      : editingVideo.status;

    const { error } = await supabase
      .from("videos_vertical")
      .update({
        titulo: editTitulo,
        descricao: editDescricao || null,
        roteiro: editRoteiro || null,
        status: novoStatus,
      })
      .eq("id", editingVideo.id);

    if (error) {
      toast.error("Erro ao salvar");
      return;
    }

    toast.success(novoStatus !== editingVideo.status 
      ? "Roteiro salvo! Movido para 'Criando roteiro'" 
      : "Salvo com sucesso!");
    setEditingVideo(null);
    fetchVideos();
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    // Update local state immediately
    const updatedVideos = [...videosKanban];
    const videoIndex = updatedVideos.findIndex(v => v.id === draggableId);
    if (videoIndex !== -1) {
      updatedVideos[videoIndex] = {
        ...updatedVideos[videoIndex],
        status: destination.droppableId,
      };
      setVideosKanban(updatedVideos);
    }

    // Update database
    const { error } = await supabase
      .from("videos_vertical")
      .update({ status: destination.droppableId })
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover item");
      fetchVideos(); // Revert on error
    }
  };

  const toggleVideoSelection = (id: string) => {
    setSelectedVideos(prev => 
      prev.includes(id) 
        ? prev.filter(v => v !== id)
        : [...prev, id]
    );
  };

  const handleEscalar = () => {
    if (selectedVideos.length === 0) {
      toast.error("Selecione pelo menos um vídeo");
      return;
    }
    
    // Create ideas from selected videos
    const selectedVideoData = videosReferencia.filter(v => selectedVideos.includes(v.id));
    selectedVideoData.forEach(async (video) => {
      await supabase.from("videos_vertical").insert({
        cliente_id: clienteId,
        titulo: `Baseado em: ${video.titulo}`,
        descricao: video.link_video ? `Referência: ${video.link_video}` : null,
        status: "ideia",
        ordem: videosKanban.filter(v => v.status === "ideia").length + 1,
      });
    });

    toast.success(`${selectedVideos.length} ideia(s) criada(s) no Kanban!`);
    setSelectedVideos([]);
    fetchVideos();
  };

  const getVideosByStatus = (status: string) => 
    videosKanban.filter(v => v.status === status);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header Instagram */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-orange-500/10 rounded-xl border border-border">
        <div className="p-3 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-orange-500">
          <Instagram className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Instagram</h2>
          <p className="text-sm text-muted-foreground">Conteúdo vertical para reels e stories</p>
        </div>
      </div>

      {/* Vídeos que performaram */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Vídeos que performaram</CardTitle>
          <div className="flex gap-2">
            {selectedVideos.length > 0 && (
              <Button onClick={handleEscalar} size="sm" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Escalar ({selectedVideos.length})
              </Button>
            )}
            <Dialog open={dialogRefOpen} onOpenChange={setDialogRefOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar vídeo de referência</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Título do vídeo"
                    value={novoVideoRef.titulo}
                    onChange={e => setNovoVideoRef(prev => ({ ...prev, titulo: e.target.value }))}
                  />
                  <Input
                    placeholder="Link do vídeo (opcional)"
                    value={novoVideoRef.link_video}
                    onChange={e => setNovoVideoRef(prev => ({ ...prev, link_video: e.target.value }))}
                  />
                  <Input
                    placeholder="URL da thumbnail (opcional)"
                    value={novoVideoRef.thumbnail_url}
                    onChange={e => setNovoVideoRef(prev => ({ ...prev, thumbnail_url: e.target.value }))}
                  />
                  <Button onClick={handleAddVideoRef} className="w-full">Adicionar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {videosReferencia.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum vídeo adicionado ainda
            </p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {videosReferencia.map((video) => (
                <div
                  key={video.id}
                  className={`relative flex-shrink-0 w-32 group cursor-pointer ${
                    selectedVideos.includes(video.id) ? "ring-2 ring-primary rounded-lg" : ""
                  }`}
                  onClick={() => toggleVideoSelection(video.id)}
                >
                  <div className="aspect-[9/16] bg-muted rounded-lg overflow-hidden relative">
                    {video.thumbnail_url ? (
                      <img 
                        src={video.thumbnail_url} 
                        alt={video.titulo}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                        <Instagram className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Checkbox overlay */}
                    <div className="absolute top-2 left-2">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedVideos.includes(video.id) 
                          ? "bg-primary border-primary" 
                          : "bg-background/80 border-muted-foreground/50"
                      }`}>
                        {selectedVideos.includes(video.id) && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Actions overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-end gap-1">
                        {video.link_video && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-white hover:bg-white/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(video.link_video!, "_blank");
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-white hover:bg-white/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVideoRef(video.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-medium truncate">{video.titulo}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Pipeline de Vídeos</h3>
          <Dialog open={dialogKanbanOpen} onOpenChange={setDialogKanbanOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nova ideia
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova ideia de vídeo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Título da ideia"
                  value={novoVideoKanban.titulo}
                  onChange={e => setNovoVideoKanban(prev => ({ ...prev, titulo: e.target.value }))}
                />
                <Textarea
                  placeholder="Descrição (opcional)"
                  value={novoVideoKanban.descricao}
                  onChange={e => setNovoVideoKanban(prev => ({ ...prev, descricao: e.target.value }))}
                />
                <Button onClick={handleAddVideoKanban} className="w-full">Adicionar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

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
                      className={`min-h-[300px] space-y-3 transition-colors rounded-md ${
                        snapshot.isDraggingOver ? "bg-primary/5" : ""
                      }`}
                    >
                      {getVideosByStatus(column.id).map((video, index) => (
                        <Draggable key={video.id} draggableId={video.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-card border-l-4 ${column.borderColor} rounded-lg p-4 group cursor-pointer hover:bg-muted/50 transition-colors ${
                                snapshot.isDragging ? "shadow-lg ring-2 ring-primary" : ""
                              }`}
                              onClick={() => openEditModal(video)}
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
                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                                      {video.descricao}
                                    </p>
                                  )}
                                  {video.roteiro && (
                                    <div className="mt-3">
                                      <MessageSquare className="h-5 w-5 text-blue-500" />
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
      </div>

      {/* Modal de edição de roteiro */}
      <Dialog open={!!editingVideo} onOpenChange={(open) => !open && setEditingVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar ideia de vídeo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                placeholder="Título do vídeo"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
                placeholder="Descrição do vídeo..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Roteiro</label>
              <Textarea
                value={editRoteiro}
                onChange={(e) => setEditRoteiro(e.target.value)}
                placeholder="Escreva o roteiro do vídeo aqui..."
                className="font-mono text-sm min-h-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ao salvar um roteiro, o vídeo será movido automaticamente para "Criando roteiro"
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingVideo(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveRoteiro}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
