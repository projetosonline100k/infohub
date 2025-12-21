import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Youtube, MessageSquare, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SlashCommandInput } from "./SlashCommandInput";
import { SlashCommandTextarea } from "./SlashCommandTextarea";
import { RoteiroChat } from "./RoteiroChat";

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

export function YoutubeView({ clienteId }: YoutubeViewProps) {
  const [videosKanban, setVideosKanban] = useState<VideoYoutube[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Nova ideia modal states
  const [showIdeiasModal, setShowIdeiasModal] = useState(false);
  const [novasIdeias, setNovasIdeias] = useState<NovaIdeia[]>(createEmptyIdeias());
  
  // Edit roteiro states
  const [editingVideo, setEditingVideo] = useState<VideoYoutube | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editRoteiro, setEditRoteiro] = useState("");

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

    if (data) setVideosKanban(data);
    setLoading(false);
  };

  const handleDeleteVideoKanban = async (id: string) => {
    const { error } = await supabase.from("videos_youtube").delete().eq("id", id);
    if (!error) {
      toast.success("Item removido");
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

  const openEditModal = (video: VideoYoutube) => {
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
      .from("videos_youtube")
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
      .from("videos_youtube")
      .update({ status: destination.droppableId })
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover item");
      fetchVideos(); // Revert on error
    }
  };

  const getVideosByStatus = (status: string) => 
    videosKanban.filter(v => v.status === status);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-8">
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

      {/* Kanban Board */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Pipeline de Vídeos</h3>
          <Button size="sm" onClick={() => setShowIdeiasModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova ideia
          </Button>
        </div>

        {/* Modal de novas ideias */}
        <Dialog open={showIdeiasModal} onOpenChange={setShowIdeiasModal}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Novas ideias de vídeo YouTube</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2 max-h-[55vh]">
              {novasIdeias.map((ideia, index) => (
                <div key={index} className="p-4 border rounded-lg bg-muted/30 space-y-4 relative">
                  {/* Botão remover */}
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
                              className={`bg-secondary/50 border-l-4 ${column.borderColor} rounded-lg p-4 group cursor-pointer hover:opacity-90 transition-all ${
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
                                      <MessageSquare className="h-5 w-5 text-red-500" />
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

      {/* Modal de edição de roteiro com Chat IA */}
      <Dialog open={!!editingVideo} onOpenChange={(open) => !open && setEditingVideo(null)}>
        <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              Editar vídeo YouTube
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-6 flex-1 min-h-0">
            {/* Coluna esquerda - Campos de edição */}
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              <div>
                <label className="text-sm font-medium">Título</label>
                <SlashCommandInput
                  clienteId={clienteId}
                  value={editTitulo}
                  onValueChange={setEditTitulo}
                  placeholder="Título do vídeo (use / para inserir do núcleo)"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  placeholder="Descrição do vídeo..."
                  rows={3}
                />
              </div>
              
              <div className="flex-1">
                <label className="text-sm font-medium">Roteiro</label>
                <SlashCommandTextarea
                  clienteId={clienteId}
                  value={editRoteiro}
                  onValueChange={setEditRoteiro}
                  placeholder="Escreva o roteiro do vídeo aqui... (use / para inserir do núcleo)"
                  className="font-mono text-sm min-h-[250px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ao salvar um roteiro, o vídeo será movido automaticamente para "Criando roteiro"
                </p>
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setEditingVideo(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveRoteiro} className="bg-red-600 hover:bg-red-700">Salvar</Button>
              </div>
            </div>

            {/* Coluna direita - Chat IA */}
            <div className="w-[400px] shrink-0 border-l pl-6">
              <RoteiroChat
                clienteId={clienteId}
                titulo={editTitulo}
                descricao={editDescricao}
                onInsertText={(text) => setEditRoteiro(prev => prev ? prev + "\n\n" + text : text)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
