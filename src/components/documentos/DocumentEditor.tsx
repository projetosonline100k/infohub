import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { ArrowLeft, Star, MoreHorizontal, PanelLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DocumentToolbar } from "./DocumentToolbar";
import { DocumentSidebar } from "./DocumentSidebar";
import { ShareDialog } from "./ShareDialog";
import { PresencaAvatares } from "./PresencaAvatares";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useDocumentoColaboracao } from "@/hooks/useDocumentoColaboracao";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCaracteresSelecao } from "@/hooks/useCaracteresSelecao";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import "./editor.css";

interface DocumentEditorProps {
  documentoId: string;
  onClose: () => void;
}

export function DocumentEditor({ documentoId, onClose }: DocumentEditorProps) {
  // Guardado à parte da prop pra dar pra trocar de guia sem fechar e reabrir
  // o editor inteiro.
  const [docAtualId, setDocAtualId] = useState(documentoId);
  const [titulo, setTitulo] = useState("Documento sem título");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [pastaId, setPastaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  // Só a primeira abertura mostra a tela cheia de carregamento; trocar de
  // guia depois disso é instantâneo (o cabeçalho e a barra lateral não saem
  // do lugar, só o conteúdo troca).
  const primeiraCargaRef = useRef(true);
  const tituloFocadoRef = useRef(false);
  // No celular a barra lateral começa fechada (senão espreme o documento a
  // ponto de quebrar o texto letra por letra) — só decide isso depois que
  // useIsMobile resolve o tamanho real da tela, e só uma vez.
  const sidebarAjustadaRef = useRef(false);
  useEffect(() => {
    if (sidebarAjustadaRef.current) return;
    sidebarAjustadaRef.current = true;
    setShowSidebar(!isMobile);
  }, [isMobile]);

  const { saving, lastSaved, debouncedSave, saveNow } = useAutoSave({
    documentoId: docAtualId,
    debounceMs: 1000,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({
        placeholder: "Comece a escrever...",
      }),
      Link.configure({
        openOnClick: true,
      }),
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getHTML());
    },
  });

  const { total: totalCaracteres, selecionados: caracteresSelecionados } = useCaracteresSelecao(editor);

  // Quem mais está vendo/editando este documento agora, e aplica ao vivo o
  // que essa pessoa salvar (dono, equipe ou convidado de um link).
  const { pessoasOnline } = useDocumentoColaboracao({
    documentoId: docAtualId,
    editor,
    tituloFocadoRef,
    onConteudoRemoto: (novo) => editor?.commands.setContent(novo, { emitUpdate: false }),
    onTituloRemoto: (novo) => setTitulo(novo),
  });

  // Carrega o documento atual (troca de guia dispara de novo, com outro id).
  useEffect(() => {
    async function loadDocument() {
      setLoading(true);
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("id", docAtualId)
        .maybeSingle();

      if (data && !error) {
        setTitulo(data.titulo || "Documento sem título");
        setClienteId(data.cliente_id);
        setPastaId(data.pasta_id);
        if (editor) {
          editor.commands.setContent(data.conteudo || "");
        }
      }
      setLoading(false);
      primeiraCargaRef.current = false;
    }

    if (docAtualId && editor) {
      loadDocument();
    }
  }, [docAtualId, editor]);

  const salvarTitulo = useCallback(async () => {
    await supabase
      .from("documentos")
      .update({ titulo })
      .eq("id", docAtualId);
  }, [titulo, docAtualId]);

  const trocarDocumento = (novoId: string) => {
    if (novoId !== docAtualId) {
      // Salva o que está na tela antes de trocar, sem esperar o debounce.
      if (editor) saveNow(editor.getHTML());
      setDocAtualId(novoId);
    }
    // No celular a barra lateral é uma gaveta por cima do documento — some
    // depois de escolher, senão o usuário teria que fechar na mão.
    if (isMobile) setShowSidebar(false);
  };

  const mudarPasta = async (novaPastaId: string | null) => {
    setPastaId(novaPastaId);
    const { error } = await supabase
      .from("documentos")
      .update({ pasta_id: novaPastaId })
      .eq("id", docAtualId);
    if (error) console.error("Erro ao mudar a pasta do documento:", error);
  };

  const getSaveStatus = () => {
    if (saving) return "Salvando...";
    if (lastSaved) {
      return `Salvo ${formatDistanceToNow(lastSaved, { locale: ptBR, addSuffix: false })}`;
    }
    return "";
  };

  // Só a primeiríssima abertura do editor bloqueia a tela toda; trocar de
  // guia depois disso mantém cabeçalho e barra lateral fixos, só o miolo
  // do documento pisca de leve enquanto o próximo conteúdo chega.
  if (loading && primeiraCargaRef.current) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-2 sm:px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setShowSidebar((v) => !v)}
            title="Mostrar/ocultar guias"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onFocus={() => { tituloFocadoRef.current = true; }}
            onBlur={() => { tituloFocadoRef.current = false; salvarTitulo(); }}
            className="text-lg font-medium border-none bg-transparent shadow-none focus-visible:ring-0 min-w-0 flex-1 sm:max-w-md"
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0 hidden sm:inline-flex">
            <Star className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <PresencaAvatares pessoas={pessoasOnline} />
          <span className="hidden md:inline text-sm text-muted-foreground">{getSaveStatus()}</span>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Compartilhar</span>
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <DocumentToolbar editor={editor} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - painel fixo no desktop, gaveta por cima do documento no celular */}
        {isMobile ? (
          <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
            <SheetContent side="left" className="p-0 w-72">
              <DocumentSidebar
                documentoAtualId={docAtualId}
                tituloAtual={titulo}
                clienteId={clienteId}
                pastaId={pastaId}
                onTrocarDocumento={trocarDocumento}
                onMudarPasta={mudarPasta}
                className="w-full border-r-0"
              />
            </SheetContent>
          </Sheet>
        ) : (
          showSidebar && (
            <DocumentSidebar
              documentoAtualId={docAtualId}
              tituloAtual={titulo}
              clienteId={clienteId}
              pastaId={pastaId}
              onTrocarDocumento={trocarDocumento}
              onMudarPasta={mudarPasta}
            />
          )
        )}

        {/* Editor area - simulates paper */}
        <div className="flex-1 overflow-auto bg-muted/50 p-2 sm:p-4 md:p-8">
          <div
            className={cn(
              "max-w-[816px] mx-auto bg-background shadow-lg min-h-[1056px] rounded-sm transition-opacity duration-150",
              loading && "opacity-40"
            )}
          >
            <div className="p-4 sm:p-8 md:p-16">
              <EditorContent editor={editor} className="prose prose-sm sm:prose-base md:prose-lg max-w-none dark:prose-invert document-editor" />
            </div>
          </div>
          <div className="max-w-[816px] mx-auto px-1 py-2 text-right text-xs text-muted-foreground">
            {caracteresSelecionados > 0 && (
              <span className="mr-2 text-foreground font-medium">
                {caracteresSelecionados.toLocaleString("pt-BR")} selecionados ·
              </span>
            )}
            {totalCaracteres.toLocaleString("pt-BR")} caracteres
          </div>
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        documentoId={docAtualId}
        documentoTitulo={titulo}
        pastaId={pastaId}
      />
    </div>
  );
}
