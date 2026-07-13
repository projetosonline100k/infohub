import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  GripVertical,
  Plus,
  Target,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VideoDetailPanel } from "./VideoDetailPanel";

interface CronogramaViewProps {
  clienteId: string;
}

type Platform = "vertical" | "youtube";
type ViewMode = "mes" | "semana" | "lista";

interface ScheduledVideo {
  id: string;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  roteiro: string | null;
  status: string;
  ordem: number;
  data_postagem: string | null;
  platform: Platform;
}

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PLATFORM_STYLES: Record<Platform, { label: string; badge: string }> = {
  vertical: {
    label: "Vertical",
    badge: "border-cyan-500/40 text-cyan-400",
  },
  youtube: {
    label: "YouTube",
    badge: "border-red-500/40 text-red-400",
  },
};

const STATUS_STYLES: Record<string, { label: string; border: string; bg: string; hover: string; text: string; badge: string }> = {
  gravacao: {
    label: "Em gravação",
    border: "border-l-purple-500",
    bg: "bg-purple-500/15",
    hover: "hover:bg-purple-500/20",
    text: "text-purple-400",
    badge: "border-purple-500/40 text-purple-400",
  },
  edicao: {
    label: "Em edição",
    border: "border-l-cyan-500",
    bg: "bg-cyan-500/15",
    hover: "hover:bg-cyan-500/20",
    text: "text-cyan-400",
    badge: "border-cyan-500/40 text-cyan-400",
  },
  pronto: {
    label: "Pronto para postar",
    border: "border-l-yellow-500",
    bg: "bg-yellow-500/15",
    hover: "hover:bg-yellow-500/20",
    text: "text-yellow-400",
    badge: "border-yellow-500/40 text-yellow-400",
  },
  postado: {
    label: "Postado",
    border: "border-l-emerald-500",
    bg: "bg-emerald-500/15",
    hover: "hover:bg-emerald-500/20",
    text: "text-emerald-400",
    badge: "border-emerald-500/40 text-emerald-400",
  },
};

const SIDEBAR_GROUPS = [
  { status: "pronto", title: "Pronto para postar", droppableId: "ready-list" },
  { status: "edicao", title: "Em edição", droppableId: "editing-list" },
  { status: "gravacao", title: "Em gravação", droppableId: "recording-list" },
];

const getDraggableId = (video: ScheduledVideo) => `${video.platform}:${video.id}`;
const getFollowerGoalStorageKey = (clienteId: string) => `cronograma_followers_goal:${clienteId}`;

const formatNumber = (value: number) => value.toLocaleString("pt-BR");

const parseNumberInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
};

const parseDraggableId = (draggableId: string) => {
  const [platform, id] = draggableId.split(":") as [Platform, string];
  return { platform, id };
};

