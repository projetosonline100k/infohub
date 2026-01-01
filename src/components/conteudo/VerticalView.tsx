import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Instagram, Youtube, Sparkles, Check, FileText, Tag, X, List, LayoutGrid, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SlashCommandInput } from "./SlashCommandInput";
import { VideoItem } from "./VideoItem";
import { VideoDetailPanel } from "./VideoDetailPanel";
import { VideoStatusBadge } from "./VideoStatusBadge";
import { CriarRoteirosModal } from "./CriarRoteirosModal";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO, isToday, startOfMonth, endOfMonth, addMonths, subMonths, startOfYear, endOfYear, addYears, subYears, getWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  escalado?: boolean;
  referencia_id?: string | null;
  data_postagem?: string | null;
  cliente_id: string;
}

interface EscalarItem {
  id: string;
  tituloOriginal: string;
  novaHeadline: string;
}

interface TagVideo {
  id: string;
  nome: string;
  cor: string;
}

interface VideoTagRelation {
  video_id: string;
  tag_id: string;
}

interface NovaIdeia {
  headline: string;
  link: string;
  plataforma: "instagram" | "youtube" | "";
  descricao: string;
}

const createEmptyIdeia = (): NovaIdeia => ({
  headline: "",
  link: "",
  plataforma: "",
  descricao: "",
});

const createEmptyIdeias = (): NovaIdeia[] => [createEmptyIdeia()];

const KANBAN_COLUMNS = [
  { id: "ideia", label: "Ideias de vídeos", color: "bg-card border-border", borderColor: "border-l-blue-500" },
  { id: "roteiro", label: "Criando roteiro", color: "bg-card border-border", borderColor: "border-l-yellow-500" },
  { id: "gravacao", label: "Gravação", color: "bg-card border-border", borderColor: "border-l-purple-500" },
  { id: "pronto", label: "Prontos para postar", color: "bg-card border-border", borderColor: "border-l-green-500" },
];

const TAG_COLORS = [
  { id: "blue", label: "Azul", class: "bg-blue-500" },
  { id: "green", label: "Verde", class: "bg-green-500" },
  { id: "red", label: "Vermelho", class: "bg-red-500" },
  { id: "purple", label: "Roxo", class: "bg-purple-500" },
  { id: "orange", label: "Laranja", class: "bg-orange-500" },
  { id: "pink", label: "Rosa", class: "bg-pink-500" },
  { id: "yellow", label: "Amarelo", class: "bg-yellow-500" },
  { id: "cyan", label: "Ciano", class: "bg-cyan-500" },
];

const getTagColorClass = (cor: string) => {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
    green: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
    red: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
    purple: "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
    orange: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
    pink: "bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30",
    yellow: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
    cyan: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  };
  return colorMap[cor] || colorMap.blue;
};

type ViewMode = "lista" | "quadro";
type PeriodoFiltro = "semana" | "mes" | "ano";

