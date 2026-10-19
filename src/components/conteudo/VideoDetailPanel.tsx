import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Sparkles,
  Star,
  Tag,
  Trash2,
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { SelectionRange } from "./SlashCommandTextarea";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import LinkExt from "@tiptap/extension-link";
import { extensoesEstiloTexto } from "@/lib/tiptapEstiloTexto";
import { ItalicSemAsterisco } from "@/lib/tiptapItalicSemAsterisco";
import { TituloRecolhivel } from "@/lib/tiptapTituloRecolhivel";
import { HeadlineTitulo, MARCA_HEADLINE } from "@/lib/tiptapHeadlineTitulo";
import { DocumentToolbar } from "@/components/documentos/DocumentToolbar";
import { BancoViraisDoc } from "@/components/documentos/BancoViraisDoc";
import { AudioGravado, MicrofoneNoCursor } from "@/components/documentos/AudioNoDocumento";
import { ChatNoDocumento } from "@/components/documentos/ChatNoDocumento";
import "@/components/documentos/editor.css";
import { RoteiroChat } from "./RoteiroChat";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { roteirosNoDocumento, rotuloRoteiros } from "@/lib/conteudo/roteirosNoDocumento";
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
  editado_url?: string | null;
  editado_chave?: string | null;
  editado_nome?: string | null;
  editado_tamanho?: number | null;
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