export function CronogramaView({ clienteId }: CronogramaViewProps) {
  const [videos, setVideos] = useState<ScheduledVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("mes");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showNewIdeaDialog, setShowNewIdeaDialog] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaDescription, setNewIdeaDescription] = useState("");
  const [newIdeaPlatform, setNewIdeaPlatform] = useState<Platform>("vertical");
  const [actionVideo, setActionVideo] = useState<ScheduledVideo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ScheduledVideo | null>(null);
  const [currentFollowersInput, setCurrentFollowersInput] = useState("3.527");
  const [followerGoalInput, setFollowerGoalInput] = useState("10.000");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchVideos();
  }, [clienteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedGoal = window.localStorage.getItem(getFollowerGoalStorageKey(clienteId));
    if (!storedGoal) return;

    try {
      const parsedGoal = JSON.parse(storedGoal) as { current?: number; goal?: number };
      if (typeof parsedGoal.current === "number") {
        setCurrentFollowersInput(formatNumber(parsedGoal.current));
      }
      if (typeof parsedGoal.goal === "number") {
        setFollowerGoalInput(formatNumber(parsedGoal.goal));
      }
    } catch (error) {
      console.error("Erro ao carregar meta de seguidores:", error);
    }
  }, [clienteId]);

  const fetchVideos = async () => {
    setLoading(true);

    const [verticalResult, youtubeResult] = await Promise.all([
      supabase
        .from("videos_vertical")
        .select("id,cliente_id,titulo,descricao,roteiro,status,ordem,data_postagem")
        .eq("cliente_id", clienteId)
        .in("status", ["gravacao", "edicao", "pronto", "postado"])
        .order("ordem"),
      supabase
        .from("videos_youtube")
        .select("id,cliente_id,titulo,descricao,roteiro,status,ordem,data_postagem")
        .eq("cliente_id", clienteId)
        .in("status", ["gravacao", "edicao", "pronto", "postado"])
        .order("ordem"),
    ]);

    if (verticalResult.error || youtubeResult.error) {
      toast.error("Erro ao carregar cronograma");
      setLoading(false);
      return;
    }

    const verticalVideos = (verticalResult.data || []).map((video) => ({
      ...video,
      platform: "vertical" as const,
    }));
    const youtubeVideos = (youtubeResult.data || []).map((video) => ({
      ...video,
      platform: "youtube" as const,
    }));

    setVideos([...verticalVideos, ...youtubeVideos]);
    setLoading(false);
  };

  const unscheduledVideosByStatus = useMemo(
    () => SIDEBAR_GROUPS.reduce<Record<string, ScheduledVideo[]>>((groups, group) => {
      groups[group.status] = videos.filter((video) => video.status === group.status && !video.data_postagem);
      return groups;
    }, {}),
    [videos]
  );

  const scheduledVideos = useMemo(
    () => videos.filter((video) => Boolean(video.data_postagem)),
    [videos]
  );

  const monthDays = useMemo(() => {
    const firstDay = startOfWeek(startOfMonth(referenceDate), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  }, [referenceDate]);

  const weekDays = useMemo(() => {
    const firstDay = startOfWeek(referenceDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
  }, [referenceDate]);

  const calendarDays = viewMode === "semana" ? weekDays : monthDays;

  const currentMonthScheduled = scheduledVideos.filter((video) => {
    if (!video.data_postagem) return false;
    return isSameMonth(parseISO(video.data_postagem), referenceDate);
  });

  const currentWeekScheduled = scheduledVideos.filter((video) => {
    if (!video.data_postagem) return false;
    return isSameWeek(parseISO(video.data_postagem), referenceDate, { weekStartsOn: 0 });
  });

  const postedCount = videos.filter((video) => video.status === "postado").length;
  const currentFollowers = parseNumberInput(currentFollowersInput);
  const followerGoal = parseNumberInput(followerGoalInput);
  const followerProgress = followerGoal > 0
    ? Math.min(Math.round((currentFollowers / followerGoal) * 100), 100)
    : 0;

  const getVideosForDay = (day: Date) =>
    scheduledVideos
      .filter((video) => video.data_postagem && isSameDay(parseISO(video.data_postagem), day))
      .sort((a, b) => a.ordem - b.ordem);

  const handlePrevious = () => {
    setReferenceDate((current) => viewMode === "semana" ? subWeeks(current, 1) : subMonths(current, 1));
  };

  const handleNext = () => {
    setReferenceDate((current) => viewMode === "semana" ? addWeeks(current, 1) : addMonths(current, 1));
  };

  const handleToday = () => {
    setReferenceDate(new Date());
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  const updateVideoSchedule = async (video: ScheduledVideo, date: string | null) => {
    const tableName = video.platform === "vertical" ? "videos_vertical" : "videos_youtube";
    const { error } = await supabase
      .from(tableName)
      .update({ data_postagem: date })
      .eq("id", video.id);

    if (error) throw error;
  };

  const updateVideo = async (video: ScheduledVideo) => {
    const tableName = video.platform === "vertical" ? "videos_vertical" : "videos_youtube";
    const { error } = await supabase
      .from(tableName)
      .update({
        titulo: video.titulo,
        descricao: video.descricao || null,
        roteiro: video.roteiro || null,
        status: video.status,
        data_postagem: video.data_postagem || null,
      })
      .eq("id", video.id);

    if (error) throw error;

    setVideos((current) =>
      current.map((item) =>
        item.id === video.id && item.platform === video.platform ? { ...item, ...video } : item
      )
    );
    setSelectedVideo(video);
  };

  const handleSaveVideo = async (video: ScheduledVideo) => {
    try {
      await updateVideo(video);
      setSelectedVideo(null);
      toast.success("Vídeo salvo");
    } catch (error) {
      console.error("Erro ao salvar vídeo:", error);
      toast.error("Erro ao salvar vídeo");
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!selectedVideo) return;

    const tableName = selectedVideo.platform === "vertical" ? "videos_vertical" : "videos_youtube";
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", videoId);

    if (error) {
      toast.error("Erro ao excluir vídeo");
      return;
    }

    setVideos((current) =>
      current.filter((item) => !(item.id === videoId && item.platform === selectedVideo.platform))
    );
    setSelectedVideo(null);
    toast.success("Vídeo excluído");
  };

  const handleMarkAsPosted = async (video: ScheduledVideo) => {
    const updatedVideo = { ...video, status: "postado" };
    const tableName = video.platform === "vertical" ? "videos_vertical" : "videos_youtube";

    const { error } = await supabase
      .from(tableName)
      .update({ status: "postado" })
      .eq("id", video.id);

    if (error) {
      toast.error("Erro ao marcar como postado");
      return;
    }

    setVideos((current) =>
      current.map((item) =>
        item.id === video.id && item.platform === video.platform ? updatedVideo : item
      )
    );
    setActionVideo(null);
    toast.success("Marcado como postado");
  };

  const handleFollowerInputBlur = () => {
    const current = parseNumberInput(currentFollowersInput);
    const goal = parseNumberInput(followerGoalInput);

    setCurrentFollowersInput(formatNumber(current));
    setFollowerGoalInput(formatNumber(goal));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        getFollowerGoalStorageKey(clienteId),
        JSON.stringify({ current, goal })
      );
    }
  };

  const handleCreateIdea = async () => {
    const title = newIdeaTitle.trim();
    if (!title) return;

    const tableName = newIdeaPlatform === "vertical" ? "videos_vertical" : "videos_youtube";
    const { error } = await supabase
      .from(tableName)
      .insert({
        cliente_id: clienteId,
        titulo: title,
        descricao: newIdeaDescription.trim() || null,
        status: "pronto",
        ordem: (unscheduledVideosByStatus.pronto || []).filter((video) => video.platform === newIdeaPlatform).length + 1,
      });

    if (error) {
      toast.error("Erro ao criar ideia");
      return;
    }

    setNewIdeaTitle("");
    setNewIdeaDescription("");
    setShowNewIdeaDialog(false);
    toast.success("Ideia criada");
    fetchVideos();
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const destinationId = result.destination.droppableId;
    if (!destinationId.startsWith("day:")) return;

    const { platform, id } = parseDraggableId(result.draggableId);
    const video = videos.find((item) => item.id === id && item.platform === platform);
    if (!video) return;

    const targetDate = destinationId.replace("day:", "");
    const previousVideos = videos;

    setVideos((current) =>
      current.map((item) =>
        item.id === id && item.platform === platform
          ? { ...item, data_postagem: targetDate }
          : item
      )
    );

    try {
      await updateVideoSchedule(video, targetDate);
      toast.success("Publicação agendada");
    } catch (error) {
      console.error("Erro ao agendar publicação:", error);
      setVideos(previousVideos);
      toast.error("Erro ao agendar publicação");
    }
  };

  const renderVideoCard = (video: ScheduledVideo, index: number, compact = false) => {
    const platformStyle = PLATFORM_STYLES[video.platform];
    const statusStyle = STATUS_STYLES[video.status] || STATUS_STYLES.pronto;

    return (
      <Draggable key={getDraggableId(video)} draggableId={getDraggableId(video)} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            onClick={() => {
              if (video.data_postagem) {
                setActionVideo(video);
              }
            }}
            className={cn(
              "rounded-md border-l-2 bg-secondary/60 transition-all",
              statusStyle.border,
              statusStyle.bg,
              compact ? "p-2" : "p-3",
              video.data_postagem && "cursor-pointer hover:bg-secondary/80",
              statusStyle.hover,
              snapshot.isDragging && "shadow-lg ring-2 ring-primary"
            )}
          >
            <div className="flex items-start gap-2">
              <div
                {...provided.dragHandleProps}
                className="mt-0.5 shrink-0 cursor-grab text-muted-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                {video.data_postagem && compact && (
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <p className={cn(
                      "text-[11px] font-medium",
                      statusStyle.text
                    )}>
                      {statusStyle.label}
                    </p>
                    {video.platform === "youtube" && (
                      <Youtube className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                  </div>
                )}
                <p className={cn(
                  "whitespace-normal break-words font-medium leading-snug",
                  compact ? "line-clamp-3 text-xs" : "text-sm"
                )}>
                  {video.titulo}
                </p>
                {!compact && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 py-0 text-[10px]",
                        statusStyle.badge
                      )}
                    >
                      {statusStyle.label}
                    </Badge>
                    <Badge variant="outline" className={cn("h-5 gap-1 px-1.5 py-0 text-[10px]", platformStyle.badge)}>
                      {video.platform === "youtube" && <Youtube className="h-3 w-3" />}
                      {platformStyle.label}
                    </Badge>
                    {video.roteiro && <FileText className="h-3.5 w-3.5 text-blue-500" />}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  const renderCalendar = () => (
    <div className="w-full overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-card">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="border-r px-3 py-2 text-right text-sm font-semibold last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", viewMode === "semana" ? "min-h-[520px]" : "min-h-[720px]")}>
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayVideos = getVideosForDay(day);

          return (
            <Droppable key={dateKey} droppableId={`day:${dateKey}`}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "min-h-[110px] border-b border-r p-1.5 last:border-r-0",
                    !isSameMonth(day, referenceDate) && viewMode === "mes" && "bg-muted/20 text-muted-foreground/50",
                    isToday(day) && "bg-primary/5",
                    snapshot.isDraggingOver && "bg-primary/10"
                  )}
                >
                  <div className="mb-2 flex justify-end">
                    <span className={cn(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-medium",
                      isToday(day) && "bg-primary text-primary-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dayVideos.map((video, index) => renderVideoCard(video, index, true))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </div>
  );

  const renderList = () => {
    const sortedVideos = [...scheduledVideos].sort((a, b) =>
      (a.data_postagem || "").localeCompare(b.data_postagem || "")
    );

    return (
      <Droppable droppableId="scheduled-list" isDropDisabled>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
            {sortedVideos.map((video, index) => (
              <div key={getDraggableId(video)} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {video.data_postagem
                    ? format(parseISO(video.data_postagem), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : "Sem data"}
                </div>
                {renderVideoCard(video, index)}
              </div>
            ))}
            {provided.placeholder}
            {sortedVideos.length === 0 && (
              <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                Nenhuma publicação agendada
              </div>
            )}
          </div>
        )}
      </Droppable>
    );
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center">Carregando...</div>;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Cronograma de Postagens</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Hoje
            </Button>
            <div className="flex overflow-hidden rounded-md border">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="gap-2">
              <Calendar className="h-4 w-4" />
              {format(referenceDate, "MMMM 'de' yyyy", { locale: ptBR })}
              <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="flex overflow-hidden rounded-md border">
              {(["mes", "semana", "lista"] as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-9 rounded-none capitalize"
                  onClick={() => setViewMode(mode)}
                >
                  {mode === "mes" ? "Mês" : mode}
                </Button>
              ))}
            </div>
            <Button size="sm" className="gap-2" onClick={() => setShowNewIdeaDialog(true)}>
              <Plus className="h-4 w-4" />
              Nova ideia
            </Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_230px]">
          <aside className="rounded-lg border bg-card p-3">
            <div className="max-h-[720px] space-y-5 overflow-y-auto pr-1">
              {SIDEBAR_GROUPS.map((group) => {
                const groupVideos = unscheduledVideosByStatus[group.status] || [];
                const statusStyle = STATUS_STYLES[group.status] || STATUS_STYLES.pronto;
                const isOpen = openGroups[group.status] === true;

                return (
                  <section key={group.status} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.status)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 text-sm font-semibold">
                        {group.title}
                      </span>
                      <span className={cn("text-sm font-bold", statusStyle.text)}>
                        {groupVideos.length}
                      </span>
                    </button>

                    {isOpen && (
                      <Droppable droppableId={group.droppableId} isDropDisabled>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="space-y-2"
                          >
                            {groupVideos.map((video, index) => renderVideoCard(video, index))}
                            {provided.placeholder}
                            {groupVideos.length === 0 && (
                              <p className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
                                Nenhum card
                              </p>
                            )}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </section>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 overflow-hidden">
            {viewMode === "lista" ? renderList() : renderCalendar()}
          </main>

          <aside className="space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Target className="h-4 w-4" />
                Meta de Seguidores
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="current-followers" className="text-xs text-muted-foreground">
                    Atual
                  </Label>
                  <Input
                    id="current-followers"
                    value={currentFollowersInput}
                    onChange={(event) => setCurrentFollowersInput(event.target.value)}
                    onBlur={handleFollowerInputBlur}
                    inputMode="numeric"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="follower-goal" className="text-xs text-muted-foreground">
                    Meta
                  </Label>
                  <Input
                    id="follower-goal"
                    value={followerGoalInput}
                    onChange={(event) => setFollowerGoalInput(event.target.value)}
                    onBlur={handleFollowerInputBlur}
                    inputMode="numeric"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="my-5 flex justify-center">
                <div
                  className="grid h-28 w-28 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) ${followerProgress * 3.6}deg, hsl(var(--muted)) 0deg)`,
                  }}
                >
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-card text-xl font-bold">
                    {followerProgress}%
                  </div>
                </div>
              </div>
              <p className="text-center text-sm font-medium">
                {formatNumber(currentFollowers)} / {formatNumber(followerGoal)} seguidores
              </p>
              <div className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                <p>Faltam {formatNumber(Math.max(followerGoal - currentFollowers, 0))} seguidores</p>
                <p>Meta deste mês</p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h4 className="mb-4 font-semibold">Resumo do Mês</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{currentMonthScheduled.length}</p>
                    <p className="text-xs text-muted-foreground">Agendadas</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{currentWeekScheduled.length}</p>
                    <p className="text-xs text-muted-foreground">Esta semana</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{postedCount}</p>
                    <p className="text-xs text-muted-foreground">Publicadas</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <Dialog open={showNewIdeaDialog} onOpenChange={setShowNewIdeaDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova ideia</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(["vertical", "youtube"] as Platform[]).map((platform) => (
                  <Button
                    key={platform}
                    type="button"
                    variant={newIdeaPlatform === platform ? "default" : "outline"}
                    onClick={() => setNewIdeaPlatform(platform)}
                  >
                    {PLATFORM_STYLES[platform].label}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cronograma-title">Título</Label>
                <Input
                  id="cronograma-title"
                  value={newIdeaTitle}
                  onChange={(event) => setNewIdeaTitle(event.target.value)}
                  placeholder="Headline do vídeo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cronograma-description">Descrição</Label>
                <Textarea
                  id="cronograma-description"
                  value={newIdeaDescription}
                  onChange={(event) => setNewIdeaDescription(event.target.value)}
                  placeholder="Observações rápidas"
                  className="min-h-[96px] resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewIdeaDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateIdea}>
                  Criar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!actionVideo} onOpenChange={(open) => !open && setActionVideo(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>O que deseja fazer?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {actionVideo?.titulo}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!actionVideo) return;
                    setSelectedVideo(actionVideo);
                    setActionVideo(null);
                  }}
                >
                  Abrir
                </Button>
                <Button
                  onClick={() => {
                    if (actionVideo) void handleMarkAsPosted(actionVideo);
                  }}
                >
                  Postado
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <VideoDetailPanel
          video={selectedVideo}
          open={!!selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onSave={(video) => void handleSaveVideo(video as ScheduledVideo)}
          onAutoSave={(video) => updateVideo(video as ScheduledVideo)}
          onDelete={handleDeleteVideo}
          relatedVideos={selectedVideo ? getVideosForDay(parseISO(selectedVideo.data_postagem || format(new Date(), "yyyy-MM-dd"))) : []}
          onSelectVideo={(video) => setSelectedVideo(video as ScheduledVideo)}
          tags={[]}
          videoTags={[]}
          onTagToggle={() => {}}
          platform={selectedVideo?.platform || "vertical"}
        />
      </div>
    </DragDropContext>
  );
}
