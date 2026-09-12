import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { ArrowLeft, Star, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentToolbar } from "./DocumentToolbar";
import { DocumentSidebar } from "./DocumentSidebar";
import { useAutoSave } from "@/hooks/useAutoSave";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  const [showSidebar, setShowSidebar] = useState(true);

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
    if (novoId === docAtualId) return;
    // Salva o que está na tela antes de trocar, sem esperar o debounce.
    if (editor) saveNow(editor.getHTML());
    setDocAtualId(novoId);
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

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            className="text-lg font-medium border-none bg-transparent shadow-none focus-visible:ring-0 max-w-md"
          />
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Star className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{getSaveStatus()}</span>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <DocumentToolbar editor={editor} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <DocumentSidebar
            documentoAtualId={docAtualId}
            tituloAtual={titulo}
            clienteId={clienteId}
            pastaId={pastaId}
            onTrocarDocumento={trocarDocumento}
            onMudarPasta={mudarPasta}
          />
        )}

        {/* Editor area - simulates paper */}
        <div className="flex-1 overflow-auto bg-muted/50 p-8">
          <div className="max-w-[816px] mx-auto bg-background shadow-lg min-h-[1056px] rounded-sm">
            <div className="p-16">
              <EditorContent editor={editor} className="prose prose-lg max-w-none dark:prose-invert document-editor" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
