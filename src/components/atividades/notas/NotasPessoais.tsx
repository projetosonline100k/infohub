import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor, type Range } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { supabase } from "@/integrations/supabase/client";
import { DocumentToolbar } from "@/components/documentos/DocumentToolbar";
import { SlashCommand } from "./SlashCommand";
import { AtividadePicker, type AtividadeEncontrada } from "./AtividadePicker";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import "@/components/documentos/editor.css";

// Uma nota só, pessoal, compartilhada por toda a área de Atividades (fora de
// cliente). cliente_id e atividade_id nulos juntos não são usados em nenhum
// outro lugar do app, então servem de identificador natural dessa nota.
export const NotasPessoais = () => {
  const [documentoId, setDocumentoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [pickerAberto, setPickerAberto] = useState(false);
  const pickerContextoRef = useRef<{ editor: Editor; range: Range } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const documentoIdRef = useRef<string | null>(null);

  const abrirPicker = useCallback((ctx: { editor: Editor; range: Range }) => {
    pickerContextoRef.current = ctx;
    setPickerAberto(true);
  }, []);

  const queueSave = useCallback((html: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!documentoIdRef.current) return;
      setSaving(true);
      const { error } = await supabase
        .from("documentos")
        .update({ conteudo: html, updated_at: new Date().toISOString() })
        .eq("id", documentoIdRef.current);
      setSaving(false);
      if (error) {
        console.error("Erro ao salvar notas:", error);
        return;
      }
      setLastSaved(new Date());
    }, 800);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: "Escreva algo, ou digite \"/\" para ver os comandos..." }),
      Link.configure({ openOnClick: true }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand.configure({ abrirPicker }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      queueSave(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    let cancelado = false;

    (async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("id, conteudo")
        .is("cliente_id", null)
        .is("atividade_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelado) return;
      if (error) {
        console.error("Erro ao carregar notas:", error);
        setLoading(false);
        return;
      }

      if (data) {
        documentoIdRef.current = data.id;
        setDocumentoId(data.id);
        if (data.conteudo) editor.commands.setContent(data.conteudo);
        setLoading(false);
        return;
      }

      const { data: criado, error: erroCriar } = await supabase
        .from("documentos")
        .insert({ titulo: "Notas", conteudo: "" })
        .select("id")
        .single();

      if (cancelado) return;
      if (erroCriar) {
        console.error("Erro ao criar notas:", erroCriar);
        setLoading(false);
        return;
      }
      documentoIdRef.current = criado.id;
      setDocumentoId(criado.id);
      setLoading(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [editor]);

  const handleSelecionarAtividade = (atividade: AtividadeEncontrada) => {
    const ctx = pickerContextoRef.current;
    setPickerAberto(false);
    if (!ctx) return;

    const url = atividade.cliente_id
      ? `/clientes/${atividade.cliente_id}?atividade=${atividade.id}`
      : `/atividades?atividade=${atividade.id}`;

    ctx.editor
      .chain()
      .focus()
      .deleteRange(ctx.range)
      .insertContent([
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: url } }],
          text: `📋 ${atividade.titulo}`,
        },
        { type: "text", text: " " },
      ])
      .run();
  };

  const statusTexto = saving ? "Salvando..." : lastSaved ? `Salvo ${formatDistanceToNow(lastSaved, { locale: ptBR, addSuffix: false })}` : "";

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-2 pt-1">
        <DocumentToolbar editor={editor} />
        <span className="text-xs text-muted-foreground pr-2 whitespace-nowrap">{statusTexto}</span>
      </div>

      <div className="bg-muted/30 p-4 sm:p-8 min-h-[500px]">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-24">Carregando notas...</p>
        ) : (
          <div className="max-w-[760px] mx-auto bg-background rounded-lg shadow-sm p-10 min-h-[460px]">
            <EditorContent editor={editor} className="prose prose-lg max-w-none dark:prose-invert document-editor" />
          </div>
        )}
      </div>

      <AtividadePicker open={pickerAberto} onClose={() => setPickerAberto(false)} onSelect={handleSelecionarAtividade} />
    </div>
  );
};