export function VerticalView({ clienteId }: VerticalViewProps) {
  const [videosReferencia, setVideosReferencia] = useState<VideoReferencia[]>([]);
  const [videosKanban, setVideosKanban] = useState<VideoVertical[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>("semana");
  const [dataReferencia, setDataReferencia] = useState(new Date());
  
  // Tags state
  const [tags, setTags] = useState<TagVideo[]>([]);
  const [videoTags, setVideoTags] = useState<VideoTagRelation[]>([]);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [novaTag, setNovaTag] = useState({ nome: "", cor: "blue" });
  
  // Form states
  const [novoVideoRef, setNovoVideoRef] = useState({ titulo: "", link_video: "", thumbnail_url: "" });
  const [dialogRefOpen, setDialogRefOpen] = useState(false);
  
  // Nova ideia modal states
  const [showIdeiasModal, setShowIdeiasModal] = useState(false);
  const [novasIdeias, setNovasIdeias] = useState<NovaIdeia[]>(createEmptyIdeias());
  
  // Escalar modal states
  const [showEscalarModal, setShowEscalarModal] = useState(false);
  const [escalarItems, setEscalarItems] = useState<EscalarItem[]>([]);
  const [escalarTabAtivo, setEscalarTabAtivo] = useState(0);
  
  // Detail panel state
  const [selectedVideo, setSelectedVideo] = useState<VideoVertical | null>(null);
  const [editVideoTags, setEditVideoTags] = useState<string[]>([]);
  
  // Collapsible groups state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  
  // Multi-select for batch roteiro creation
  const [selectedForRoteiro, setSelectedForRoteiro] = useState<string[]>([]);
  const [showCriarRoteirosModal, setShowCriarRoteirosModal] = useState(false);

  useEffect(() => {
    fetchVideos();
    fetchTags();
  }, [clienteId]);

  const fetchVideos = async () => {
    setLoading(true);
    const [refResult, kanbanResult, videoTagsResult] = await Promise.all([
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
      supabase
        .from("videos_vertical_tags")
        .select("video_id, tag_id"),
    ]);

    if (refResult.data) setVideosReferencia(refResult.data);
    if (kanbanResult.data) {
      const videosWithClienteId = kanbanResult.data.map(v => ({ ...v, cliente_id: clienteId }));
      setVideosKanban(videosWithClienteId);
    }
    if (videoTagsResult.data) setVideoTags(videoTagsResult.data);
    setLoading(false);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from("tags_video")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at");
    
    if (data) setTags(data);
  };

  const handleAddTag = async () => {
    if (!novaTag.nome.trim()) return;
    
    const { error } = await supabase.from("tags_video").insert({
      cliente_id: clienteId,
      nome: novaTag.nome,
      cor: novaTag.cor,
    });

    if (error) {
      toast.error("Erro ao criar tag");
      return;
    }

    toast.success("Tag criada!");
    setNovaTag({ nome: "", cor: "blue" });
    fetchTags();
  };

  const handleDeleteTag = async (tagId: string) => {
    const { error } = await supabase.from("tags_video").delete().eq("id", tagId);
    if (!error) {
      toast.success("Tag removida");
      fetchTags();
      fetchVideos();
    }
  };

  const getVideoTagIds = (videoId: string): string[] => {
    return videoTags
      .filter(vt => vt.video_id === videoId)
      .map(vt => vt.tag_id);
  };

  const getTagsForVideo = (videoId: string): TagVideo[] => {
    const tagIds = getVideoTagIds(videoId);
    return tags.filter(t => tagIds.includes(t.id));
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

  const handleDeleteVideoKanban = async (id: string) => {
    const { error } = await supabase.from("videos_vertical").delete().eq("id", id);
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
        const plataformas = ideia.plataforma ? [ideia.plataforma] : [];

        await supabase
          .from("ideias_conteudo")
          .insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            plataformas: plataformas,
            link_referencia: ideia.link.trim() || null,
          });

        if (ideia.plataforma === "instagram") {
          await supabase.from("videos_vertical").insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            status: "ideia",
            ordem: videosKanban.filter(v => v.status === "ideia").length + 1,
          });
        }

        if (ideia.plataforma === "youtube") {
          await supabase.from("videos_youtube").insert({
            cliente_id: clienteId,
            titulo: ideia.headline.trim(),
            descricao: ideia.descricao.trim() || null,
            status: "ideia",
            ordem: 1,
          });
        }
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

  const openDetailPanel = (video: VideoVertical) => {
    setSelectedVideo(video);
    setEditVideoTags(getVideoTagIds(video.id));
  };

  const toggleVideoTag = (tagId: string) => {
    setEditVideoTags(prev => 
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSaveVideo = async (video: VideoVertical) => {
    // Se está salvando roteiro e video está em "ideia", move para "roteiro"
    const novoStatus = video.roteiro?.trim() && video.status === "ideia" 
      ? "roteiro" 
      : video.status;

    const { error } = await supabase
      .from("videos_vertical")
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

    // Update tags
    await supabase
      .from("videos_vertical_tags")
      .delete()
      .eq("video_id", video.id);

    if (editVideoTags.length > 0) {
      await supabase.from("videos_vertical_tags").insert(
        editVideoTags.map(tagId => ({
          video_id: video.id,
          tag_id: tagId,
        }))
      );
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
      .from("videos_vertical")
      .update({ status: destination.droppableId })
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover item");
      fetchVideos();
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
    
    const selectedVideoData = videosReferencia.filter(v => selectedVideos.includes(v.id));
    const items: EscalarItem[] = selectedVideoData.map(video => ({
      id: video.id,
      tituloOriginal: video.titulo,
      novaHeadline: video.titulo,
    }));
    
    setEscalarItems(items);
    setEscalarTabAtivo(0);
    setShowEscalarModal(true);
  };

  const handleSalvarEscalar = async () => {
    try {
      for (const item of escalarItems) {
        await supabase.from("videos_vertical").insert({
          cliente_id: clienteId,
          titulo: item.novaHeadline.trim() || item.tituloOriginal,
          status: "ideia",
          ordem: videosKanban.filter(v => v.status === "ideia").length + 1,
          escalado: true,
          referencia_id: item.id,
        });
      }

      toast.success(`${escalarItems.length} ideia(s) escalada(s)!`);
      setShowEscalarModal(false);
      setSelectedVideos([]);
      setEscalarItems([]);
      fetchVideos();
    } catch (error) {
      console.error("Erro ao escalar:", error);
      toast.error("Erro ao escalar vídeos");
    }
  };

  const updateEscalarHeadline = (index: number, value: string) => {
    setEscalarItems(prev => 
      prev.map((item, i) => i === index ? { ...item, novaHeadline: value } : item)
    );
  };

  const getVideosByStatus = (status: string) => 
    videosKanban.filter(v => v.status === status);

  const handleVideoStatusChange = async (videoId: string, completed: boolean) => {
    const newStatus = completed ? "pronto" : "ideia";
    const { error } = await supabase
      .from("videos_vertical")
      .update({ status: newStatus })
      .eq("id", videoId);

    if (!error) {
      fetchVideos();
    }
  };

  // Period navigation
  const navegarPeriodo = (direcao: "anterior" | "proximo") => {
    if (periodoFiltro === "semana") {
      setDataReferencia(prev => direcao === "anterior" ? subWeeks(prev, 1) : addWeeks(prev, 1));
    } else if (periodoFiltro === "mes") {
      setDataReferencia(prev => direcao === "anterior" ? subMonths(prev, 1) : addMonths(prev, 1));
    } else {
      setDataReferencia(prev => direcao === "anterior" ? subYears(prev, 1) : addYears(prev, 1));
    }
  };

  const getPeriodoLabel = () => {
    if (periodoFiltro === "semana") {
      const inicio = startOfWeek(dataReferencia, { weekStartsOn: 1 });
      const fim = endOfWeek(dataReferencia, { weekStartsOn: 1 });
      return `${format(inicio, "dd/MM")} - ${format(fim, "dd/MM/yyyy")}`;
    } else if (periodoFiltro === "mes") {
      return format(dataReferencia, "MMMM yyyy", { locale: ptBR });
    } else {
      return format(dataReferencia, "yyyy");
    }
  };

  // Group videos by status for list view
  const getGroupedVideos = () => {
    const groups: Record<string, VideoVertical[]> = {};
    
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

  const toggleRoteiroSelection = (videoId: string) => {
    setSelectedForRoteiro(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
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
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-base">Vídeos que performaram</CardTitle>
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
        <CardContent className="pt-0">
          {videosReferencia.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">
              Nenhum vídeo adicionado ainda
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {videosReferencia.map((video) => (
                <div
                  key={video.id}
                  className={`relative flex-shrink-0 w-32 group ${
                    selectedVideos.includes(video.id) ? "ring-2 ring-primary rounded-lg" : ""
                  }`}
                >
                  <div 
                    className={`aspect-square bg-muted rounded-lg overflow-hidden relative ${
                      video.link_video ? "cursor-pointer hover:opacity-90 transition-opacity" : ""
                    }`}
                    onClick={() => {
                      if (video.link_video) {
                        window.open(video.link_video, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    {video.thumbnail_url ? (
                      <img 
                        src={video.thumbnail_url} 
                        alt={video.titulo}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-500/20 to-purple-500/20">
                        <Instagram className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div 
                      className="absolute top-1.5 left-1.5 cursor-pointer z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoSelection(video.id);
                      }}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedVideos.includes(video.id) 
                          ? "bg-primary border-primary" 
                          : "bg-background/80 border-muted-foreground/50 hover:border-primary/50"
                      }`}>
                        {selectedVideos.includes(video.id) && (
                          <Check className="h-3 w-3 text-primary-foreground" />
                        )}
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-white hover:bg-white/20"
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
                  <p className="mt-1.5 text-xs font-medium line-clamp-2 leading-tight">{video.titulo}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

          {/* Tags button */}
          <Dialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Tag className="h-4 w-4 mr-1" />
                Tags
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Gerenciar Tags</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome da tag"
                    value={novaTag.nome}
                    onChange={e => setNovaTag(prev => ({ ...prev, nome: e.target.value }))}
                    className="flex-1"
                  />
                  <Button onClick={handleAddTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setNovaTag(prev => ({ ...prev, cor: color.id }))}
                      className={`w-8 h-8 rounded-full ${color.class} transition-all ${
                        novaTag.cor === color.id ? "ring-2 ring-offset-2 ring-primary" : ""
                      }`}
                      title={color.label}
                    />
                  ))}
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-3">Tags existentes:</p>
                  {tags.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma tag criada ainda
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <div
                          key={tag.id}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border ${getTagColorClass(tag.cor)}`}
                        >
                          {tag.nome}
                          <button
                            onClick={() => handleDeleteTag(tag.id)}
                            className="ml-1 hover:opacity-70"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

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
                <CollapsibleContent className="pl-4">
                  {videos.map((video) => (
                    <VideoItem
                      key={video.id}
                      id={video.id}
                      titulo={video.titulo}
                      descricao={video.descricao}
                      roteiro={video.roteiro}
                      status={video.status}
                      escalado={video.escalado}
                      tags={getTagsForVideo(video.id)}
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
                      className={`min-h-[300px] space-y-3 transition-colors rounded-md ${
                        snapshot.isDraggingOver ? "bg-primary/5" : ""
                      }`}
                    >
                      {getVideosByStatus(column.id).map((video, index) => {
                        const isEscalado = video.escalado === true;
                        const cardBorderClass = isEscalado ? "border-l-primary" : column.borderColor;
                        const cardBgClass = isEscalado ? "bg-primary" : "bg-secondary/50";
                        const textClass = isEscalado ? "text-primary-foreground" : "";
                        
                        return (
                          <Draggable key={video.id} draggableId={video.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`${cardBgClass} ${textClass} border-l-4 ${cardBorderClass} rounded-lg p-4 group cursor-pointer hover:opacity-90 transition-all ${
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
                                    <p className={`font-medium text-base leading-snug ${isEscalado ? "text-primary-foreground" : ""}`}>
                                      {video.titulo}
                                    </p>
                                    
                                    {getTagsForVideo(video.id).length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {getTagsForVideo(video.id).map((tag) => (
                                          <span
                                            key={tag.id}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isEscalado ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30" : getTagColorClass(tag.cor)}`}
                                          >
                                            {tag.nome}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {video.descricao && (
                                      <p className={`text-sm mt-2 line-clamp-2 ${isEscalado ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                        {video.descricao}
                                      </p>
                                    )}
                                    {video.roteiro && (
                                      <div className="mt-3">
                                        <FileText className={`h-4 w-4 ${isEscalado ? "text-primary-foreground" : "text-blue-500"}`} />
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
                        );
                      })}
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
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Novas ideias de conteúdo</DialogTitle>
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

                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4 pr-8">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Headline</Label>
                    <SlashCommandInput
                      clienteId={clienteId}
                      value={ideia.headline}
                      onValueChange={(val) => updateIdeia(index, "headline", val)}
                      placeholder="Ex: 3 livros para ler (use / para inserir do núcleo)"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Link</Label>
                    <Input
                      value={ideia.link}
                      onChange={(e) => updateIdeia(index, "link", e.target.value)}
                      placeholder="https://..."
                      type="url"
                      className="h-10"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Qual plataforma?</Label>
                    <RadioGroup
                      value={ideia.plataforma}
                      onValueChange={(value) => updateIdeia(index, "plataforma", value)}
                      className="flex gap-4 pt-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="instagram" id={`ig-vertical-${index}`} />
                        <Label htmlFor={`ig-vertical-${index}`} className="flex items-center gap-1 cursor-pointer text-xs">
                          <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                            <Instagram className="h-2.5 w-2.5 text-white" />
                          </div>
                          Instagram
                        </Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="youtube" id={`yt-vertical-${index}`} />
                        <Label htmlFor={`yt-vertical-${index}`} className="flex items-center gap-1 cursor-pointer text-xs">
                          <div className="w-4 h-4 rounded bg-red-600 flex items-center justify-center">
                            <Youtube className="h-2.5 w-2.5 text-white" />
                          </div>
                          Youtube
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Descrição (opcional)</Label>
                    <Textarea
                      value={ideia.descricao}
                      onChange={(e) => updateIdeia(index, "descricao", e.target.value)}
                      placeholder="Descreva a ideia..."
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
            <Button onClick={adicionarIdeias}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Escalar */}
      <Dialog open={showEscalarModal} onOpenChange={(open) => { 
        setShowEscalarModal(open); 
        if (!open) { setEscalarItems([]); setEscalarTabAtivo(0); }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Escalar vídeos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {escalarItems.length > 1 && (
              <div className="flex flex-wrap gap-2 pb-2 border-b">
                {escalarItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => setEscalarTabAtivo(index)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors truncate max-w-[180px] ${
                      escalarTabAtivo === index
                        ? "bg-amber-500 text-white"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}
                  >
                    {item.tituloOriginal.length > 20 
                      ? item.tituloOriginal.substring(0, 20) + "..." 
                      : item.tituloOriginal}
                  </button>
                ))}
              </div>
            )}

            {escalarItems[escalarTabAtivo] && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div>
                  <Label className="text-sm text-muted-foreground">Headline original</Label>
                  <p className="font-medium text-base mt-1">
                    {escalarItems[escalarTabAtivo].tituloOriginal}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Nova headline</Label>
                  <SlashCommandInput
                    clienteId={clienteId}
                    value={escalarItems[escalarTabAtivo].novaHeadline}
                    onValueChange={(val) => updateEscalarHeadline(escalarTabAtivo, val)}
                    placeholder="Digite a nova headline... (use / para inserir do núcleo)"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { 
                setShowEscalarModal(false); 
                setEscalarItems([]); 
                setEscalarTabAtivo(0); 
              }}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSalvarEscalar}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Criar ideias ({escalarItems.length})
              </Button>
            </div>
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
        tags={tags}
        videoTags={editVideoTags}
        onTagToggle={toggleVideoTag}
        platform="vertical"
      />

      {/* Criar Roteiros Modal */}
      <CriarRoteirosModal
        videos={getVideosForRoteiro()}
        open={showCriarRoteirosModal}
        onClose={() => setShowCriarRoteirosModal(false)}
        onComplete={handleCriarRoteirosComplete}
        clienteId={clienteId}
        tableName="videos_vertical"
      />
    </div>
  );
}