// Roteiros antigos são texto puro: cada linha vira um parágrafo (HTML já guardado passa direto).
function roteiroParaHtml(texto: string | null | undefined): string {
  const t = texto ?? "";
  if (/<(p|h[1-6]|ul|ol|li|br|strong|em)[\s>/]/i.test(t)) return t;
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("");
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
  const [selectionLength, setSelectionLength] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const folhaRef = useRef<HTMLElement>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedSnapshotRef = useRef("");
  const currentVideoIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editedFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"original" | "editado" | null>(null);
  const isMobile = useIsMobile();
  // No celular a barra de propriedades é uma gaveta por cima do roteiro
  // (senão espreme o texto a ponto de quebrar letra por letra, como
  // aconteceu antes desse ajuste) — só decide isso depois que useIsMobile
  // resolve o tamanho real da tela, e só uma vez.
  // Roteiro em editor de verdade (18/10/2026, Davi: "quando eu escrever Headline, quero em título,
  // em negrito, para conseguir ocultar com a ferramenta de abrir e fechar" e "apertei ⌘H e nada"):
  // o mesmo editor dos Documentos — barra que funciona, títulos recolhíveis, "Headline N" vira
  // título sozinho e ⌘H traz um vídeo do banco de virais. O roteiro passa a ser guardado em HTML.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, italic: false }),
      ItalicSemAsterisco,
      TituloRecolhivel,
      HeadlineTitulo,
      AudioGravado,   // áudio gravado no documento, com transcrição por trechos (18/10)
      UnderlineExt,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Escreva o roteiro… Comece um roteiro com \"Headline 1\" (vira título) e use ⌘H para trazer um vídeo do banco de virais." }),
      LinkExt.configure({ openOnClick: true }),
      ...extensoesEstiloTexto,
    ],
    content: "",
    onUpdate: ({ editor: e }) => setEditedVideo((prev) => (prev ? { ...prev, roteiro: e.getHTML() } : prev)),
    onSelectionUpdate: ({ editor: e }) => {
      const { from, to } = e.state.selection;
      const texto = from === to ? "" : e.state.doc.textBetween(from, to, "\n");
      setSelectionLength(texto.length);
      setSelectionContext(texto ? { text: texto, range: { start: from, end: to } } : null);
    },
  });

  const [showProps, setShowProps] = useState(true);
  const propsAjustadasRef = useRef(false);
  useEffect(() => {
    if (propsAjustadasRef.current) return;
    propsAjustadasRef.current = true;
    setShowProps(!isMobile);
  }, [isMobile]);

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
    setSelectionLength(0);
    lastSavedSnapshotRef.current = JSON.stringify({
      titulo: video.titulo,
      descricao: video.descricao || "",
      roteiro: video.roteiro || "",
      status: video.status,
      data_postagem: video.data_postagem || null,
    });
    setAutoSaveStatus("idle");
  }, [video]);

  const idCarregado = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !editedVideo || idCarregado.current === editedVideo.id) return;
    idCarregado.current = editedVideo.id;
    editor.commands.setContent(roteiroParaHtml(editedVideo.roteiro), { emitUpdate: false });
  }, [editor, editedVideo]);

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
    // No celular a gaveta de propriedades cobre o roteiro; some depois de
    // escolher outro card, senão o usuário teria que fechar na mão.
    if (isMobile) setShowProps(false);
  };

  const handleInsertText = (text: string) => {
    editor?.chain().focus("end").insertContent(roteiroParaHtml(text)).run();
  };

  // range = posições do editor (vindas de onSelectionUpdate).
  const handleReplaceText = (text: string, range: { start: number; end: number }) => {
    editor?.chain().focus().insertContentAt({ from: range.start, to: range.end }, text).run();
    setSelectionContext(null);
  };

  const handleClearSelection = () => {
    setSelectionContext(null);
  };

  const handleVideoUpload = async (file: File, fileKind: "original" | "editado") => {
    if (!editedVideo) return;
    setUploadingKind(fileKind);
    try {
      const { data, error } = await supabase.functions.invoke("backblaze-upload-url", {
        body: {
          videoId: editedVideo.id,
          clienteId: editedVideo.cliente_id,
          platform,
          fileKind,
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

      const fileFields = fileKind === "editado"
        ? {
            editado_url: data.fileUrl,
            editado_chave: data.objectKey,
            editado_nome: file.name,
            editado_tamanho: file.size,
          }
        : {
            arquivo_url: data.fileUrl,
            arquivo_chave: data.objectKey,
            arquivo_nome: file.name,
            arquivo_tamanho: file.size,
          };
      const table = platform === "vertical" ? "videos_vertical" : "videos_youtube";
      const { error: updateError } = await supabase.from(table).update(fileFields).eq("id", editedVideo.id);
      if (updateError) throw updateError;

      setEditedVideo({ ...editedVideo, ...fileFields });
      toast.success(fileKind === "editado" ? "Vídeo editado enviado" : "Vídeo enviado para o Backblaze");
    } catch (error) {
      console.error("Erro no upload do vídeo:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o vídeo");
    } finally {
      setUploadingKind(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (editedFileInputRef.current) editedFileInputRef.current.value = "";
    }
  };

  const handleSelectionChange = (text: string | null, range: SelectionRange | null) => {
    if (text && range) {
      setSelectionContext({ text, range });
    }
  };

  if (!open) return null;


  const saveStatusLabel = (() => {
    if (autoSaveStatus === "saving") return "Salvando...";
    if (autoSaveStatus === "saved") return "Salvo automaticamente";
    if (autoSaveStatus === "error") return "Erro ao salvar";
    return "";
  })();
  const roteiroCharacterCount = editor ? editor.getText().length : (editedVideo.roteiro || "").length;
  const roteirosMarcados = roteirosNoDocumento(editedVideo.roteiro);
  // Pula para o roteiro N (o N-ésimo título "Headline…" do editor) e põe o cursor nele.
  const irParaRoteiro = (indice: number) => {
    if (!editor) return;
    const alvo = Array.from(editor.view.dom.children).filter((el) => MARCA_HEADLINE.test(el.textContent || ""))[indice];
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    try { editor.chain().focus().setTextSelection(editor.view.posAtDOM(alvo, 0)).run(); } catch { /* só rola */ }
  };
  const relatedStatus = relatedVideos.find((relatedVideo) => relatedVideo.id === editedVideo.id)?.status || editedVideo.status;
  const statusLabel = STATUS_OPTIONS.find((option) => option.value === relatedStatus)?.label || relatedStatus;

  // Conteúdo da barra de propriedades: reaproveitado tanto no painel fixo do
  // desktop quanto na gaveta (Sheet) do celular, pra não duplicar o formulário.
  const propriedadesConteudo = (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
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
                if (file) void handleVideoUpload(file, "original");
              }}
            />
            {editedVideo.arquivo_url ? (
              <div className="min-w-0 space-y-2 overflow-hidden rounded-md border p-3">
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="block max-w-full truncate font-medium" title={editedVideo.arquivo_nome || "Vídeo enviado"}>
                      {editedVideo.arquivo_nome || "Vídeo enviado"}
                    </p>
                    {editedVideo.arquivo_tamanho && (
                      <p className="text-xs text-muted-foreground">
                        {(editedVideo.arquivo_tamanho / 1024 / 1024).toFixed(1)} MB
                      </p>
                    )}
                  </div>
                </div>
                <Button asChild type="button" variant="secondary" size="sm" className="w-full gap-2">
                  <a href={editedVideo.arquivo_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Ver vídeo
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={uploadingKind !== null}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingKind === "original" ? "Enviando..." : "Substituir arquivo"}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={uploadingKind !== null}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-4 w-4" />
                {uploadingKind === "original" ? "Enviando vídeo..." : "Enviar vídeo"}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <UploadCloud className="h-3 w-3" /> Editado
            </Label>
            <input
              ref={editedFileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleVideoUpload(file, "editado");
              }}
            />
            {editedVideo.editado_url ? (
              <div className="min-w-0 space-y-2 overflow-hidden rounded-md border p-3">
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="block max-w-full truncate font-medium" title={editedVideo.editado_nome || "Vídeo editado"}>
                      {editedVideo.editado_nome || "Vídeo editado"}
                    </p>
                    {editedVideo.editado_tamanho && (
                      <p className="text-xs text-muted-foreground">
                        {(editedVideo.editado_tamanho / 1024 / 1024).toFixed(1)} MB
                      </p>
                    )}
                  </div>
                </div>
                <Button asChild type="button" variant="secondary" size="sm" className="w-full gap-2">
                  <a href={editedVideo.editado_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Ver vídeo editado
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={uploadingKind !== null}
                  onClick={() => editedFileInputRef.current?.click()}
                >
                  {uploadingKind === "editado" ? "Enviando..." : "Substituir editado"}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={uploadingKind !== null}
                onClick={() => editedFileInputRef.current?.click()}
              >
                <UploadCloud className="h-4 w-4" />
                {uploadingKind === "editado" ? "Enviando editado..." : "Enviar vídeo editado"}
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
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 border-b bg-background shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => void handleClose()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setShowProps((v) => !v)}
            title="Mostrar/ocultar propriedades"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <Input
            value={editedVideo.titulo}
            onChange={(e) => setEditedVideo({ ...editedVideo, titulo: e.target.value })}
            onBlur={() => {
              if (!onAutoSave) handleSave();
            }}
            className="min-w-0 flex-1 border-none bg-transparent text-base sm:text-lg font-medium shadow-none focus-visible:ring-0 sm:max-w-xl"
            placeholder="Título do vídeo"
          />
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex shrink-0 text-muted-foreground">
            <Star className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <span className="hidden lg:inline text-sm text-muted-foreground tabular-nums">
            {selectionLength > 0
              ? `${selectionLength.toLocaleString("pt-BR")} selecionados`
              : `${roteiroCharacterCount.toLocaleString("pt-BR")} caracteres`}
          </span>
          <span className={cn(
            "hidden md:inline text-sm",
            autoSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"
          )}>
            {saveStatusLabel}
          </span>
          <Button
            variant={showChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowChat(!showChat)}
            className="gap-0 sm:gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat IA</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(editedVideo.id)}
            className="shrink-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex shrink-0">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <DocumentToolbar editor={editor} />

      <div className="flex flex-1 overflow-hidden relative">
        {isMobile ? (
          <Sheet open={showProps} onOpenChange={setShowProps}>
            <SheetContent side="left" className="flex w-[320px] max-w-[88vw] flex-col p-0">
              {propriedadesConteudo}
            </SheetContent>
          </Sheet>
        ) : (
          showProps && (
            <aside className="w-[320px] shrink-0 border-r bg-background">
              {propriedadesConteudo}
            </aside>
          )
        )}

        <main ref={folhaRef} className="flex-1 overflow-auto bg-background sm:bg-muted/50 sm:p-4 md:p-8">
          {roteirosMarcados.length > 0 && (
            // Vários roteiros no documento ("Headline 1", "#2"…): índice para pular direto (18/10).
            <div className="sticky top-0 z-10 mx-auto mb-3 flex max-w-[816px] items-center gap-1.5 overflow-x-auto rounded-md border bg-background/95 px-3 py-2 backdrop-blur">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{rotuloRoteiros(roteirosMarcados.length)}:</span>
              {roteirosMarcados.map((r, i) => (
                <button key={`${r.numero}-${i}`} type="button" title={r.titulo} onClick={() => irParaRoteiro(i)}
                  className="flex max-w-[220px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted">
                  <span className="font-bold text-primary">{r.numero}</span>
                  <span className="truncate">{r.titulo || "sem título"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto max-w-[816px] bg-background sm:min-h-[1056px] sm:rounded-sm sm:shadow-lg">
            <div className="flex min-h-[60vh] flex-col px-5 py-6 sm:min-h-[900px] sm:p-8 md:p-16">
<EditorContent editor={editor} className="prose prose-base md:prose-lg max-w-none dark:prose-invert document-editor min-h-[50vh] flex-1 sm:min-h-[900px]" />
              {editor && <BancoViraisDoc editor={editor} clienteId={editedVideo.cliente_id} />}
              {editor && <MicrofoneNoCursor editor={editor} />}
              {editor && <ChatNoDocumento editor={editor} clienteId={editedVideo.cliente_id} />}
            </div>
          </div>
        </main>

        {showChat && (
          isMobile ? (
            <Sheet open={showChat} onOpenChange={setShowChat}>
              <SheetContent side="right" className="flex w-full flex-col p-0">
                <RoteiroChat
                  clienteId={editedVideo.cliente_id}
                  titulo={editedVideo.titulo}
                  descricao={editedVideo.descricao || ""}
                  onInsertText={handleInsertText}
                  onReplaceText={handleReplaceText}
                  onClearSelection={handleClearSelection}
                  selectedContext={selectionContext ? { text: selectionContext.text, range: selectionContext.range } : undefined}
                />
              </SheetContent>
            </Sheet>
          ) : (
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
          )
        )}
      </div>
    </div>
  );
};
